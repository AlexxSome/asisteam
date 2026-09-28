import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { attendanceHistorySchema } from "@asisteam/core";

// Solo fixtures sintéticos contra Supabase local y Edge servido con el mismo
// INVITATION_PROXY_SECRET. Nunca acepta endpoints remotos.
const enabled = process.env.RUN_INVITATION_INTEGRATION === "1";
const suite = describe.skipIf(!enabled);
const run = randomUUID().replaceAll("-", "");
const groupId = randomUUID();
const fixtureGroupIds = [groupId];
const invitedId = randomUUID();
const minorId = randomUUID();
const tokens = { invited: randomUUID(), existing: randomUUID(), expired: randomUUID(), minor: randomUUID(), race: randomUUID() };
const password = "Synthetic-password-18!";
const email = (name: string) => `issue18-${run}-${name}@example.test`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let admin: SupabaseClient;
let owner: SupabaseClient;
let existingGuardian: SupabaseClient;
let guardianJwt: string;
let apiUrl: string;
let anonKey: string;
let existingAuthId: string;
let existingProfileId: string;
let jwt: string;
let wrongJwt: string;
const secret = process.env.INVITATION_PROXY_SECRET ?? "";
const ips = ["192.0.2.181", "192.0.2.182", "192.0.2.183"];

