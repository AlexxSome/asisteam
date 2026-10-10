import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// RUN_GROUP_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run src/app/groups/new/group.integration.test.ts
// Solo datos sintéticos contra PostgreSQL/Nest local.
const suite = describe.skipIf(process.env.RUN_GROUP_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue20-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
let admin: NativePersistenceClient;
let groupId: string;

const sql = nativeSql;

suite("Auth + SQL/RLS + Postgres: crear grupo", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Las pruebas solo admiten PostgreSQL/Nest local");
      admin = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["adult", "minor", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const birthdate = name === "minor" ? sql("select (app_private.chile_today() - interval '15 years')::date;") : "1990-01-01";
      const created = await admin.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      const signed = await client.auth.signInWithPassword({ email: email(name), password });
      if (signed.error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
  }, 30_000);

  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.

  it("crea grupo por JWT real, deja ADMIN y oculta el nuevo grupo al ajeno", async () => {
    const created = await clients.adult!.operation("create_group", { p_name: "Club integración", p_sport: "Tenis" });
    expect(created.error).toBeNull();
    expect(typeof created.data).toBe("string");
    groupId = created.data;
    const detail = await clients.adult!.sqlTable("v_group_detail").select("id, roles, settings, invite_code").eq("id", groupId).single();
    expect(detail.error).toBeNull();
    expect(detail.data).toMatchObject({ id: groupId, roles: ["ADMIN"], settings: { athletes_can_view_group_stats: false, guardians_can_view_group_stats: false } });
    expect(detail.data?.invite_code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect((await clients.outsider!.sqlTable("v_group_detail").select("id").eq("id", groupId)).data).toEqual([]);
    expect((await clients.outsider!.operation("join_group_as_athlete", { p_group_id: groupId })).status).toBe(404);
  });

  it("dos auto-incorporaciones simultáneas devuelven la misma segunda membresía", async () => {
    expect((await clients.adult!.operation("join_group_as_athlete", { p_group_id: groupId })).error?.message).toBe("subscription_athlete_limit");
    // El escenario concurrente original corresponde a capacidad legacy.
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    const results = await Promise.all([1, 2].map(() => clients.adult!.operation("join_group_as_athlete", { p_group_id: groupId })));
    expect(results.map(result => result.error)).toEqual([null, null]);
    expect(results[0]!.data).toBe(results[1]!.data);
    const memberships = await clients.adult!.sqlTable("memberships").select("role, status").eq("group_id", groupId).order("role");
    expect(memberships.data).toEqual([{ role: "ADMIN", status: "ACTIVE" }, { role: "ATHLETE", status: "ACTIVE" }]);
  });

  it("R1 se cumple también al invocar directamente por HTTP como menor", async () => {
    const created = await clients.minor!.operation("create_group", { p_name: "Club menor integración", p_sport: "Tenis" });
    expect(created.error).toBeNull();
    const joined = await clients.minor!.operation("join_group_as_athlete", { p_group_id: created.data });
    expect(joined.status).toBe(422);
    expect(joined.error?.message).toBe("minor_requires_guardian_consent");
    const memberships = await clients.minor!.sqlTable("memberships").select("role").eq("group_id", created.data);
    expect(memberships.data).toEqual([{ role: "ADMIN" }]);
  });

  it("edita por SQL/RLS y rota por RPC con permisos reales", async () => {
    const owner = clients.adult!;
    const original = (await owner.sqlTable("v_group_detail").select("invite_code").eq("id", groupId).single()).data!.invite_code!;
    const edit = await owner.http(`groups/${groupId}`, { name: "Club actualizado", sport: "Natación", description: "Nueva descripción", logo_url: "https://example.test/logo.png" }, "PATCH");
    expect(edit.error).toBeNull();
    expect(edit.data?.success).toBe(true);
    const detail = await owner.sqlTable("v_group_detail").select("name, sport, description, logo_url").eq("id", groupId).single();
    expect(detail.data).toMatchObject({ name: "Club actualizado", sport: "Natación", description: "Nueva descripción", logo_url: "https://example.test/logo.png" });

    sql(`insert into public.memberships(user_id,group_id,role,status)
      select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("outsider")}';`);
    const athlete = clients.outsider!;
    const deniedEdit = await athlete.sqlTable("groups").update({ name: "Ataque" }).eq("id", groupId).select("id");
    expect(deniedEdit.status).toBe(403);
    expect((await athlete.operation("rotate_invite_code", { p_group_id: groupId })).status).toBe(403);
    expect((await athlete.sqlTable("v_group_detail").select("name, invite_code").eq("id", groupId).single()).data)
      .toMatchObject({ name: "Club actualizado", invite_code: null });

    const rotated = await owner.operation("rotate_invite_code", { p_group_id: groupId });
    expect(rotated.error).toBeNull();
    expect(rotated.data).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(rotated.data).not.toBe(original);
    expect(sql(`select count(*) from public.groups where invite_code='${original}';`)).toBe("0");
    expect(sql(`select id from public.groups where invite_code='${rotated.data}';`)).toBe(groupId);
  });

  it("creaciones simultáneas no superan 30 grupos ni duplican códigos", async () => {
    const results = await Promise.all(Array.from({ length: 31 }, (_, n) => clients.adult!.operation("create_group", {
      p_name: `Club concurrente ${n}`, p_sport: "Tenis",
    })));
    expect(results.filter(result => result.error === null)).toHaveLength(29);
    const failed = results.filter(result => result.error !== null);
    expect(failed).toHaveLength(2);
    expect(failed.every(result => result.status === 422 && result.error?.message === "user_group_limit")).toBe(true);
    const groups = await clients.adult!.sqlTable("v_group_detail").select("id, invite_code");
    expect(groups.data).toHaveLength(30);
    expect(new Set(groups.data?.map(group => group.invite_code)).size).toBe(30);
  }, 15_000);
});
