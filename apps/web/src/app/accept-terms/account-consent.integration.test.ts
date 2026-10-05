import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { ACCOUNT_TERMS_VERSION } from "@asisteam/core";

const suite = describe.skipIf(process.env.RUN_ACCOUNT_CONSENT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue107-${run}-${name}@example.test`;
const password = "Synthetic-password-107!";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const groupId = randomUUID();
const secret = process.env.INVITATION_PROXY_SECRET ?? "";
const ip = `issue107-${run}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let apiUrl: string; let anonKey: string; let admin: SupabaseClient; let pending: SupabaseClient;
let pendingUserId: string;
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
async function invoke(body: unknown, bearer?: string) {
  const response = await fetch(`${apiUrl}/functions/v1/accept-invitation`, { method: "POST",
    headers: { "Content-Type": "application/json", "x-asisteam-proxy": secret, "x-asisteam-client-ip": ip,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

suite("#107: Auth + RPC + Edge con aceptación versionada", () => {
  beforeAll(async () => {
    if (!secret) throw new Error("Falta el secreto sintético del Edge local");
    const config = JSON.parse(execFileSync("../../node_modules/.bin/supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    apiUrl = config.API_URL; anonKey = config.ANON_KEY;
    if (!["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("Solo se admiten pruebas locales");
    admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, options);
    const created = await admin.auth.admin.createUser({ email: email("pending"), password, email_confirm: true,
      user_metadata: { full_name: "Cuenta sin evidencia", birthdate: "1990-01-01" } });
    expect(created.error).toBeNull();
    pending = createClient(apiUrl, anonKey, options);
    expect((await pending.auth.signInWithPassword({ email: email("pending"), password })).error).toBeNull();
    pendingUserId = sql(`select id from public.users where email='${email("pending")}';`);
    sql(`insert into public.groups(id,name,invite_code,created_by) values('${groupId}','Club #107','${run.slice(0,8)}','${pendingUserId}');`);
  });
  afterAll(async () => {
    if (!admin) return;
    const users = `select id from public.users where email like 'issue107-${run}-%@example.test'`;
    const authIds = sql(`select auth_user_id from public.users where id in (${users}) and auth_user_id is not null;`).split("\n").filter(Boolean);
    // Limpieza exclusivamente de este fixture local; producción conserva evidencia.
    sql(`begin; set local session_replication_role=replica;
      delete from app_private.invitation_registrations where token_hash in (select token from public.invitations where group_id='${groupId}');
      delete from public.invitations where group_id='${groupId}';
      delete from public.memberships where group_id='${groupId}';
      delete from public.groups where id='${groupId}';
      delete from public.account_consents where user_id in (${users});
      delete from public.users where id in (${users});
      delete from app_private.invitation_attempts where key='${hash(`${secret}:accept:${ip}`)}'; commit;`);
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
  });

  it("email captura evidencia de servidor y un login/reintento conserva la misma fila", async () => {
    const client = createClient(apiUrl, anonKey, options);
    const result = await client.auth.signUp({ email: email("signup"), password, options: { data: {
      full_name: "Registro sintético", birthdate: "1990-01-01", account_terms: { accepted: true, version: ACCOUNT_TERMS_VERSION },
    } } });
    expect(result.error).toBeNull(); expect(result.data.session).toBeTruthy();
    const evidence = await client.from("account_consents").select("id,terms_version,granted_at,channel").single();
    expect(evidence.error).toBeNull();
    expect(evidence.data).toMatchObject({ terms_version: ACCOUNT_TERMS_VERSION, channel: "EMAIL_SIGNUP", granted_at: expect.any(String) });
    const retried = await Promise.all([1,2,3].map(() => client.rpc("accept_account_terms", { p_accepted: true, p_terms_version: ACCOUNT_TERMS_VERSION })));
    for (const retry of retried) { expect(retry.error).toBeNull(); expect(retry.data).toBe(evidence.data!.id); }
    expect((await client.from("account_consents").select("id,terms_version,granted_at,channel").single()).data).toEqual(evidence.data);
    expect((await pending.from("account_consents").select("id").eq("id", evidence.data!.id)).data).toEqual([]);
  });
  it("una aceptación inválida en Auth revierte perfil y credenciales", async () => {
    const client = createClient(apiUrl, anonKey, options);
    const result = await client.auth.signUp({ email: email("invalid"), password, options: { data: {
      full_name: "Registro inválido", account_terms: { accepted: false, version: ACCOUNT_TERMS_VERSION },
    } } });
    expect(result.error).toBeTruthy();
    expect(sql(`select count(*) from auth.users where email='${email("invalid")}';`)).toBe("0");
    expect(sql(`select count(*) from public.users where email='${email("invalid")}';`)).toBe("0");
  });
  it("una cuenta sin evidencia no consume la invitación hasta aceptar explícitamente", async () => {
    const token = randomUUID();
    sql(`insert into public.invitations(group_id,email,invited_user_id,role,token,created_by)
      values('${groupId}','${email("pending")}','${pendingUserId}','GUARDIAN','${hash(token)}','${pendingUserId}');`);
    const jwt = (await pending.auth.getSession()).data.session!.access_token;
    expect((await pending.rpc("has_account_consent")).data).toBe(false);
    const refused = await invoke({ action: "accept", token }, jwt);
    expect(refused.status).toBe(422); expect(refused.body.error.code).toBe("account_terms_required");
    expect(sql(`select status from public.invitations where token='${hash(token)}';`)).toBe("PENDING");
    expect((await pending.rpc("accept_account_terms", { p_accepted: false, p_terms_version: ACCOUNT_TERMS_VERSION })).error).toBeTruthy();
    expect((await pending.rpc("accept_account_terms", { p_accepted: true, p_terms_version: ACCOUNT_TERMS_VERSION })).error).toBeNull();
    expect((await invoke({ action: "accept", token }, jwt)).status).toBe(200);
  });
  it("invitación rechaza versión antigua y registra la aceptación nueva una sola vez", async () => {
    const id = randomUUID(); const token = randomUUID();
    sql(`insert into public.users(id,full_name,email,birthdate,account_status) values('${id}','Invitado','${email("invited")}','1990-01-01','INVITED');
      insert into public.invitations(group_id,email,invited_user_id,role,token,created_by)
      values('${groupId}','${email("invited")}','${id}','GUARDIAN','${hash(token)}','${pendingUserId}');`);
    const registration = { full_name: "Invitado", email: email("invited"), birthdate: "1990-01-01", password, terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
    expect((await invoke({ action: "register", token, registration: { ...registration, terms_version: "old" } })).status).toBe(400);
    expect(sql(`select count(*) from auth.users where email='${email("invited")}';`)).toBe("0");
    expect((await invoke({ action: "register", token, registration })).status).toBe(200);
    const evidence = sql(`select to_jsonb(c) from public.account_consents c where user_id='${id}';`);
    expect(JSON.parse(evidence)).toMatchObject({ terms_version: ACCOUNT_TERMS_VERSION, channel: "INVITATION" });
    expect((await invoke({ action: "register", token, registration })).status).toBe(404);
    expect(sql(`select to_jsonb(c) from public.account_consents c where user_id='${id}';`)).toBe(evidence);
    expect(sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id where g.guardian_user_id='${id}';`)).toBe("0");
  });
});
