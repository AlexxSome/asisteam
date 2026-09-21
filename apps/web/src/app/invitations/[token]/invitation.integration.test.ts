import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

// Solo fixtures sintéticos contra Supabase local y Edge servido con el mismo
// INVITATION_PROXY_SECRET. Nunca acepta endpoints remotos.
const enabled = process.env.RUN_INVITATION_INTEGRATION === "1";
const suite = describe.skipIf(!enabled);
const run = randomUUID().replaceAll("-", "");
const groupId = randomUUID();
const invitedId = randomUUID();
const minorId = randomUUID();
const tokens = { invited: randomUUID(), existing: randomUUID(), expired: randomUUID(), minor: randomUUID(), race: randomUUID() };
const password = "Synthetic-password-18!";
const email = (name: string) => `issue18-${run}-${name}@example.test`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let admin: SupabaseClient;
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

suite("Edge + Auth + Postgres: invitaciones", () => {
  beforeAll(async () => {
    if (!secret) throw new Error("Falta INVITATION_PROXY_SECRET para el runtime Edge local");
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    apiUrl = config.API_URL; anonKey = config.ANON_KEY;
    if (!["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("Las pruebas solo admiten Supabase local");
    admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of ["existing", "outsider"]) {
      const { data, error } = await admin.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Fixture adulto", birthdate: "1990-01-01" } });
      if (error || !data.user) throw new Error("No se pudo preparar cuenta sintética");
      if (name === "existing") existingAuthId = data.user.id;
      const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.auth.signInWithPassword({ email: email(name), password });
      if (!result.data.session) throw new Error("No se pudo iniciar sesión sintética");
      if (name === "existing") jwt = result.data.session.access_token; else wrongJwt = result.data.session.access_token;
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
    sql(`delete from public.invitations where group_id='${groupId}';
      delete from public.memberships where group_id='${groupId}';
      delete from public.groups where id='${groupId}';
      delete from app_private.invitation_attempts where key in (${ips.flatMap(ip => ["preview", "accept"].map(action => `'${digest(`${secret}:${action}:${ip}`)}'`)).join(",")});
      delete from public.users where email like 'issue18-${run}-%@example.test';`);
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
  });

  it("preview no revela email, ID de usuario ni si ya existe cuenta", async () => {
    const result = await invoke({ action: "preview", token: tokens.invited });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ group_name: "Grupo sintético #18", role: "ATHLETE" });
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
  it("limita intentos a 10 por hora e IP entre peticiones Edge", async () => {
    for (let n = 0; n < 10; n++) expect((await invoke({ action: "accept", token: tokens.existing }, jwt, ips[2])).status).toBe(404);
    expect((await invoke({ action: "accept", token: tokens.existing }, jwt, ips[2])).status).toBe(429);
  });
});
