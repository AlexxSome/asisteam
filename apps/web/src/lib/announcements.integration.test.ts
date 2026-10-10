import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { nativeAnnouncementTick } from "../../test/native-persistence.mjs";

// RUN_ANNOUNCEMENT_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run announcements.integration.test.ts
const suite = describe.skipIf(process.env.RUN_ANNOUNCEMENT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue57-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
const authIds: string[] = [];
let service: NativePersistenceClient;
let groupId: string;
let serviceKey: string;
const sql = nativeSql;

suite("anuncios con Auth/SQL/RLS y cola real", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
    if (sql("select count(*) from app_private.announcement_push_deliveries where status in ('PENDING','AWAITING_RECEIPT')") !== "0") {
      throw new Error("La integración requiere una cola local sin envíos pendientes ajenos a sus fixtures");
    }
    serviceKey = config.OPERATOR_TOKEN;
      service = createNativeClient(config.API_ORIGIN, serviceKey);
    for (const name of ["owner", "member", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo crear usuario sintético");
      authIds.push(created.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo autenticar usuario sintético");
      clients[name] = client;
    }
    const group = await clients.owner!.operation("create_group", { p_name: "Anuncios integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("member")}';`);
  }, 30_000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("publica/editable/borrado visible por HTTP, aislamiento y error 409", async () => {
    const id = randomUUID();
    const owner = clients.owner!; const member = clients.member!; const outsider = clients.outsider!;
    const args = { p_group_id: groupId, p_request_id: id, p_title: "Cambio de horario", p_body: "Entrenamiento a las 19:00" };
    expect((await owner.operation("publish_group_announcement", args)).error).toBeNull();
    expect((await owner.operation("publish_group_announcement", args)).error).toBeNull();
    const wall = await member.operation("list_group_announcements", { p_group_id: groupId });
    expect(wall.error).toBeNull(); expect(wall.data).toHaveLength(1);
    expect(Object.keys(wall.data[0]).sort()).toEqual(["id", "group_id", "title", "body", "created_at", "updated_at", "total_count"].sort());
    const version = wall.data[0].updated_at;
    expect((await outsider.operation("list_group_announcements", { p_group_id: groupId })).status).toBe(404);
    expect((await outsider.sqlTable("group_announcements").select("id,title").eq("id", id)).data).toEqual([]);
    expect((await member.operation("publish_group_announcement", { ...args, p_request_id: randomUUID() })).status).toBe(403);
    expect((await member.sqlTable("group_announcements").update({ title: "Ataque" }).eq("id", id)).status).toBe(403);
    const edit = { p_group_id: groupId, p_announcement_id: id, p_title: "Horario corregido", p_body: "A las 20:00", p_updated_at: version };
    expect((await owner.operation("update_group_announcement", edit)).error).toBeNull();
    expect((await owner.operation("update_group_announcement", edit)).status).toBe(409);
    const updated = (await member.operation("list_group_announcements", { p_group_id: groupId })).data[0];
    expect(updated.body).toBe("A las 20:00");
    expect((await owner.operation("delete_group_announcement", { p_group_id: groupId, p_announcement_id: id, p_updated_at: updated.updated_at })).error).toBeNull();
    expect((await member.operation("list_group_announcements", { p_group_id: groupId })).data).toEqual([]);
  });
  it("fanout opt-in → worker → ticket → recibo, sin duplicar publicación ni trabajo completado", async () => {
    const token = `ExpoPushToken[${run}]`;
    const member = clients.member!; const owner = clients.owner!;
    expect((await member.operation("register_announcement_push_token", { p_token: token, p_platform: "ANDROID" })).error).toBeNull();
    expect((await member.operation("set_announcement_push_enabled", { p_enabled: true })).error).toBeNull();
    const id = randomUUID(); const args = { p_group_id: groupId, p_request_id: id, p_title: "Título privado", p_body: "Cuerpo privado" };
    expect((await owner.operation("publish_group_announcement", args)).error).toBeNull();
    expect((await owner.operation("publish_group_announcement", args)).error).toBeNull();
    expect(sql(`select count(*) from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("1");
    expect((await member.sqlFunction("claim_announcement_push", { p_receipts: false })).status).toBe(403);
    const calls: { url: string; body: string }[] = [];
    const send: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body as string });
      return Response.json(String(url).endsWith("getReceipts") ? { data: { synthetic: { status: "ok" } } } : { data: { status: "ok", id: "synthetic" } });
    };
    const tick = () => nativeAnnouncementTick(send);
    expect((await tick()).status).toBe(200);
    expect(calls).toHaveLength(1); expect(calls[0]!.body).not.toContain("privado");
    expect(sql(`select status from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("AWAITING_RECEIPT");
    expect((await tick()).status).toBe(200); expect(calls).toHaveLength(1);
    sql(`update app_private.announcement_push_deliveries set next_attempt_at=now() where announcement_id='${id}'`);
    expect((await tick()).status).toBe(200); expect(calls).toHaveLength(2);
    expect(sql(`select status from app_private.announcement_push_deliveries where announcement_id='${id}'`)).toBe("DELIVERED");
    expect((await tick()).status).toBe(200); expect(calls).toHaveLength(2);
    expect((await member.operation("set_announcement_push_enabled", { p_enabled: false })).error).toBeNull();
    const optedOut = randomUUID();
    expect((await owner.operation("publish_group_announcement", { ...args, p_request_id: optedOut })).error).toBeNull();
    expect(sql(`select count(*) from app_private.announcement_push_deliveries where announcement_id='${optedOut}'`)).toBe("0");
  });
});
