import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createAnnouncementPushHandler } from "../../../../supabase/functions/send-announcement-push/handler";

// RUN_ANNOUNCEMENT_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run announcements.integration.test.ts
const suite = describe.skipIf(process.env.RUN_ANNOUNCEMENT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue57-${run}-${name}@example.test`;
const clients: Record<string, SupabaseClient> = {};
const authIds: string[] = [];
let service: SupabaseClient;
let groupId: string;
let serviceKey: string;
const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
  input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();

suite("anuncios con Auth/PostgREST y cola real", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo se admite Supabase local");
    if (sql("select count(*) from app_private.announcement_push_deliveries where status in ('PENDING','AWAITING_RECEIPT')") !== "0") {
      throw new Error("La integración requiere una cola local sin envíos pendientes ajenos a sus fixtures");
    }
    serviceKey = config.SERVICE_ROLE_KEY;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    service = createClient(config.API_URL, serviceKey, options);
    for (const name of ["owner", "member", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo crear usuario sintético");
      authIds.push(created.data.user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo autenticar usuario sintético");
      clients[name] = client;
    }
    const group = await clients.owner!.rpc("create_group", { p_name: "Anuncios integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("member")}';`);
  }, 30_000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue57-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    sql(`delete from app_private.announcement_push_deliveries where user_id in (${users}) or announcement_id in (select id from public.group_announcements where group_id in (${groups}));
      delete from public.group_announcements where group_id in (${groups});
      delete from public.push_tokens where user_id in (${users});
      delete from public.announcement_push_preferences where user_id in (${users});
      delete from public.memberships where group_id in (${groups});
      delete from app_private.billing_legacy_groups where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from public.users where id in (${users});`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("publica/editable/borrado visible por HTTP, aislamiento y error 409", async () => {
    const id = randomUUID();
    const owner = clients.owner!; const member = clients.member!; const outsider = clients.outsider!;
    const args = { p_group_id: groupId, p_request_id: id, p_title: "Cambio de horario", p_body: "Entrenamiento a las 19:00" };
    expect((await owner.rpc("publish_group_announcement", args)).error).toBeNull();
    expect((await owner.rpc("publish_group_announcement", args)).error).toBeNull();
    const wall = await member.rpc("list_group_announcements", { p_group_id: groupId });
    expect(wall.error).toBeNull(); expect(wall.data).toHaveLength(1);
    expect(Object.keys(wall.data[0]).sort()).toEqual(["id", "group_id", "title", "body", "created_at", "updated_at", "total_count"].sort());
    const version = wall.data[0].updated_at;
    expect((await outsider.rpc("list_group_announcements", { p_group_id: groupId })).status).toBe(404);
    expect((await outsider.from("group_announcements").select("id,title").eq("id", id)).data).toEqual([]);
    expect((await member.rpc("publish_group_announcement", { ...args, p_request_id: randomUUID() })).status).toBe(403);
    expect((await member.from("group_announcements").update({ title: "Ataque" }).eq("id", id)).status).toBe(403);
    const edit = { p_group_id: groupId, p_announcement_id: id, p_title: "Horario corregido", p_body: "A las 20:00", p_updated_at: version };
    expect((await owner.rpc("update_group_announcement", edit)).error).toBeNull();
    expect((await owner.rpc("update_group_announcement", edit)).status).toBe(409);
    const updated = (await member.rpc("list_group_announcements", { p_group_id: groupId })).data[0];
    expect(updated.body).toBe("A las 20:00");
    expect((await owner.rpc("delete_group_announcement", { p_group_id: groupId, p_announcement_id: id, p_updated_at: updated.updated_at })).error).toBeNull();
    expect((await member.rpc("list_group_announcements", { p_group_id: groupId })).data).toEqual([]);
  });
  it("fanout opt-in → worker → ticket → recibo, sin duplicar publicación ni trabajo completado", async () => {
    const token = `ExpoPushToken[${run}]`;
    const member = clients.member!; const owner = clients.owner!;
    expect((await member.rpc("register_announcement_push_token", { p_token: token, p_platform: "ANDROID" })).error).toBeNull();
    expect((await member.rpc("set_announcement_push_enabled", { p_enabled: true })).error).toBeNull();
    const id = randomUUID(); const args = { p_group_id: groupId, p_request_id: id, p_title: "Título privado", p_body: "Cuerpo privado" };
    expect((await owner.rpc("publish_group_announcement", args)).error).toBeNull();
    expect((await owner.rpc("publish_group_announcement", args)).error).toBeNull();
    expect(sql(`select count(*) from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("1");
    expect((await member.rpc("claim_announcement_push", { p_receipts: false })).status).toBe(403);
    const calls: { url: string; body: string }[] = [];
    const send: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body as string });
      return Response.json(String(url).endsWith("getReceipts") ? { data: { synthetic: { status: "ok" } } } : { data: { status: "ok", id: "synthetic" } });
    };
    const handler = createAnnouncementPushHandler({ client: service, serviceRoleKey: serviceKey, send });
    const request = () => new Request("http://localhost/worker", { method: "POST", headers: { Authorization: `Bearer ${serviceKey}` } });
    expect((await handler(request())).status).toBe(200);
    expect(calls).toHaveLength(1); expect(calls[0]!.body).not.toContain("privado");
    expect(sql(`select status from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("AWAITING_RECEIPT");
    expect((await handler(request())).status).toBe(200); expect(calls).toHaveLength(1);
    sql(`update app_private.announcement_push_deliveries set next_attempt_at=now() where announcement_id='${id}'`);
    expect((await handler(request())).status).toBe(200); expect(calls).toHaveLength(2);
    expect(sql(`select status from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("DELIVERED");
    expect((await handler(request())).status).toBe(200); expect(calls).toHaveLength(2);
    expect((await member.rpc("set_announcement_push_enabled", { p_enabled: false })).error).toBeNull();
    const optedOut = randomUUID();
    expect((await owner.rpc("publish_group_announcement", { ...args, p_request_id: optedOut })).error).toBeNull();
    expect(sql(`select count(*) from app_private.announcement_push_deliveries where announcement_id='${optedOut}'`)).toBe("0");
  });
});
