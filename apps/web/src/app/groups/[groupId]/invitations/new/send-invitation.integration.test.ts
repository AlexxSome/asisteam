import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createSendInvitationHandler } from "../../../../../../../../supabase/functions/send-invitation/handler";

// Auth/PostgREST/Postgres reales, exclusivamente locales. Únicamente el
// transporte Resend se sustituye: nunca sale correo de fixtures sintéticos.
const suite = describe.skipIf(process.env.RUN_SEND_INVITATION_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const groupId = randomUUID();
const otherGroupId = randomUUID();
const limitGroupId = randomUUID();
const email = (name: string) => `issue23-${run}-${name}@example.test`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const credentials = new Map<string, { authId: string; profileId: string; jwt: string }>();
const emails: { to: string[]; text: string }[] = [];
let admin: SupabaseClient;
let handler: ReturnType<typeof createSendInvitationHandler>;
let rejectEmail = false;
let issuedId: string;
let firstToken: string;
let resentId: string;
let resentToken: string;
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function invoke(body: unknown, actor = "admin") {
  const response = await handler(new Request("http://local.test/send-invitation", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${credentials.get(actor)?.jwt ?? "invalid"}` }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}
const tokenFromEmail = () => emails.at(-1)!.text.match(/\/invitations\/([a-f0-9]{64})/)![1]!;

suite("emisión Edge + Auth + Postgres local", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of ["admin", "athlete", "guardian", "outsider"]) {
      const password = "Synthetic-password-23!";
      const created = await admin.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Fixture emisión", birthdate: "1990-01-01" } });
      if (created.error || !created.data.user) throw new Error("Error preparando fixture Auth");
      const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await client.auth.signInWithPassword({ email: email(name), password });
      if (!login.data.session) throw new Error("Error autenticando fixture");
      credentials.set(name, { authId: created.data.user.id, profileId: sql(`select id from public.users where auth_user_id='${created.data.user.id}';`), jwt: login.data.session.access_token });
    }
    for (const [id, code] of [[groupId, run.slice(0,8)], [otherGroupId, run.slice(8,16)], [limitGroupId, run.slice(16,24)]]) {
      sql(`insert into public.groups(id,name,invite_code,created_by) values('${id}','Grupo emisión sintética','${code}','${credentials.get("admin")!.profileId}');`);
    }
    sql(`insert into public.memberships(user_id,group_id,role,status) values
      ('${credentials.get("admin")!.profileId}','${groupId}','ADMIN','ACTIVE'),
      ('${credentials.get("admin")!.profileId}','${limitGroupId}','ADMIN','ACTIVE'),
      ('${credentials.get("athlete")!.profileId}','${groupId}','ATHLETE','ACTIVE'),
      ('${credentials.get("guardian")!.profileId}','${groupId}','GUARDIAN','ACTIVE'),
      ('${credentials.get("outsider")!.profileId}','${otherGroupId}','ADMIN','ACTIVE');`);
    handler = createSendInvitationHandler({ client: admin, resendApiKey: "synthetic", emailFrom: "Asisteam <invitations@example.test>",
      webUrl: "http://localhost:3000", allowedOrigins: [], sendEmail: async (_url, init) => {
        if (rejectEmail) return new Response("private transport error", { status: 503 });
        emails.push(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ id: randomUUID() }));
      } });
  }, 30_000);
  afterAll(async () => {
    if (!admin) return;
    const ids = sql(`select auth_user_id from public.users where email like 'issue23-${run}-%@example.test' and auth_user_id is not null;`).split("\n").filter(Boolean);
    sql(`delete from public.invitations where group_id in ('${groupId}','${otherGroupId}','${limitGroupId}');
      delete from public.memberships where group_id in ('${groupId}','${otherGroupId}','${limitGroupId}');
      delete from public.groups where id in ('${groupId}','${otherGroupId}','${limitGroupId}');
      delete from public.users where email like 'issue23-${run}-%@example.test';`);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  it("Auth real rechaza JWT falso y SQL limita a ADMIN de ese grupo", async () => {
    const body = { action: "send", group_id: groupId, email: email("unauthorized"), role: "ATHLETE" };
    for (const [actor, status] of [["none",401], ["athlete",403], ["guardian",403], ["outsider",404]] as const) {
      expect((await invoke(body, actor)).status).toBe(status);
    }
    expect(emails).toHaveLength(0);
    expect(sql(`select count(*) from public.users where email='${email("unauthorized")}';`)).toBe("0");
  });
  it("envía el enlace y persiste hash, perfil INVITED y siete días", async () => {
    const result = await invoke({ action: "send", group_id: groupId, email: email("new").toUpperCase(), role: "ATHLETE" });
    expect(result.status).toBe(200);
    expect(Object.keys(result.body.invitation).sort()).toEqual(["expires_at", "id", "status"]);
    issuedId = result.body.invitation.id; firstToken = tokenFromEmail();
    expect(emails.at(-1)!.to).toEqual([email("new")]);
    expect(sql(`select token from public.invitations where id='${issuedId}';`)).toBe(digest(firstToken));
    expect(sql(`select role||':'||status||':'||(expires_at-created_at = interval '7 days') from public.invitations where id='${issuedId}';`)).toBe("ATHLETE:PENDING:true");
    expect(sql(`select account_status||':'||(auth_user_id is null) from public.users where email='${email("new")}';`)).toBe("INVITED:true");
    expect(JSON.stringify(result.body)).not.toContain(firstToken);
    expect(JSON.stringify(result.body)).not.toContain("INVITED");
  });
  it("reenvío invalida token anterior y renueva vigencia sin duplicar perfil", async () => {
    sql(`update public.invitations set created_at=now()-interval '6 days', expires_at=now()+interval '1 day' where id='${issuedId}';`);
    const result = await invoke({ action: "resend", group_id: groupId, invitation_id: issuedId });
    expect(result.status).toBe(200);
    resentId = result.body.invitation.id; resentToken = tokenFromEmail();
    expect(resentToken).not.toBe(firstToken);
    expect(resentId).not.toBe(issuedId);
    expect(sql(`select status from public.invitations where id='${issuedId}';`)).toBe("EXPIRED");
    expect((await admin.rpc("invitation_context", { p_token_hash: digest(firstToken) })).data.error).toBe("invitation_expired");
    expect(sql(`select expires_at > now()+interval '6 days' from public.invitations where id='${resentId}';`)).toBe("t");
    expect(sql(`select count(*) from public.users where email='${email("new")}';`)).toBe("1");
  });
  it("el enlace emitido completa registro GoTrue sobre el mismo perfil", async () => {
    const profileId = sql(`select id from public.users where email='${email("new")}';`);
    const nonce = randomUUID();
    const prepared = await admin.rpc("prepare_invitation_registration", { p_token_hash: digest(resentToken), p_nonce_hash: digest(nonce), p_email: email("new"),
      p_registration: { full_name: "Invitado confirmado", birthdate: "1990-01-01", terms_version: "2026-09-21" } });
    expect(prepared.error).toBeNull();
    const created = await admin.auth.admin.createUser({ email: email("new"), password: "Synthetic-password-23!", email_confirm: true,
      user_metadata: { invitation_registration_nonce: nonce } });
    expect(created.error).toBeNull();
    expect(sql(`select id||':'||account_status from public.users where email='${email("new")}';`)).toBe(`${profileId}:ACTIVE`);
    expect(sql(`select status from public.invitations where id='${resentId}';`)).toBe("ACCEPTED");
    expect((await invoke({ action: "resend", group_id: groupId, invitation_id: resentId })).status).toBe(404);
  });
  it("cuenta existente recibe GUARDIAN sin filtrar su existencia ni cambiar ATHLETE", async () => {
    const result = await invoke({ action: "send", group_id: groupId, email: email("athlete"), role: "GUARDIAN" });
    expect(result.status).toBe(200);
    expect(Object.keys(result.body.invitation).sort()).toEqual(["expires_at", "id", "status"]);
    expect(sql(`select invited_user_id from public.invitations where id='${result.body.invitation.id}';`)).toBe(credentials.get("athlete")!.profileId);
    expect(sql(`select role from public.memberships where group_id='${groupId}' and user_id='${credentials.get("athlete")!.profileId}';`)).toBe("ATHLETE");
    expect((await admin.rpc("accept_invitation", { p_token_hash: digest(tokenFromEmail()), p_auth_user_id: credentials.get("athlete")!.authId })).data.membership_status).toBe("ACTIVE");
  });
  it("reenvíos simultáneos sustituyen una invitación una sola vez", async () => {
    const initial = await invoke({ action: "send", group_id: groupId, email: email("race"), role: "ATHLETE" });
    const body = { action: "resend", group_id: groupId, invitation_id: initial.body.invitation.id };
    const results = await Promise.all([invoke(body), invoke(body)]);
    expect(results.map(result => result.status).sort()).toEqual([200,404]);
    expect(sql(`select count(*) from public.invitations where email='${email("race")}' and status='PENDING';`)).toBe("1");
  });
  it("fallo de correo es recuperable y no devuelve detalles del proveedor", async () => {
    rejectEmail = true;
    const failed = await invoke({ action: "send", group_id: groupId, email: email("retry"), role: "GUARDIAN" });
    rejectEmail = false;
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe("email_delivery_failed");
    expect(JSON.stringify(failed.body)).not.toContain("private transport");
    const id = sql(`select id from public.invitations where email='${email("retry")}';`);
    expect((await invoke({ action: "resend", group_id: groupId, invitation_id: id })).status).toBe(200);
    expect(sql(`select status from public.invitations where id='${id}';`)).toBe("EXPIRED");
  });
  it("cuota compartida impide que dos solicitudes consuman el último cupo", async () => {
    sql(`insert into app_private.invitation_send_limits(group_id,day,attempts) values('${limitGroupId}',app_private.chile_today(),49);`);
    const results = await Promise.all([1,2].map(n => invoke({ action: "send", group_id: limitGroupId, email: email(`quota-${n}`), role: "ATHLETE" })));
    expect(results.map(result => result.status).sort()).toEqual([200,429]);
    expect(sql(`select attempts from app_private.invitation_send_limits where group_id='${limitGroupId}';`)).toBe("50");
    expect(sql(`select count(*) from public.invitations where group_id='${limitGroupId}';`)).toBe("1");
  });
});
