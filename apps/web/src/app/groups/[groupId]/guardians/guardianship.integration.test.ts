import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerNativeInvitation, createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const suite = describe.skipIf(process.env.RUN_GUARDIANSHIP_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue25-${run}-${name}@example.test`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: NativePersistenceClient;
let owner: NativePersistenceClient;
let existingGuardian: NativePersistenceClient;
let outsider: NativePersistenceClient;
let ownerAuthId: string;
let groupId: string;
let athleteId: string;
let config: { API_ORIGIN: string; GUEST_TOKEN: string; OPERATOR_TOKEN: string };
const sql = nativeSql;
const input = (name: string) => ({ p_group_id: groupId, p_athlete_user_id: athleteId, p_full_name: "Persona sintética", p_email: email(name), p_relationship: "Tutor" });

suite("Apoderados: HTTP, invitación y concurrencia", () => {
  beforeAll(async () => {
    config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo PostgreSQL/Nest local");
    service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "guardian", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "owner") { owner = client; ownerAuthId = account.data.user.id; }
      else if (name === "guardian") existingGuardian = client;
      else outsider = client;
    }
    const group = await owner.operation("create_group", { p_name: "Club apoderados integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    athleteId = sql(`insert into public.users(full_name,email,birthdate,account_status) values('Menor sintético','${email("minor")}','2020-01-01','MANAGED') returning id;`).split("\n")[0]!;
    sql(`insert into public.memberships(user_id,group_id,role,status) values('${athleteId}','${groupId}','ATHLETE','PENDING');`);
  }, 30_000);

  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.

  it("registra cuenta nueva y completa invitación sin duplicar membership ni activar pupilo", async () => {
    const created = await owner.operation("create_guardianship", input("new"));
    expect(created.error).toBeNull();
    const registrationToken = randomUUID(); const tokenHash = hash(registrationToken);
    const issued = await service.sqlFunction("issue_invitation", { p_auth_user_id: ownerAuthId, p_group_id: groupId, p_token_hash: tokenHash, p_email: email("new"), p_role: "GUARDIAN" });
    expect(issued.error).toBeNull();
    const nonce = randomUUID();
    expect((await service.sqlFunction("prepare_invitation_registration", { p_token_hash: tokenHash, p_nonce_hash: hash(nonce), p_email: email("new"),
      p_registration: { full_name: "Apoderado registrado", birthdate: "1990-01-01", phone: null, terms_version: "2026-09-21" } })).error).toBeNull();
    const password = `Synthetic-${randomUUID()}!`;
    const account = await registerNativeInvitation(registrationToken, { email: email("new"), password: password, full_name: "Apoderado registrado", birthdate: "1990-01-01", terms_accepted: true, terms_version: "2026-09-21" });
    expect(account.error).toBeNull();
    const guardian = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
    expect((await guardian.auth.signInWithPassword({ email: email("new"), password })).error).toBeNull();
    expect((await guardian.sqlTable("v_my_groups").select("id").eq("id", groupId)).data).toEqual([{ id: groupId }]);
    expect((await guardian.sqlFunction("is_guardian_of", { p_athlete_user_id: athleteId })).data).toBe(true);
    expect(sql(`select count(*) from public.memberships m join public.users u on u.id=m.user_id where u.email='${email("new")}' and m.group_id='${groupId}' and m.role='GUARDIAN';`)).toBe("1");
    expect(sql(`select status from public.memberships where user_id='${athleteId}';`)).toBe("PENDING");
    expect(sql(`select count(*) from public.consents where guardianship_id='${created.data}';`)).toBe("0");
  });

  it("reutiliza cuenta y rechaza duplicado, adulto, no ADMIN y grupo ajeno por HTTP", async () => {
    expect((await owner.operation("create_guardianship", input("guardian"))).error).toBeNull();
    const duplicate = await owner.operation("create_guardianship", input("guardian"));
    expect(duplicate.status).toBe(409);
    expect(duplicate.error?.message).toBe("guardianship_already_exists");
    expect((await existingGuardian.operation("create_guardianship", input("outsider"))).status).toBe(403);
    expect((await outsider.operation("create_guardianship", input("outsider"))).status).toBe(404);
    expect((await outsider.operation("list_guardianship_athletes", { p_group_id: groupId })).status).toBe(404);
    const adult = await owner.operation("create_managed_member", { p_group_id: groupId, p_full_name: "Adulto sintético", p_birthdate: "1990-01-01", p_email: email("adult") });
    expect(adult.error).toBeNull();
    const adultId = sql(`select id from public.users where email='${email("adult")}';`);
    const rejected = await owner.operation("create_guardianship", { ...input("adult-tutor"), p_athlete_user_id: adultId });
    expect(rejected.status).toBe(422);
    expect(rejected.error?.message).toBe("guardian_only_for_minor");
  });

  it("dos registros simultáneos del mismo par crean un solo vínculo", async () => {
    const responses = await Promise.all([1, 2].map(() => owner.operation("create_guardianship", input("concurrent"))));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.status).toBe(409);
    expect(sql(`select count(*) from public.guardianships g join public.users u on u.id=g.guardian_user_id where u.email='${email("concurrent")}';`)).toBe("1");
  });

  it("no incorpora un grupo número 31 para el apoderado", async () => {
    sql(`with guardian as (
      insert into public.users(full_name,email,account_status) values('Límite sintético','${email("thirty")}','INVITED') returning id
    ), groups as (
      insert into public.groups(name,invite_code,created_by)
      select 'Límite sintético',substr(md5('${run}'||n::text),1,8),(select id from guardian) from generate_series(1,30) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select (select id from guardian),id,'GUARDIAN','ACTIVE' from groups;`);
    const response = await owner.operation("create_guardianship", input("thirty"));
    expect(response.status).toBe(422);
    expect(response.error?.message).toBe("guardian_group_limit");
    expect(sql(`select count(*) from public.guardianships g join public.users u on u.id=g.guardian_user_id where u.email='${email("thirty")}';`)).toBe("0");
  });

  it("registros concurrentes respetan el último cupo del grupo", async () => {
    sql(`with profiles as (
      insert into public.users(full_name,email,birthdate,account_status)
      select 'Capacidad sintética','issue25-${run}-capacity-'||n||'@example.test','1990-01-01','MANAGED'
      from generate_series(1,499-(select count(*)::int from public.memberships where group_id='${groupId}' and status='ACTIVE')) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from profiles;`);
    const responses = await Promise.all([1, 2].map(n => owner.operation("create_guardianship", input(`last-${n}`))));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
  });
});
