import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const suite = describe.skipIf(process.env.RUN_MEMBER_MANAGEMENT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue34-${run}-${name}@example.test`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const authIds: string[] = [];
const clients: NativePersistenceClient[] = [];
let service: NativePersistenceClient;
let groupId: string;
let mainAdmin: string;
let otherAdmin: string;
const sql = nativeSql;
suite("Gestión de integrantes: HTTP y concurrencia", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo PostgreSQL/Nest local");
    service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["admin", "second", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(account.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients.push(client);
    }
    const group = await clients[0]!.operation("create_group", { p_name: "Club gestión integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    mainAdmin = sql(`select id from public.memberships where group_id='${groupId}' and role='ADMIN';`);
    otherAdmin = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
      select id,'${groupId}','ADMIN','ACTIVE',now() from public.users where email='${email("second")}' returning id;`).split("\n")[0]!;
  }, 30_000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("dos bajas simultáneas conservan al menos un ADMIN y revalidan autorización", async () => {
    const responses = await Promise.all([clients[0]!.operation("deactivate_membership", { p_group_id: groupId, p_membership_id: mainAdmin }),
      clients[1]!.operation("deactivate_membership", { p_group_id: groupId, p_membership_id: otherAdmin })]);
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("LAST_ADMIN");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and role='ADMIN' and status='ACTIVE';`)).toBe("1");
    const winner = responses[0]!.error ? 0 : 1;
    const disabled = winner === 0 ? 1 : 0;
    expect((await clients[disabled]!.operation("list_group_members", { p_group_id: groupId })).status).toBe(404);
    expect((await clients[winner]!.operation("reactivate_membership", { p_group_id: groupId, p_membership_id: disabled === 0 ? mainAdmin : otherAdmin })).error).toBeNull();
  });
  it("HTTP bloquea grupo ajeno y edición de cuenta propia por ADMIN", async () => {
    expect((await clients[2]!.operation("list_group_members", { p_group_id: groupId })).status).toBe(404);
    expect((await clients[0]!.operation("update_managed_member", { p_group_id: groupId, p_membership_id: otherAdmin, p_full_name: "Cambio ajeno", p_birthdate: "1990-01-01" })).status).toBe(403);
  });
  it("HTTP admite búsqueda y devuelve identidad, roles y bloqueo sin abrir acceso ajeno", async () => {
    const response = await clients[0]!.operation("list_group_members", {
      p_group_id: groupId, p_search: "  pErSoNa  ", p_role: "ADMIN", p_status: "ACTIVE", p_offset: 0,
    });
    expect(response.error).toBeNull();
    expect(response.data).toHaveLength(2);
    expect(new Set(response.data.map((row: { user_id: string }) => row.user_id)).size).toBe(2);
    for (const row of response.data) {
      expect(row).toMatchObject({ total_count: 2, is_last_admin: false,
        person_roles: [{ role: "ADMIN", status: "ACTIVE" }] });
    }
    const empty = await clients[0]!.operation("list_group_members", { p_group_id: groupId, p_search: "Sin coincidencias" });
    expect(empty.error).toBeNull();
    expect(empty.data).toEqual([]);
    expect((await clients[2]!.operation("list_group_members", { p_group_id: groupId, p_search: "Persona" })).status).toBe(404);
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
    const responses = await Promise.all(inactiveIds.map(id => clients[0]!.operation("reactivate_membership", { p_group_id: groupId, p_membership_id: id })));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
    expect(sql(`select count(*) from public.memberships where id in ('${inactiveIds.join("','")}') and joined_at < now()-interval '364 days';`)).toBe("2");
  });
});
