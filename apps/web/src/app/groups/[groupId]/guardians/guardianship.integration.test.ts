import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const suite = describe.skipIf(process.env.RUN_GUARDIANSHIP_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue25-${run}-${name}@example.test`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: SupabaseClient;
let owner: SupabaseClient;
let existingGuardian: SupabaseClient;
let outsider: SupabaseClient;
let ownerAuthId: string;
let groupId: string;
let athleteId: string;
let config: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
const input = (name: string) => ({ p_group_id: groupId, p_athlete_user_id: athleteId, p_full_name: "Persona sintética", p_email: email(name), p_relationship: "Tutor" });

suite("Apoderados: HTTP, invitación y concurrencia", () => {
  beforeAll(async () => {
    config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["owner", "guardian", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (account.error) throw new Error("No se pudo preparar cuenta sintética");
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "owner") { owner = client; ownerAuthId = account.data.user.id; }
      else if (name === "guardian") existingGuardian = client;
      else outsider = client;
    }
    const group = await owner.rpc("create_group", { p_name: "Club apoderados integración", p_sport: "Tenis" });
    if (group.error) throw new Error("No se pudo preparar grupo sintético");
    groupId = group.data;
    athleteId = sql(`insert into public.users(full_name,email,birthdate,account_status) values('Menor sintético','${email("minor")}','2020-01-01','MANAGED') returning id;`).split("\n")[0]!;
    sql(`insert into public.memberships(user_id,group_id,role,status) values('${athleteId}','${groupId}','ATHLETE','PENDING');`);
  }, 30_000);

  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue25-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    const authIds = sql(`select auth_user_id from public.users where email like 'issue25-${run}-%@example.test' and auth_user_id is not null;`).split("\n").filter(Boolean);
    // Limpieza exclusiva de fixtures sintéticos, nunca datos de usuarios reales.
    sql(`begin; set local session_replication_role=replica;
      delete from app_private.invitation_registrations where email like 'issue25-${run}-%@example.test';
      delete from public.consents where guardianship_id in (select id from public.guardianships where athlete_user_id in (${users}));
      delete from public.guardianships where athlete_user_id in (${users});
      delete from public.invitations where group_id in (${groups});
      delete from app_private.invitation_send_limits where group_id in (${groups});
      delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from public.users where id in (${users}); commit;`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });

  it("registra cuenta nueva y completa invitación sin duplicar membership ni activar pupilo", async () => {
    const created = await owner.rpc("create_guardianship", input("new"));
    expect(created.error).toBeNull();
    const tokenHash = hash(randomUUID());
    const issued = await service.rpc("issue_invitation", { p_auth_user_id: ownerAuthId, p_group_id: groupId, p_token_hash: tokenHash, p_email: email("new"), p_role: "GUARDIAN" });
    expect(issued.error).toBeNull();
    const nonce = randomUUID();
    expect((await service.rpc("prepare_invitation_registration", { p_token_hash: tokenHash, p_nonce_hash: hash(nonce), p_email: email("new"),
      p_registration: { full_name: "Apoderado registrado", birthdate: "1990-01-01", phone: null, terms_version: "2026-09-21" } })).error).toBeNull();
    const password = `Synthetic-${randomUUID()}!`;
    const account = await service.auth.admin.createUser({ email: email("new"), password, email_confirm: true,
      user_metadata: { full_name: "Apoderado registrado", birthdate: "1990-01-01", invitation_registration_nonce: nonce } });
    expect(account.error).toBeNull();
    const guardian = createClient(config.API_URL, config.ANON_KEY, options);
    expect((await guardian.auth.signInWithPassword({ email: email("new"), password })).error).toBeNull();
    expect((await guardian.from("v_my_groups").select("id").eq("id", groupId)).data).toEqual([{ id: groupId }]);
    expect((await guardian.rpc("is_guardian_of", { p_athlete_user_id: athleteId })).data).toBe(true);
    expect(sql(`select count(*) from public.memberships m join public.users u on u.id=m.user_id where u.email='${email("new")}' and m.group_id='${groupId}' and m.role='GUARDIAN';`)).toBe("1");
    expect(sql(`select status from public.memberships where user_id='${athleteId}';`)).toBe("PENDING");
    expect(sql(`select count(*) from public.consents where guardianship_id='${created.data}';`)).toBe("0");
  });

  it("reutiliza cuenta y rechaza duplicado, adulto, no ADMIN y grupo ajeno por HTTP", async () => {
    expect((await owner.rpc("create_guardianship", input("guardian"))).error).toBeNull();
    const duplicate = await owner.rpc("create_guardianship", input("guardian"));
    expect(duplicate.status).toBe(409);
    expect(duplicate.error?.message).toBe("guardianship_already_exists");
    expect((await existingGuardian.rpc("create_guardianship", input("outsider"))).status).toBe(403);
    expect((await outsider.rpc("create_guardianship", input("outsider"))).status).toBe(404);
    expect((await outsider.rpc("list_guardianship_athletes", { p_group_id: groupId })).status).toBe(404);
    const adult = await owner.rpc("create_managed_member", { p_group_id: groupId, p_full_name: "Adulto sintético", p_birthdate: "1990-01-01", p_email: email("adult") });
    expect(adult.error).toBeNull();
    const adultId = sql(`select id from public.users where email='${email("adult")}';`);
    const rejected = await owner.rpc("create_guardianship", { ...input("adult-tutor"), p_athlete_user_id: adultId });
    expect(rejected.status).toBe(422);
    expect(rejected.error?.message).toBe("guardian_only_for_minor");
  });

  it("dos registros simultáneos del mismo par crean un solo vínculo", async () => {
    const responses = await Promise.all([1, 2].map(() => owner.rpc("create_guardianship", input("concurrent"))));
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
    const response = await owner.rpc("create_guardianship", input("thirty"));
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
    const responses = await Promise.all([1, 2].map(n => owner.rpc("create_guardianship", input(`last-${n}`))));
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    expect(responses.find(response => response.error)?.error?.message).toBe("group_member_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and status='ACTIVE';`)).toBe("500");
  });
});
