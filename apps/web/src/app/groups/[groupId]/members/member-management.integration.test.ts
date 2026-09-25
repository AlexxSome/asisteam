import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const suite = describe.skipIf(process.env.RUN_MEMBER_MANAGEMENT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue34-${run}-${name}@example.test`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const authIds: string[] = [];
const clients: SupabaseClient[] = [];
let service: SupabaseClient;
let groupId: string;
let mainAdmin: string;
let otherAdmin: string;
const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
suite("Gestión de integrantes: HTTP y concurrencia", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["admin", "second", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(account.data.user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients.push(client);
    }
    const group = await clients[0]!.rpc("create_group", { p_name: "Club gestión integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    mainAdmin = sql(`select id from public.memberships where group_id='${groupId}' and role='ADMIN';`);
    otherAdmin = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
      select id,'${groupId}','ADMIN','ACTIVE',now() from public.users where email='${email("second")}' returning id;`).split("\n")[0]!;
  }, 30_000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue34-${run}-%@example.test'`;
    // Únicamente fixtures sintéticos creados en esta ejecución local.
    sql(`begin; set local session_replication_role=replica;
      delete from public.attendance_records where membership_id in (select id from public.memberships where group_id='${groupId}');
      delete from public.activities where group_id='${groupId}';
      delete from public.memberships where group_id='${groupId}';
      delete from public.groups where id='${groupId}';
      delete from public.users where id in (${users}); commit;`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("dos bajas simultáneas conservan al menos un ADMIN y revalidan autorización", async () => {
    const responses = await Promise.all([clients[0]!.rpc("deactivate_membership", { p_group_id: groupId, p_membership_id: mainAdmin }),
      clients[1]!.rpc("deactivate_membership", { p_group_id: groupId, p_membership_id: otherAdmin })]);
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("LAST_ADMIN");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and role='ADMIN' and status='ACTIVE';`)).toBe("1");
    const winner = responses[0]!.error ? 0 : 1;
    const disabled = winner === 0 ? 1 : 0;
    expect((await clients[disabled]!.rpc("list_group_members", { p_group_id: groupId })).status).toBe(404);
    expect((await clients[winner]!.rpc("reactivate_membership", { p_group_id: groupId, p_membership_id: disabled === 0 ? mainAdmin : otherAdmin })).error).toBeNull();
  });
  it("HTTP bloquea grupo ajeno y edición de cuenta propia por ADMIN", async () => {
    expect((await clients[2]!.rpc("list_group_members", { p_group_id: groupId })).status).toBe(404);
    expect((await clients[0]!.rpc("update_managed_member", { p_group_id: groupId, p_membership_id: otherAdmin, p_full_name: "Cambio ajeno", p_birthdate: "1990-01-01" })).status).toBe(403);
  });
  it("dos reactivaciones disputan el último cupo sin exceder 500", async () => {
    sql(`with profiles as (
      insert into public.users(full_name,email,birthdate,account_status)
      select 'Capacidad sintética','issue34-${run}-capacity-'||n||'@example.test','1990-01-01','MANAGED'
      from generate_series(1,497) n returning id
    ) insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE',now()-interval '1 year' from profiles;`);
    const inactiveIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      inactiveIds.push(sql(`with profile as (insert into public.users(full_name,email,birthdate,account_status)
        values('Inactivo sintético','${email(`inactive-${i}`)}','1990-01-01','MANAGED') returning id)
        insert into public.memberships(user_id,group_id,role,status,joined_at)
        select id,'${groupId}','ATHLETE','INACTIVE',now()-interval '1 year' from profile returning id;`).split("\n")[0]!);
    }
    const responses = await Promise.all(inactiveIds.map(id => clients[0]!.rpc("reactivate_membership", { p_group_id: groupId, p_membership_id: id })));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
    expect(sql(`select count(*) from public.memberships where id in ('${inactiveIds.join("','")}') and joined_at < now()-interval '364 days';`)).toBe("2");
  });
});
