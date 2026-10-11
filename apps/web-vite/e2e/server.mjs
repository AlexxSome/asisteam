import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { nativeBrowserDatabase } from "../../api/test/native-browser-database.mjs";
import { createApplication } from "../../api/dist/application.js";
import { loadFixtureConfig } from "../../api/test/fixture-config.mjs";
import { TransactionalEmail } from "../../api/dist/email.js";
import { SafeLogger } from "../../api/dist/logger.js";
import { password, email, groups } from "./data.mjs";
const { SignJWT, generateKeyPair, exportJWK } = createRequire(new URL("../../api/package.json", import.meta.url))("jose");
const originalFetch = globalThis.fetch;
let database, app, vite, closing;
const stop = () =>
  (closing ??= (async () => {
    globalThis.fetch = originalFetch;
    await vite?.close();
    await app?.close();
    await database?.cleanup();
    for (const file of ["runtime.json", "email.json", "logs.json"])
      rmSync(".qa/" + file, { force: true });
  })());
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await stop();
    process.exit(0);
  });
try {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "web216", alg: "RS256", use: "sig" };
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    if (address.startsWith("https://api.pwnedpasswords.com/range/")) return new Response("A".repeat(35) + ":0");
    if (address === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
    if (address === "https://oauth2.googleapis.com/token") {
      const params = new URLSearchParams(init.body);
      const code = JSON.parse(Buffer.from(params.get("code"), "base64url").toString());
      if (!params.get("code_verifier") || params.get("redirect_uri") !== "http://127.0.0.1:3130/auth/callback/google") throw new Error("synthetic_oidc_invalid");
      const token = await new SignJWT({ sub: code.sub, email: code.email, email_verified: true, nonce: code.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "web216" }).setIssuer("https://accounts.google.com")
        .setAudience("google-client").setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ access_token: "synthetic-provider-token", token_type: "Bearer", id_token: token });
    }
    return originalFetch(url, init);
  };
  database = await nativeBrowserDatabase();
  const sql = (statement) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        database.name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  const users = {};
  for (const role of ["first", "second", "pending"]) {
    const subject = randomUUID(),
      user = randomUUID();
    users[role] = user;
    sql(`insert into app_private.auth_subjects(id,email,native_owned) values('${subject}','${email(role)}',true);
   insert into app_private.auth_credentials(subject_id,password_hash) values('${subject}',extensions.crypt('${password}',extensions.gen_salt('bf',4)));
   insert into public.users(id,auth_user_id,email,full_name,birthdate,account_status) values('${user}','${subject}','${email(role)}','Persona sintética WEB215','1990-01-01','ACTIVE');`);
    if (role !== "pending")
      sql(
        `insert into public.account_consents(user_id,terms_version,channel) values('${user}','2026-09-21','IN_APP');`,
      );
  }
  for (const [key, id] of Object.entries(groups))
    sql(`insert into public.groups(id,name,sport,invite_code,created_by) values('${id}','Club WEB215 ${key}','Tenis','WEB2150${key === "first" ? "1" : "2"}','${users.first}');
  insert into public.memberships(user_id,group_id,role,status) values('${users.first}','${id}','ADMIN','ACTIVE');`);
  sql(
    `insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at) values('${randomUUID()}','${groups.second}','ACADEMY',15990,1000,'${users.first}','AUTHORIZED',now());`,
  );
  sql(
    `insert into public.memberships(user_id,group_id,role,status) values('${users.second}','${groups.second}','ATHLETE','ACTIVE');`,
  );
  const roleUrl = (role) => {
    const url = new URL(database.url);
    url.username = role;
    return url.toString();
  };
  const logs = [];
  mkdirSync(".qa", { recursive: true, mode: 0o700 });
  app = await createApplication(
    loadFixtureConfig({
      DATABASE_URL: roleUrl("asisteam_api"),
      OAUTH_GOOGLE_CLIENT_ID: "google-client",
      OAUTH_GOOGLE_CLIENT_SECRET: "synthetic-google",
      INVITATION_DATABASE_URL: roleUrl("asisteam_invitation"),
      INVITATION_PROXY_SECRET: "3".repeat(64),
      INVITATION_WEB_URL: "http://127.0.0.1:3130",
      RESEND_API_KEY: "synthetic-email-only",
      INVITATION_EMAIL_FROM: "qa@synthetic.example.test",
      WEB_AUTH_ENABLED: "1",
      NATIVE_AUTH_WEB_URL: "http://127.0.0.1:3130",
    }),
    new SafeLogger(line => {
      logs.push(line);
      writeFileSync(".qa/logs.json", JSON.stringify(logs), { mode: 0o600 });
    }),
  );
  app.get(TransactionalEmail).send = async (payload) => {
    writeFileSync(".qa/email.json", JSON.stringify(payload), { mode: 0o600 });
  };
  await app.listen(0, "127.0.0.1");
  process.env.ASISTEAM_VITE_API_TARGET = await app.getUrl();
  mkdirSync(".qa", { recursive: true, mode: 0o700 });
  writeFileSync(".qa/runtime.json", JSON.stringify({ name: database.name }), {
    mode: 0o600,
  });
  vite = await createServer();
  await vite.listen();
  console.log("WEB215: Nest/PostgreSQL sintéticos y frontend aislado listos.");
} catch {
  await stop();
  console.error(
    "WEB215: falló el arranque del entorno sintético; diagnóstico privado omitido.",
  );
  process.exitCode = 1;
}
