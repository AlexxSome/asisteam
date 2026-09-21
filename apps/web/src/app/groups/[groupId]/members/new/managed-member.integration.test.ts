import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

// Solo datos sintéticos en el stack Docker local.
const suite = describe.skipIf(process.env.RUN_MANAGED_MEMBER_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue24-${run}-${name}@example.test`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: SupabaseClient;
let owner: SupabaseClient;
let guardian: SupabaseClient;
let outsider: SupabaseClient;
let ownerAuthId: string;
let outsiderProfileId: string;
let groupId: string;
let membershipId: string;
let config: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

suite("MANAGED: Auth + invitación + consentimiento + asistencia", () => {
  beforeAll(async () => {
    config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["owner", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      const session = await client.auth.signInWithPassword({ email: email(name), password });
      if (session.error) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "owner") { owner = client; ownerAuthId = account.data.user.id; }
      else { outsider = client; outsiderProfileId = sql(`select id from public.users where email='${email(name)}';`); }
    }
    const group = await owner.rpc("create_group", { p_name: "Club MANAGED integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
  }, 30_000);

  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue24-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    const authIds = sql(`select auth_user_id from public.users where email like 'issue24-${run}-%@example.test' and auth_user_id is not null;`).split("\n").filter(Boolean);
    // La eliminación física es exclusiva de fixtures sintéticos en Docker.
    sql(`begin; set local session_replication_role=replica;
      delete from app_private.managed_member_enrollments where membership_id in (select id from public.memberships where group_id in (${groups}));
      delete from public.consents where guardianship_id in (select id from public.guardianships where athlete_user_id in (${users}));
      delete from public.guardianships where athlete_user_id in (${users});
      delete from public.invitations where group_id in (${groups});
      delete from app_private.invitation_send_limits where group_id in (${groups});
      delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from public.users where id in (${users}); commit;`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });

  it("menor no se activa hasta registrar e identificar al apoderado y consentir", async () => {
    const result = await owner.rpc("create_managed_member", { p_group_id: groupId,
      p_full_name: "Menor integración", p_birthdate: "2020-01-01", p_email: email("minor"),
      p_guardian: { full_name: "Apoderado integración", email: email("guardian"), relationship: "Tutor", authorized: true } });
    expect(result.error).toBeNull();
    expect(result.data.membership_status).toBe("PENDING");
    membershipId = result.data.membership_id;
    expect((await owner.from("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([]);
    expect((await owner.rpc("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })).status).toBe(404);
    expect(sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id join public.users u on u.id=g.athlete_user_id where u.email='${email("minor")}';`)).toBe("0");

    const tokenHash = hash(randomUUID());
    const issued = await service.rpc("issue_invitation", { p_auth_user_id: ownerAuthId, p_group_id: groupId,
      p_token_hash: tokenHash, p_email: email("guardian"), p_role: "GUARDIAN" });
    expect(issued.error).toBeNull();
    const nonce = randomUUID();
    const prepared = await service.rpc("prepare_invitation_registration", { p_token_hash: tokenHash,
      p_nonce_hash: hash(nonce), p_email: email("guardian"),
      p_registration: { full_name: "Apoderado integración", birthdate: "1990-01-01", phone: null, terms_version: "2026-09-21" } });
    expect(prepared.error).toBeNull();
    const password = `Synthetic-${randomUUID()}!`;
    const registered = await service.auth.admin.createUser({ email: email("guardian"), password, email_confirm: true,
      user_metadata: { full_name: "Apoderado integración", birthdate: "1990-01-01", invitation_registration_nonce: nonce } });
    expect(registered.error).toBeNull();
    guardian = createClient(config.API_URL, config.ANON_KEY, options);
    expect((await guardian.auth.signInWithPassword({ email: email("guardian"), password })).error).toBeNull();
    const wards = await guardian.rpc("list_managed_member_consents", { p_group_id: groupId });
    expect(wards.error).toBeNull();
    expect(wards.data).toEqual([{ membership_id: membershipId, full_name: "Menor integración", relationship: "Tutor", total_count: 1 }]);
    expect((await owner.from("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([]);
    expect((await guardian.rpc("consent_managed_member", { p_membership_id: membershipId, p_accepted: false })).status).toBe(422);
    const consents = await Promise.all([1, 2].map(() => guardian.rpc("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })));
    expect(consents.map(response => response.error)).toEqual([null, null]);
    expect((await owner.from("v_attendance_roster").select("membership_id").eq("membership_id", membershipId)).data).toEqual([{ membership_id: membershipId }]);
    expect(sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id join public.users u on u.id=g.athlete_user_id where u.email='${email("minor")}';`)).toBe("1");
    expect(sql(`select account_status || ':' || (auth_user_id is null)::text from public.users where email='${email("minor")}';`)).toBe("MANAGED:true");
  });

  it("HTTP niega grupo ajeno y pupilo de otro GUARDIAN", async () => {
    expect((await outsider.rpc("list_managed_member_consents", { p_group_id: groupId })).status).toBe(404);
    sql(`insert into public.memberships(user_id,group_id,role,status) values('${outsiderProfileId}','${groupId}','GUARDIAN','ACTIVE');`);
    expect((await outsider.rpc("list_managed_member_consents", { p_group_id: groupId })).data).toEqual([]);
    expect((await outsider.rpc("consent_managed_member", { p_membership_id: membershipId, p_accepted: true })).status).toBe(404);
    expect((await outsider.rpc("create_managed_member", { p_group_id: groupId, p_full_name: "No autorizado", p_birthdate: "1990-01-01" })).status).toBe(403);
  });

  it("altas simultáneas no superan 500 membresías ACTIVE", async () => {
    sql(`with profiles as (
      insert into public.users(full_name,email,birthdate,account_status)
      select 'Capacidad sintética', 'issue24-${run}-capacity-' || n || '@example.test','1990-01-01','MANAGED'
      from generate_series(1,499-(select count(*)::integer from public.memberships where group_id='${groupId}' and status='ACTIVE')) n returning id
    ) insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from profiles;`);
    const results = await Promise.all([1, 2].map(n => owner.rpc("create_managed_member", {
      p_group_id: groupId, p_full_name: `Adulto ${n}`, p_birthdate: "1990-01-01", p_email: email(`concurrent-${n}`),
    })));
    expect(results.filter(response => response.error === null)).toHaveLength(1);
    expect(results.find(response => response.error)?.status).toBe(422);
    expect(results.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
  });
});
