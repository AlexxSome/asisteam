import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { nativeBrowserDatabase } from "../../api/test/native-browser-database.mjs";
import { createApplication } from "../../api/dist/application.js";
import { loadFixtureConfig } from "../../api/test/fixture-config.mjs";
import { SafeLogger } from "../../api/dist/logger.js";
import { password, email, groups } from "./data.mjs";
let database, app, vite, closing;
const stop = () =>
  (closing ??= (async () => {
    await vite?.close();
    await app?.close();
    await database?.cleanup();
    rmSync(".qa/runtime.json", { force: true });
  })());
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await stop();
    process.exit(0);
  });
try {
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
  app = await createApplication(
    loadFixtureConfig({
      DATABASE_URL: roleUrl("asisteam_api"),
      WEB_AUTH_ENABLED: "1",
      NATIVE_AUTH_WEB_URL: "http://127.0.0.1:3130",
    }),
    new SafeLogger(() => {}),
  );
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
