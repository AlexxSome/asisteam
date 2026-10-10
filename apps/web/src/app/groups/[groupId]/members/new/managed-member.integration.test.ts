import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerNativeInvitation, createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createNativeSendInvitationHandler } from "../../../../../../test/native-persistence.mjs";

// Solo datos sintéticos en el stack Docker local.
const suite = describe.skipIf(process.env.RUN_MANAGED_MEMBER_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue24-${run}-${name}@example.test`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: NativePersistenceClient;
let owner: NativePersistenceClient;
let guardian: NativePersistenceClient;
let outsider: NativePersistenceClient;
let ownerAuthId: string;
let outsiderProfileId: string;
let groupId: string;
let membershipId: string;
let config: { API_ORIGIN: string; GUEST_TOKEN: string; OPERATOR_TOKEN: string };
const sql = nativeSql;

suite("MANAGED: Auth + invitación + consentimiento + asistencia", () => {
  beforeAll(async () => {
    config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo PostgreSQL/Nest local");
    service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      const session = await client.auth.signInWithPassword({ email: email(name), password });
      if (session.error) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "owner") { owner = client; ownerAuthId = account.data.user.id; }
      else { outsider = client; outsiderProfileId = sql(`select id from public.users where email='${email(name)}';`); }
    }
    const group = await owner.operation("create_group", { p_name: "Club MANAGED integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    // Este flujo de regresión representa un club anterior al despliegue de facturación.
    sql(`insert into app_private.billing_legacy_groups values('${groupId}');`);
  }, 30_000);

  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.

  it("menor no se activa hasta registrar e identificar al apoderado y consentir", async () => {
    const result = await owner.operation("create_managed_member", { p_group_id: groupId,
      p_full_name: "Menor integración", p_birthdate: "2020-01-01", p_email: email("minor"),
      p_guardian: { full_name: "Apoderado integración", email: email("guardian"), relationship: "Tutor", authorized: true } });
    expect(result.error).toBeNull();
    expect(result.data.membership_status).toBe("PENDING");
    membershipId = result.data.membership_id;
    expect((await owner.sqlTable("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([]);
    expect((await owner.operation("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })).status).toBe(404);
    expect(sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id join public.users u on u.id=g.athlete_user_id where u.email='${email("minor")}';`)).toBe("0");

    const registrationToken = randomUUID(); const tokenHash = hash(registrationToken);
    const issued = await service.sqlFunction("issue_invitation", { p_auth_user_id: ownerAuthId, p_group_id: groupId,
      p_token_hash: tokenHash, p_email: email("guardian"), p_role: "GUARDIAN" });
    expect(issued.error).toBeNull();
    const nonce = randomUUID();
    const prepared = await service.sqlFunction("prepare_invitation_registration", { p_token_hash: tokenHash,
      p_nonce_hash: hash(nonce), p_email: email("guardian"),
      p_registration: { full_name: "Apoderado integración", birthdate: "1990-01-01", phone: null, terms_version: "2026-09-21" } });
    expect(prepared.error).toBeNull();
    const password = `Synthetic-${randomUUID()}!`;
    const registered = await registerNativeInvitation(registrationToken, { email: email("guardian"), password: password, full_name: "Apoderado integración", birthdate: "1990-01-01", terms_accepted: true, terms_version: "2026-09-21" });
    expect(registered.error).toBeNull();
    guardian = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
    expect((await guardian.auth.signInWithPassword({ email: email("guardian"), password })).error).toBeNull();
    const wards = await guardian.operation("list_managed_member_consents", { p_group_id: groupId });
    expect(wards.error).toBeNull();
    expect(wards.data.map(({membership_id,full_name,relationship,total_count}:Record<string,unknown>)=>({membership_id,full_name,relationship,total_count}))).toEqual([{ membership_id: membershipId, full_name: "Menor integración", relationship: "Tutor", total_count: 1 }]);
    expect((await owner.sqlTable("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([]);
    expect((await guardian.operation("consent_managed_member", { p_membership_id: membershipId, p_accepted: false })).status).toBe(400);
    const consents = await Promise.all([1, 2].map(() => guardian.operation("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })));
    expect(consents.map(response => response.error)).toEqual([null, null]);
    expect((await owner.sqlTable("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([{ membership_id: membershipId }]);
    expect(sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id join public.users u on u.id=g.athlete_user_id where u.email='${email("minor")}';`)).toBe("1");
    expect(sql(`select account_status || ':' || (auth_user_id is null)::text from public.users where email='${email("minor")}';`)).toBe("MANAGED:true");
  });

  it("HTTP niega grupo ajeno y pupilo de otro GUARDIAN", async () => {
    expect((await outsider.operation("list_managed_member_consents", { p_group_id: groupId })).status).toBe(404);
    sql(`insert into public.memberships(user_id,group_id,role,status) values('${outsiderProfileId}','${groupId}','GUARDIAN','ACTIVE');`);
    expect((await outsider.operation("list_managed_member_consents", { p_group_id: groupId })).data).toEqual([]);
    expect((await outsider.operation("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })).status).toBe(404);
    expect((await outsider.operation("create_managed_member", { p_group_id: groupId, p_full_name: "No autorizado", p_birthdate: "1990-01-01" })).status).toBe(403);
  });

  it("ADMIN solicita y apoderado autoriza envío; Auth nativo activa sin alterar historial", async () => {
    const requested = await owner.operation("request_managed_activation", { p_group_id: groupId, p_membership_id: membershipId });
    expect(requested.data).toBe("CONSENT_PENDING");
    const ownerJwt = (await owner.auth.getSession()).data.session!.access_token;
    const guardianJwt = (await guardian.auth.getSession()).data.session!.access_token;
    let mailText = "";
    const handler = createNativeSendInvitationHandler({ client: service, webUrl: "https://app.example.test", resendApiKey: "synthetic",
      emailFrom: "synthetic@example.test", allowedOrigins: [], sendEmail: async (_url, init) => {
        const message = JSON.parse(init!.body as string);
        expect(message.to).toEqual([email("minor")]); mailText = message.text;
        return new Response(JSON.stringify({ id: "synthetic-receipt" }));
      } });
    const send = (jwt: string) => handler(new Request("http://edge.test/send-invitation", { method: "POST",
      headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "activate", group_id: groupId, membership_id: membershipId }) }));
    expect((await send(ownerJwt)).status).toBe(422);
    expect(mailText).toBe("");
    const requests = await guardian.operation("list_managed_activation_requests", { p_group_id: groupId });
    expect(requests.error).toBeNull();
    const requestId = requests.data[0].request_id;
    expect((await owner.operation("review_managed_activation", { p_request_id: requestId, p_accepted: true })).status).toBe(404);
    const decisions = await Promise.all([1, 2].map(() => guardian.operation("review_managed_activation", { p_request_id: requestId, p_accepted: true })));
    expect(decisions.map(result => result.error)).toEqual([null, null]);
    expect((await send(guardianJwt)).status).toBe(201);
    const token = mailText.match(/\/invitations\/([a-f0-9]{64})/)![1]!;
    const activityId = randomUUID();
    sql(`insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
      values('${activityId}','${groupId}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento sintético',now()-interval '2 hours',now()-interval '1 hour',(select created_by from public.groups where id='${groupId}'));
      insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
      values('${activityId}','${membershipId}','LATE',(select created_by from public.groups where id='${groupId}'));`);
    const athleteId = sql(`select user_id from public.memberships where id='${membershipId}';`);
    const before = sql(`select jsonb_build_object('memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m where user_id='${athleteId}'),
      'guardianships',(select jsonb_agg(to_jsonb(g) order by id) from public.guardianships g where athlete_user_id='${athleteId}'),
      'attendance',(select jsonb_agg(to_jsonb(a) order by id) from public.attendance_records a where membership_id='${membershipId}'));`);
    const nonce = randomUUID(); const password = `Synthetic-${randomUUID()}!`;
    expect((await service.sqlFunction("prepare_invitation_registration", { p_token_hash: hash(token), p_nonce_hash: hash(nonce), p_email: email("minor"),
      p_registration: { full_name: "Menor integración", birthdate: "2020-01-01", terms_version: "2026-09-21" } })).error).toBeNull();
    const registered = await registerNativeInvitation(token, { email: email("minor"), password, terms_accepted: true, terms_version: "2026-09-21" }, true);
    expect(registered.error).toBeNull();
    expect(sql(`select id||':'||account_status from public.users where email='${email("minor")}';`)).toBe(`${athleteId}:ACTIVE`);
    expect(sql(`select jsonb_build_object('memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m where user_id='${athleteId}'),
      'guardianships',(select jsonb_agg(to_jsonb(g) order by id) from public.guardianships g where athlete_user_id='${athleteId}'),
      'attendance',(select jsonb_agg(to_jsonb(a) order by id) from public.attendance_records a where membership_id='${membershipId}'));`)).toBe(before);
    const athlete = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
    expect((await athlete.auth.signInWithPassword({ email: email("minor"), password })).error).toBeNull();
    expect((await athlete.sqlTable("v_attendance_own").select("status").eq("membership_id", membershipId)).data).toEqual([{ status: "LATE" }]);
    expect((await guardian.sqlTable("v_attendance_own").select("status").eq("membership_id", membershipId)).data).toEqual([{ status: "LATE" }]);
    expect((await service.sqlFunction("invitation_registration_result", { p_token_hash: hash(token), p_auth_user_id: registered.data.user!.id })).data).toEqual({ group_id: groupId, membership_status: "ACTIVE" });
  });

  it("altas simultáneas no superan 500 membresías ACTIVE", async () => {
    sql(`with profiles as (
      insert into public.users(full_name,email,birthdate,account_status)
      select 'Capacidad sintética', 'issue24-${run}-capacity-' || n || '@example.test','1990-01-01','MANAGED'
      from generate_series(1,499-(select count(*)::integer from public.memberships where group_id='${groupId}' and status='ACTIVE')) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from profiles;`);
    const results = await Promise.all([1, 2].map(n => owner.operation("create_managed_member", {
      p_group_id: groupId, p_full_name: `Adulto ${n}`, p_birthdate: "1990-01-01", p_email: email(`concurrent-${n}`),
    })));
    expect(results.filter(response => response.error === null)).toHaveLength(1);
    expect(results.find(response => response.error)?.status).toBe(422);
    expect(results.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
  });
});
