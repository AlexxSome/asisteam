import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const suite = describe.skipIf(process.env.RUN_MEMBERSHIP_REVIEW_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue26-${run}-${name}@example.test`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: NativePersistenceClient;
let owner: NativePersistenceClient;
let outsider: NativePersistenceClient;
let groupId: string;
const sql = nativeSql;
function pending(name: string, minor = false, targetGroup = groupId) {
  const userId = randomUUID(); const membershipId = randomUUID();
  sql(`insert into public.users(id,full_name,email,birthdate,account_status)
    values('${userId}','Deportista sintético','${email(name)}','${minor ? "2020-01-01" : "1990-01-01"}','MANAGED');
    insert into public.memberships(id,user_id,group_id,role,status)
    values('${membershipId}','${userId}','${targetGroup}','ATHLETE','PENDING');`);
  return { userId, membershipId };
}
function guardian(name: string) {
  const id = randomUUID();
  sql(`insert into public.users(id,full_name,email,birthdate,account_status) values('${id}','Apoderado sintético','${email(name)}','1990-01-01','INVITED');`);
  return id;
}
function consent(guardianId: string, athleteId: string) {
  const id = randomUUID();
  sql(`insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values('${id}','${guardianId}','${athleteId}','Tutor');
    insert into public.consents(guardianship_id,consent_type,terms_version,channel) values('${id}','DATA_PROCESSING_MINOR','test','IN_APP');`);
}

suite("Aprobaciones: HTTP e invariantes concurrentes", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo PostgreSQL/Nest local");
    service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "owner") owner = client; else outsider = client;
    }
    const group = await owner.operation("create_group", { p_name: "Club aprobaciones integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
  }, 30_000);

  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.

  it("R1 bloquea por HTTP hasta tener consentimiento y la activación abre asistencia", async () => {
    const member = pending("minor", true);
    const args = { p_group_id: groupId, p_membership_id: member.membershipId };
    const blocked = await owner.operation("approve_membership", args);
    expect(blocked.status).toBe(422);
    expect(blocked.error?.message).toBe("minor_requires_guardian");
    expect((await owner.sqlTable("v_attendance_roster").select("membership_id").eq("membership_id", member.membershipId)).data).toEqual([]);
    consent(guardian("tutor"), member.userId);
    expect((await owner.operation("approve_membership", args)).error).toBeNull();
    expect((await owner.sqlTable("v_attendance_roster").select("membership_id").eq("membership_id", member.membershipId)).data).toEqual([{ membership_id: member.membershipId }]);
  });

  it("rechaza acceso ajeno, no ADMIN y falsificación del grupo", async () => {
    const member = pending("authorization");
    const args = { p_group_id: groupId, p_membership_id: member.membershipId };
    expect((await outsider.operation("approve_membership", args)).status).toBe(404);
    expect((await outsider.operation("list_pending_memberships", { p_group_id: groupId })).status).toBe(404);
    sql(`insert into public.memberships(user_id,group_id,role,status)
      select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("outsider")}';`);
    expect((await outsider.operation("reject_pending_membership", args)).status).toBe(403);
    expect((await outsider.operation("list_pending_memberships", { p_group_id: groupId })).status).toBe(403);
    expect((await owner.operation("approve_membership", { ...args, p_group_id: randomUUID() })).status).toBe(404);
    expect(sql(`select status from public.memberships where id='${member.membershipId}';`)).toBe("PENDING");
  });

  it("aprobar y rechazar simultáneamente conserva una sola decisión", async () => {
    const member = pending("decisions");
    const args = { p_group_id: groupId, p_membership_id: member.membershipId };
    const responses = await Promise.all([owner.operation("approve_membership", args), owner.operation("reject_pending_membership", args)]);
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.status).toBe(409);
    expect(responses.find(response => response.error)?.error?.message).toBe("membership_not_pending");
    const expected = responses[0]!.error ? "INACTIVE" : "ACTIVE";
    expect(sql(`select status from public.memberships where id='${member.membershipId}';`)).toBe(expected);
  });

  it("dos aprobaciones en grupos distintos no llevan al apoderado del grupo 29 al 31", async () => {
    const tutor = guardian("limit");
    sql(`with groups as (
      insert into public.groups(name,invite_code,created_by)
      select 'Límite sintético',substr(md5('${run}'||n::text),1,8),'${tutor}' from generate_series(1,29) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select '${tutor}',id,'GUARDIAN','ACTIVE' from groups;`);
    const args = [];
    for (let n = 1; n <= 2; n++) {
      const group = await owner.operation("create_group", { p_name: `Club concurrente ${n}`, p_sport: "Tenis" });
      expect(group.error).toBeNull();
      sql(`insert into app_private.billing_legacy_groups(group_id) values('${group.data}');`);
      const member = pending(`limit-minor-${n}`, true, group.data);
      consent(tutor, member.userId);
      args.push({ p_group_id: group.data, p_membership_id: member.membershipId });
    }
    const responses = await Promise.all(args.map(input => owner.operation("approve_membership", input)));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("guardian_group_limit");
    expect(sql(`select count(distinct group_id) from public.memberships where user_id='${tutor}' and status in ('ACTIVE','PENDING');`)).toBe("30");
  });

  it("aprobaciones concurrentes respetan el último cupo del grupo", async () => {
    const members = [pending("capacity-first"), pending("capacity-second")];
    sql(`with profiles as (
      insert into public.users(full_name,email,birthdate,account_status)
      select 'Capacidad sintética','issue26-${run}-capacity-'||n||'@example.test','1990-01-01','MANAGED'
      from generate_series(1,499-(select count(*)::int from public.memberships where group_id='${groupId}' and status='ACTIVE')) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from profiles;`);
    const responses = await Promise.all(members.map(member => owner.operation("approve_membership", { p_group_id: groupId, p_membership_id: member.membershipId })));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
  });
});