function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
async function invoke(body: unknown, token?: string, ip = ips[0]!, proxy = secret) {
  const response = await fetch(`${apiUrl}/functions/v1/accept-invitation`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-asisteam-proxy": proxy,
      "x-asisteam-client-ip": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function historySnapshot(userId: string) {
  return sql(`select jsonb_build_object(
    'memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m where user_id='${userId}'),
    'guardianships',(select jsonb_agg(to_jsonb(g) order by id) from public.guardianships g where athlete_user_id='${userId}'),
    'attendance',(select jsonb_agg(to_jsonb(a) order by a.id) from public.attendance_records a
      join public.memberships m on m.id=a.membership_id where m.user_id='${userId}'));`);
}

async function managedFixture(minor: boolean) {
  const id = randomUUID(); const membershipId = randomUUID(); const token = randomUUID();
  const guardianId = minor ? randomUUID() : undefined;
  const address = email(minor ? "managed-minor" : "managed-adult");
  const ip = minor ? "192.0.2.201" : "192.0.2.200";
  ips.push(ip);
  sql(`insert into public.users(id,full_name,email,phone,birthdate,account_status)
    values('${id}','Perfil gestionado conservado','${address}','+56912345678',${minor ? "(current_date-interval '15 years')::date" : "date '1990-01-01'"},'MANAGED');
    insert into public.memberships(id,user_id,group_id,role,status,joined_at)
    values('${membershipId}','${id}','${groupId}','ATHLETE','${minor ? "PENDING" : "ACTIVE"}',now()-interval '90 days');`);
  if (guardianId) sql(`insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
    values('${guardianId}','${existingProfileId}','${id}','Tutor');
    insert into public.consents(guardianship_id,consent_type,terms_version,channel) values
    ('${guardianId}','DATA_PROCESSING_MINOR','2026-09-21','IN_APP'),
    ('${guardianId}','ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP');
    update public.memberships set status='ACTIVE' where id='${membershipId}';`);
  const activityId = randomUUID();
  sql(`insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
    values('${activityId}','${groupId}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento antes del reclamo',
    now()-interval '2 days',now()-interval '47 hours','${existingProfileId}');
    insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
    values('${activityId}','${membershipId}','LATE','Historial registrado por ADMIN','${existingProfileId}');`);
  const issued = await admin.rpc("issue_managed_activation", { p_auth_user_id: existingAuthId, p_group_id: groupId,
    p_membership_id: membershipId, p_token_hash: digest(token) });
  expect(issued.error).toBeNull();
  return { id, membershipId, token, guardianId, address, ip,
    request: { action: "claim", token, registration: { email: address, password, terms_accepted: true } } };
}

async function guardianFixture(name: string, address = email(name)) {
  const token = randomUUID();
  const ip = `192.0.2.${210 + ips.length}`;
  ips.push(ip);
  // El ADMIN vincula al pupilo antes del correo; aceptar no equivale a consentir.
  const created = await owner.rpc("create_managed_member", {
    p_group_id: groupId, p_full_name: "Pupilo de invitación", p_email: email(`${name}-ward`),
    p_birthdate: sql("select (app_private.chile_today()-interval '15 years')::date::text"),
    p_guardian: { full_name: "Apoderado invitado", email: address, relationship: "Tutor", authorized: true },
  });
  expect(created.error).toBeNull();
  expect(created.data.membership_status).toBe("PENDING");
  const guardianId = sql(`select id from public.users where email='${address}';`);
  const athleteId = sql(`select user_id from public.memberships where id='${created.data.membership_id}';`);
  const guardianship = sql(`select to_jsonb(g) from public.guardianships g where guardian_user_id='${guardianId}' and athlete_user_id='${athleteId}';`);
  const issued = await admin.rpc("issue_invitation", {
    p_auth_user_id: existingAuthId, p_group_id: groupId, p_token_hash: digest(token), p_email: address, p_role: "GUARDIAN",
  });
  expect(issued.error).toBeNull();
  return { token, ip, address, guardianId, athleteId, guardianship, membershipId: created.data.membership_id };
}

suite("Edge + Auth + Postgres: invitaciones", () => {
  beforeAll(async () => {
    if (!secret) throw new Error("Falta INVITATION_PROXY_SECRET para el runtime Edge local");
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    apiUrl = config.API_URL; anonKey = config.ANON_KEY;
    if (!["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("Las pruebas solo admiten Supabase local");
    admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of ["existing", "outsider", "guardian"]) {
      const { data, error } = await admin.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Fixture adulto", birthdate: "1990-01-01" } });
      if (error || !data.user) throw new Error("No se pudo preparar cuenta sintética");
      if (name === "existing") existingAuthId = data.user.id;
      const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.auth.signInWithPassword({ email: email(name), password });
      if (!result.data.session) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "existing") { jwt = result.data.session.access_token; owner = client; }
      else if (name === "guardian") { guardianJwt = result.data.session.access_token; existingGuardian = client; }
      else wrongJwt = result.data.session.access_token;
    }
    existingProfileId = sql(`select id from public.users where auth_user_id='${existingAuthId}';`);
    sql(`insert into public.groups(id,name,invite_code,created_by) values('${groupId}','Grupo sintético #18','${run.slice(0,8)}','${existingProfileId}');
      insert into public.memberships(user_id,group_id,role,status) values('${existingProfileId}','${groupId}','ADMIN','ACTIVE');
      insert into public.users(id,full_name,email,birthdate,account_status) values
        ('${invitedId}','Invitado sintético','${email("new")}','1990-01-01','INVITED'),
        ('${minorId}','Menor sintético','${email("minor")}','2011-01-01','INVITED');
      insert into public.invitations(group_id,email,invited_user_id,role,token,created_by) values
        ('${groupId}','${email("new")}','${invitedId}','ATHLETE','${digest(tokens.invited)}','${existingProfileId}'),
        ('${groupId}','${email("existing")}','${existingProfileId}','ATHLETE','${digest(tokens.existing)}','${existingProfileId}'),
        ('${groupId}','${email("minor")}','${minorId}','ATHLETE','${digest(tokens.minor)}','${existingProfileId}'),
        ('${groupId}','${email("existing")}','${existingProfileId}','GUARDIAN','${digest(tokens.race)}','${existingProfileId}');
      insert into public.invitations(group_id,email,role,token,created_by,created_at,expires_at) values
        ('${groupId}','${email("existing")}','ATHLETE','${digest(tokens.expired)}','${existingProfileId}',now()-interval '8 days',now()-interval '1 day');`);
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;
    const authIds = sql(`select auth_user_id from public.users where email like 'issue18-${run}-%@example.test' and auth_user_id is not null;`).split("\n").filter(Boolean);
    const groups = fixtureGroupIds.map(id => `'${id}'`).join(",");
    const users = `select id from public.users where email like 'issue18-${run}-%@example.test'`;
    sql(`begin; set local session_replication_role=replica;
      delete from app_private.managed_member_enrollments where membership_id in (select id from public.memberships where group_id in (${groups}));
      delete from app_private.join_code_attempts where user_id in (${users});
      delete from public.consents where guardianship_id in (select id from public.guardianships where athlete_user_id in (${users}));
      delete from public.guardianships where athlete_user_id in (${users});
      delete from public.attendance_records where membership_id in (select id from public.memberships where group_id in (${groups}));
      delete from public.activities where group_id in (${groups});
      delete from app_private.invitation_registrations where token_hash in (select token from public.invitations where group_id in (${groups}));
      delete from public.invitations where group_id in (${groups});
      delete from app_private.invitation_send_limits where group_id in (${groups});
      delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from app_private.invitation_attempts where key in (${ips.flatMap(ip => ["preview", "accept"].map(action => `'${digest(`${secret}:${action}:${ip}`)}'`)).join(",")});
      delete from public.users where id in (${users}); commit;`);
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
  });

  it("preview no revela email, ID de usuario ni si ya existe cuenta", async () => {
    const result = await invoke({ action: "preview", token: tokens.invited });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ group_name: "Grupo sintético #18", role: "ATHLETE" });
  });
  it("el reclamo no convierte una invitación de registro normal en activación gestionada", async () => {
    const result = await invoke({ action: "claim", token: tokens.invited,
      registration: { email: email("new"), password, terms_accepted: true } });
    expect(result.status).toBe(404);
    expect(sql(`select count(*) from auth.users where email='${email("new")}';`)).toBe("0");
    expect(sql(`select status from public.invitations where token='${digest(tokens.invited)}';`)).toBe("PENDING");
  });
  it("rechaza proxy falso y sesión de otra persona sin consumir invitación", async () => {
    expect((await invoke({ action: "accept", token: tokens.existing }, jwt, ips[0], "wrong")).status).toBe(401);
    expect((await invoke({ action: "accept", token: tokens.existing }, wrongJwt)).status).toBe(404);
    expect(sql(`select status from public.invitations where token='${digest(tokens.existing)}';`)).toBe("PENDING");
  });
  it("cuenta existente conserva ADMIN y agrega únicamente el rol invitado", async () => {
    const result = await invoke({ action: "accept", token: tokens.existing }, jwt);
    expect(result.status).toBe(200);
    expect(result.body.membership_status).toBe("ACTIVE");
    expect(sql(`select string_agg(role,',' order by role) from public.memberships where user_id='${existingProfileId}' and group_id='${groupId}';`)).toBe("ADMIN,ATHLETE");
    expect((await invoke({ action: "accept", token: tokens.existing }, jwt)).status).toBe(404);
  });
  it("registro GoTrue vincula INVITED sin duplicado y permite contraseña propia", async () => {
    const result = await invoke({ action: "register", token: tokens.invited, registration: {
      full_name: "Adulto activado", email: email("new"), password, birthdate: "1990-01-01", terms_accepted: true,
    } });
    expect(result).toEqual({ status: 200, body: { group_id: groupId, membership_status: "ACTIVE" } });
    expect(sql(`select account_status from public.users where id='${invitedId}';`)).toBe("ACTIVE");
    expect(sql(`select count(*) from public.users where email='${email("new")}';`)).toBe("1");
    expect(sql(`select count(*) from app_private.invitation_registrations where token_hash='${digest(tokens.invited)}';`)).toBe("0");
    const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const resultLogin = await client.auth.signInWithPassword({ email: email("new"), password });
    expect(resultLogin.error).toBeNull();
    expect((await client.from("v_my_groups").select("id")).data).toEqual([{ id: groupId }]);
  });
  it("GoTrue no deja credenciales ni consume token de menor sin consentimiento", async () => {
    const result = await invoke({ action: "register", token: tokens.minor, registration: {
      full_name: "Menor sintético", email: email("minor"), password, birthdate: "2011-01-01", terms_accepted: true,
    } });
    expect(result.status).toBe(422);
    expect(sql(`select count(*) from auth.users where email='${email("minor")}';`)).toBe("0");
    expect(sql(`select account_status from public.users where id='${minorId}';`)).toBe("INVITED");
    expect(sql(`select status from public.invitations where token='${digest(tokens.minor)}';`)).toBe("PENDING");
    expect(sql(`select count(*) from app_private.invitation_registrations where token_hash='${digest(tokens.minor)}';`)).toBe("0");
  });
  it("abrir enlace vencido persiste EXPIRED sin iniciar sesión", async () => {
    const result = await invoke({ action: "preview", token: tokens.expired });
    expect(result.status).toBe(410);
    expect(result.body.error.message).toContain("Invitación expirada");
    expect(sql(`select status from public.invitations where token='${digest(tokens.expired)}';`)).toBe("EXPIRED");
  });
  it("aceptaciones simultáneas consumen el token una sola vez", async () => {
    const results = await Promise.all([invoke({ action: "accept", token: tokens.race }, jwt, ips[1]), invoke({ action: "accept", token: tokens.race }, jwt, ips[1])]);
    expect(results.map(r => r.status).sort()).toEqual([200,404]);
    expect(sql(`select count(*) from public.memberships where user_id='${existingProfileId}' and group_id='${groupId}' and role='GUARDIAN';`)).toBe("1");
  });
  it("registros GoTrue simultáneos crean una sola cuenta y limpian ambas pruebas", async () => {
    const id = randomUUID(); const token = randomUUID();
    sql(`insert into public.users(id,full_name,email,birthdate,account_status)
      values('${id}','Registro concurrente','${email("race")}','1990-01-01','INVITED');
      insert into public.invitations(group_id,email,invited_user_id,role,token,created_by)
      values('${groupId}','${email("race")}','${id}','ATHLETE','${digest(token)}','${existingProfileId}');`);
    const body = { action: "register", token, registration: {
      full_name: "Registro concurrente", email: email("race"), password, birthdate: "1990-01-01", terms_accepted: true,
    } };
    const results = await Promise.all([invoke(body, undefined, ips[1]), invoke(body, undefined, ips[1])]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => [404,422].includes(r.status))).toHaveLength(1);
    expect(sql(`select count(*) from auth.users where email='${email("race")}';`)).toBe("1");
    expect(sql(`select count(*) from app_private.invitation_registrations where token_hash='${digest(token)}';`)).toBe("0");
  });
  it("HU-APO-01: apoderado nuevo acepta por Edge y conserva el vínculo sin consentir por el menor", async () => {
    const fixture = await guardianFixture("guardian-new");
    expect(sql(`select count(*) from public.memberships where user_id='${fixture.guardianId}';`)).toBe("0");
    expect(await invoke({ action: "preview", token: fixture.token }, undefined, fixture.ip))
      .toEqual({ status: 200, body: { group_name: "Grupo sintético #18", role: "GUARDIAN" } });
    const request = { action: "register", token: fixture.token, registration: {
      full_name: "Apoderado registrado", email: fixture.address, password, birthdate: "1990-01-01", terms_accepted: true,
    } };
    expect(await invoke(request, undefined, fixture.ip))
      .toEqual({ status: 200, body: { group_id: groupId, membership_status: "ACTIVE" } });
    expect(sql(`select id||':'||account_status from public.users where email='${fixture.address}';`))
      .toBe(`${fixture.guardianId}:ACTIVE`);
    expect(sql(`select count(*) from auth.users where email='${fixture.address}';`)).toBe("1");
    expect(sql(`select role||':'||status from public.memberships where user_id='${fixture.guardianId}' and group_id='${groupId}';`))
      .toBe("GUARDIAN:ACTIVE");
    expect(sql(`select to_jsonb(g) from public.guardianships g where guardian_user_id='${fixture.guardianId}' and athlete_user_id='${fixture.athleteId}';`))
      .toBe(fixture.guardianship);
    expect(sql(`select status from public.memberships where id='${fixture.membershipId}';`)).toBe("PENDING");
    expect(sql(`select count(*) from public.consents where guardianship_id='${JSON.parse(fixture.guardianship).id}';`)).toBe("0");
    const guardian = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await guardian.auth.signInWithPassword({ email: fixture.address, password })).error).toBeNull();
    expect((await guardian.from("v_my_groups").select("id")).data).toEqual([{ id: groupId }]);
    expect((await guardian.rpc("is_guardian_of", { p_athlete_user_id: fixture.athleteId })).data).toBe(true);
    const consents = await guardian.rpc("list_managed_member_consents", { p_group_id: groupId });
    expect(consents.error).toBeNull();
    expect(consents.data).toEqual([{ membership_id: fixture.membershipId, full_name: "Pupilo de invitación", relationship: "Tutor", total_count: 1 }]);
    expect((await invoke(request, undefined, fixture.ip)).status).toBe(404);
  });
  it("HU-APO-01: cuenta de otro grupo acepta como GUARDIAN sin duplicar identidad ni perder sus roles", async () => {
    const previousGroup = await existingGuardian.rpc("create_group", { p_name: "Grupo previo del apoderado", p_sport: "Tenis" });
    expect(previousGroup.error).toBeNull();
    fixtureGroupIds.push(previousGroup.data);
    const guardianId = sql(`select id from public.users where email='${email("guardian")}';`);
    const before = sql(`select to_jsonb(u) from public.users u where id='${guardianId}';`);
    const previousMembership = sql(`select to_jsonb(m) from public.memberships m where user_id='${guardianId}' and group_id='${previousGroup.data}';`);
    const fixture = await guardianFixture("guardian-existing", email("guardian"));
    expect(fixture.guardianId).toBe(guardianId);
    expect((await existingGuardian.from("v_my_groups").select("id").eq("id", groupId)).data).toEqual([]);
    expect((await invoke({ action: "accept", token: fixture.token }, wrongJwt, fixture.ip)).status).toBe(404);
    expect(sql(`select status from public.invitations where token='${digest(fixture.token)}';`)).toBe("PENDING");
    expect(await invoke({ action: "accept", token: fixture.token }, guardianJwt, fixture.ip))
      .toEqual({ status: 200, body: { group_id: groupId, membership_status: "ACTIVE" } });
    expect(sql(`select to_jsonb(u) from public.users u where id='${guardianId}';`)).toBe(before);
    expect(sql(`select count(*) from public.users where email='${fixture.address}';`)).toBe("1");
    expect(sql(`select to_jsonb(m) from public.memberships m where user_id='${guardianId}' and group_id='${previousGroup.data}';`))
      .toBe(previousMembership);
    expect(sql(`select role||':'||status from public.memberships where user_id='${guardianId}' and group_id='${groupId}';`)).toBe("GUARDIAN:ACTIVE");
    expect(sql(`select to_jsonb(g) from public.guardianships g where guardian_user_id='${guardianId}' and athlete_user_id='${fixture.athleteId}';`))
      .toBe(fixture.guardianship);
    expect((await existingGuardian.rpc("is_guardian_of", { p_athlete_user_id: fixture.athleteId })).data).toBe(true);
    expect((await existingGuardian.from("v_my_groups").select("id")).data)
      .toEqual(expect.arrayContaining([{ id: groupId }, { id: previousGroup.data }]));
    expect((await invoke({ action: "accept", token: fixture.token }, guardianJwt, fixture.ip)).status).toBe(404);
    expect(sql(`select count(*) from public.memberships where user_id='${guardianId}' and group_id='${groupId}' and role='GUARDIAN';`)).toBe("1");

    // El rol de otro grupo no se hereda al incorporarse mediante código.
    const codeGroup = await owner.rpc("create_group", { p_name: "Ingreso por código del apoderado", p_sport: "Tenis" });
    expect(codeGroup.error).toBeNull();
    fixtureGroupIds.push(codeGroup.data);
    const code = sql(`select invite_code from public.groups where id='${codeGroup.data}';`);
    const joined = await existingGuardian.rpc("join_group_by_code", { p_invite_code: code });
    expect(joined.error).toBeNull();
    expect(joined.data.membership).toMatchObject({ group_id: codeGroup.data, role: "ATHLETE", status: "ACTIVE" });
    expect(sql(`select role from public.memberships where user_id='${guardianId}' and group_id='${codeGroup.data}';`)).toBe("ATHLETE");
    expect(sql(`select count(*) from public.guardianships where guardian_user_id='${guardianId}';`)).toBe("1");
  });
  it("limita intentos a 10 por hora e IP entre peticiones Edge", async () => {
    for (let n = 0; n < 10; n++) expect((await invoke({ action: "accept", token: tokens.existing }, jwt, ips[2])).status).toBe(404);
    expect((await invoke({ action: "accept", token: tokens.existing }, jwt, ips[2])).status).toBe(429);
  });
  it("HU-DEP-07: adulto reclama por Edge, conserva todos sus grupos y consulta su historial al iniciar sesión", async () => {
    const fixture = await managedFixture(false);
    const secondGroup = randomUUID(); fixtureGroupIds.push(secondGroup);
    sql(`insert into public.groups(id,name,invite_code,created_by)
      values('${secondGroup}','Otro grupo previo','${randomUUID().replaceAll("-", "").slice(0,8)}','${existingProfileId}');
      insert into public.memberships(user_id,group_id,role,status,joined_at)
      values('${fixture.id}','${secondGroup}','ATHLETE','ACTIVE',now()-interval '60 days');`);
    const before = historySnapshot(fixture.id);
    const preview = await invoke({ action: "preview", token: fixture.token }, undefined, fixture.ip);
    expect(preview).toEqual({ status: 200, body: { group_name: "Grupo sintético #18", role: "ATHLETE", managed_activation: true } });
    const wrong = { ...fixture.request, registration: { ...fixture.request.registration, email: email("outsider") } };
    expect((await invoke(wrong, undefined, fixture.ip)).status).toBe(422);
    expect((await invoke({ ...fixture.request, registration: { ...fixture.request.registration, birthdate: "1990-01-01" } }, undefined, fixture.ip)).status).toBe(400);
    expect((await invoke({ ...fixture.request, registration: { ...fixture.request.registration, terms_accepted: false } }, undefined, fixture.ip)).status).toBe(400);
    expect(sql(`select count(*) from auth.users where email='${fixture.address}';`)).toBe("0");
    const claims = await Promise.all([1, 2].map(() => invoke(fixture.request, undefined, fixture.ip)));
    expect(claims.map(result => result.status).sort()).toEqual([200,404]);
    expect(claims.find(result => result.status === 200)?.body).toEqual({ group_id: groupId, membership_status: "ACTIVE" });
    expect(historySnapshot(fixture.id)).toBe(before);
    expect(sql(`select id||':'||account_status||':'||full_name||':'||phone from public.users where email='${fixture.address}';`))
      .toBe(`${fixture.id}:ACTIVE:Perfil gestionado conservado:+56912345678`);
    const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.address, password })).error).toBeNull();
    expect((await client.from("v_my_groups").select("id")).data).toEqual(expect.arrayContaining([{ id: groupId }, { id: secondGroup }]));
    const history = await client.rpc("get_my_attendance_history", { p_group_id: groupId, p_period: "custom",
      p_from: sql("select (current_date-7)::text"), p_to: sql("select current_date::text") });
    expect(history.error).toBeNull();
    expect(attendanceHistorySchema.parse(history.data)).toMatchObject({ membership_id: fixture.membershipId,
      totals: { late: 1, attendance_pct: 100 }, records: [{ note: "Historial registrado por ADMIN", status: "LATE" }] });
    expect((await invoke(fixture.request, undefined, fixture.ip)).status).toBe(404);
    expect(sql(`select count(*) from auth.users where email='${fixture.address}';`)).toBe("1");
  });
  it("HU-DEP-07: menor queda bloqueado por consentimiento revocado y puede reclamar tras nueva autorización", async () => {
    const fixture = await managedFixture(true);
    const before = historySnapshot(fixture.id);
    sql(`update public.consents set revoked_at=now() where guardianship_id='${fixture.guardianId}' and consent_type='ACCOUNT_ACTIVATION_MINOR';`);
    const blocked = await invoke(fixture.request, undefined, fixture.ip);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("guardian_consent_required");
    expect(sql(`select count(*) from auth.users where email='${fixture.address}';`)).toBe("0");
    expect(sql(`select account_status from public.users where id='${fixture.id}';`)).toBe("MANAGED");
    expect(sql(`select status from public.invitations where token='${digest(fixture.token)}';`)).toBe("PENDING");
    expect(sql(`select count(*) from app_private.invitation_registrations where token_hash='${digest(fixture.token)}';`)).toBe("0");
    expect(historySnapshot(fixture.id)).toBe(before);
    sql(`insert into public.consents(guardianship_id,consent_type,terms_version,channel)
      values('${fixture.guardianId}','ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP');`);
    expect(await invoke(fixture.request, undefined, fixture.ip)).toEqual({ status: 200, body: { group_id: groupId, membership_status: "ACTIVE" } });
    expect(historySnapshot(fixture.id)).toBe(before);
    const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.address, password })).error).toBeNull();
    expect((await client.from("v_attendance_own").select("status,note").eq("membership_id", fixture.membershipId)).data)
      .toEqual([{ status: "LATE", note: "Historial registrado por ADMIN" }]);
    const guardian = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await guardian.auth.signInWithPassword({ email: email("existing"), password })).error).toBeNull();
    expect((await guardian.from("v_attendance_own").select("status").eq("membership_id", fixture.membershipId)).data).toEqual([{ status: "LATE" }]);
  });
});
