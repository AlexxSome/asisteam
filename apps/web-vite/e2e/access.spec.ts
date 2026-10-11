import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { password, email, groups } from "./data.mjs";
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function sql(statement: string) {
  const { name } = JSON.parse(readFileSync(".qa/runtime.json", "utf8"));
  if (!/^asisteam-native-[a-f0-9]+$/.test(name)) throw new Error("Fixture propio requerido");
  try { return execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch { throw new Error("Falló una preparación sintética; diagnóstico privado omitido."); }
}
async function post(request: APIRequestContext, path: string, data: unknown) {
  const csrf = await (await request.get("/web-api/v1/auth/csrf")).json();
  return request.post("/web-api/v1/" + path, { headers: { Origin: "http://127.0.0.1:3130", "x-csrf-token": csrf.csrf_token }, data });
}
async function signIn(page: Page, address = email("first"), pass = password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Contraseña", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}
async function register(page: Page, address: string, birthdate = "1990-01-01") {
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Nombre completo", { exact: true }).fill("Persona sintética WEB216");
  await page.getByLabel("Fecha de nacimiento", { exact: true }).fill(birthdate);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
}
function issued(address: string, options: { expired?: boolean; managed?: string } = {}) {
  const token = randomBytes(32).toString("hex"), hash = createHash("sha256").update(token).digest("hex");
  const owner = sql(`select id from public.users where email=${quote(email("first"))}`);
  sql(`insert into public.invitations(id,token,email,role,group_id,created_by,status,created_at,expires_at${options.managed ? ",invited_user_id,activation_membership_id" : ""}) values('${randomUUID()}','${hash}',${quote(address)},'ATHLETE','${groups.second}','${owner}','PENDING',now()-interval '${options.expired ? "8 days" : "0 days"}',now()+interval '${options.expired ? "-1 day" : "7 days"}'${options.managed ? ", '"+options.managed+"', (select id from public.memberships where user_id='"+options.managed+"' and group_id='"+groups.second+"' and role='ATHLETE')" : ""});`);
  return { token, hash };
}
async function accessChecks(page: Page) {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
}
test("registro directo y desde código conserva aceptación legal; menor queda PENDING al recargar", async ({ page }) => {
  const address = `web216-minor-${randomUUID()}@synthetic.example.test`;
  await page.goto("/join?code=WEB21502");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await page.getByRole("link", { name: "Crear cuenta", exact: true }).click();
  await accessChecks(page);
  await register(page, address, "2015-01-01");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unirme con código", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Código de invitación")).toHaveValue("WEB21502");
  await page.getByRole("button", { name: "Unirme al grupo" }).click();
  await expect(page.getByRole("status")).toContainText("pendiente");
  await expect(page.getByRole("region", { name: "Mis solicitudes guardadas" })).toContainText("Pendiente · apoderado");
  await page.reload();
  await expect(page.getByRole("region", { name: "Mis solicitudes guardadas" })).toContainText("Pendiente de aprobación");
  expect(sql(`select m.role||':'||m.status from public.memberships m join public.users u on u.id=m.user_id where u.email=${quote(address)}`)).toBe("ATHLETE:PENDING");
  expect(sql(`select c.terms_version from public.account_consents c join public.users u on u.id=c.user_id where u.email=${quote(address)}`)).toBe("2026-09-21");
  await page.goto("/groups/" + groups.second);
  await expect(page.getByRole("heading", { name: "Recurso no disponible" })).toBeVisible();
});
test("registro sin grupos muestra bienvenida y raíz redirige a ella", async ({ page }) => {
  await page.goto("/register");
  await register(page, `web216-new-${randomUUID()}@synthetic.example.test`);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "¡Hola, Persona!" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await accessChecks(page);
});
test("invitación INVITED registra destinatario, consume una vez y no filtra datos en preview", async ({ page, context }) => {
  const address = `web216-invited-${randomUUID()}@synthetic.example.test`, { token, hash } = issued(address);
  // Canonical invited profile exists before credential registration.
  sql(`insert into public.users(id,email,full_name,account_status) values('${randomUUID()}',${quote(address)},'Persona invitada WEB216','INVITED');`);
  await page.goto("/invitations/" + token);
  await expect(page.getByRole("heading", { name: "Aceptar invitación", level: 1 })).toBeVisible();
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe("PENDING");
  expect(await page.getByText(address).count()).toBe(0);
  await page.getByRole("radio", { name: "Crear mi cuenta" }).check();
  await accessChecks(page);
  await register(page, address);
  await page.getByRole("button", { name: "Activar cuenta y aceptar" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groups.second}$`));
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe("ACCEPTED");
  expect(sql(`select account_status from public.users where email=${quote(address)}`)).toBe("ACTIVE");
  await context.clearCookies();
  await page.goto("/invitations/" + token);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.getByRole("button", { name: "Activar cuenta y aceptar" }).count()).toBe(0);
});
test("token inválido/vencido y destinatario distinto no aceptan una invitación", async ({ page, context }) => {
  await page.goto("/invitations/invalid");
  await expect(page.getByRole("alert")).toContainText("no está disponible");
  const { token, hash } = issued(`web216-wrong-${randomUUID()}@synthetic.example.test`);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await page.goto("/invitations/" + token);
  await page.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe("PENDING");
  await context.clearCookies();
  const expired = issued(`web216-expired-${randomUUID()}@synthetic.example.test`, { expired: true });
  await page.goto("/invitations/" + expired.token);
  await expect(page.getByRole("alert")).toContainText(/expir|venci/i);
});
test("cuenta ACTIVE acepta dirigida después de login y consentimiento pendiente preserva retorno", async ({ page }) => {
  const subject = randomUUID(), user = randomUUID(), address = `web216-active-${randomUUID()}@synthetic.example.test`;
  sql(`insert into app_private.auth_subjects(id,email,native_owned) values('${subject}',${quote(address)},true);insert into app_private.auth_credentials(subject_id,password_hash) values('${subject}',extensions.crypt(${quote(password)},extensions.gen_salt('bf',4)));insert into public.users(id,auth_user_id,email,full_name,birthdate,account_status) values('${user}','${subject}',${quote(address)},'Activo WEB216','1990-01-01','ACTIVE');`);
  const { token, hash } = issued(address);
  await page.goto("/invitations/" + token);
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión y aceptar" }).click();
  await expect(page.getByRole("heading", { name: "Revisa las condiciones de uso y privacidad" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("return_to")).toBe("/invitations/" + token);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  await page.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groups.second}$`));
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe("ACCEPTED");
});
test("MANAGED no inicia sesión; claim conserva identidad y membresía", async ({ page }) => {
  const user = randomUUID(), membership = randomUUID(), address = `web216-managed-${randomUUID()}@synthetic.example.test`;
  sql(`insert into public.users(id,full_name,birthdate,account_status) values('${user}','Gestionado WEB216','1990-01-01','MANAGED');insert into public.memberships(id,user_id,group_id,role,status) values('${membership}','${user}','${groups.second}','ATHLETE','ACTIVE');`);
  await signIn(page, address);
  await expect(page.getByRole("alert")).toBeVisible();
  const { token } = issued(address, { managed: user });
  await page.goto("/invitations/" + token);
  await expect(page.getByRole("heading", { name: "Activar mi cuenta", level: 1 })).toBeVisible();
  expect(await page.getByLabel("Fecha de nacimiento").count()).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Activar mi cuenta y ver mi historial" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groups.second}/me/history$`));
  expect(sql(`select id||':'||account_status||':'||full_name from public.users where email=${quote(address)}`)).toBe(user + ":ACTIVE:Gestionado WEB216");
  expect(sql(`select user_id from public.memberships where id='${membership}'`)).toBe(user);
});
test("recovery genérica conserva código; reset consume una vez, limpia URL y revoca sesión", async ({ page, context }) => {
  const subject = randomUUID(), user = randomUUID(), address = `web216-recovery-${randomUUID()}@synthetic.example.test`;
  sql(`insert into app_private.auth_subjects(id,email,native_owned) values('${subject}',${quote(address)},true);insert into app_private.auth_credentials(subject_id,password_hash) values('${subject}',extensions.crypt(${quote(password)},extensions.gen_salt('bf',4)));insert into public.users(id,auth_user_id,email,full_name,birthdate,account_status) values('${user}','${subject}',${quote(address)},'Recovery WEB216','1990-01-01','ACTIVE');insert into public.account_consents(user_id,terms_version,channel) values('${user}','2026-09-21','IN_APP');`);
  const before = await context.newPage(); await signIn(before, address);
  await expect(before.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await page.goto("/forgot-password?invite_code=WEB21502");
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  await expect(page.getByRole("status")).toHaveText("Si el email existe, enviamos instrucciones");
  const message = JSON.parse(readFileSync(".qa/email.json", "utf8"));
  const link = new URL(message.text.match(/http:\/\/\S+/)[0]), token = link.searchParams.get("token")!;
  expect(link.searchParams.get("invite_code")).toBe("WEB21502");
  await page.goto(link.href);
  await accessChecks(page);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(password + "new");
  await page.getByLabel("Confirmar nueva contraseña").fill(password + "new");
  await page.getByRole("button", { name: "Guardar nueva contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Tu contraseña fue actualizada");
  expect(new URL(page.url()).searchParams.has("token")).toBe(false);
  await expect(before.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await page.goto(link.href);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(password + "again");
  await page.getByLabel("Confirmar nueva contraseña").fill(password + "again");
  await page.getByRole("button", { name: "Guardar nueva contraseña" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const logs = readFileSync(".qa/logs.json", "utf8");
  expect(logs.includes(token)).toBe(false); expect(logs.includes(address)).toBe(false);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`missing-${randomUUID()}@synthetic.example.test`);
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  await expect(page.getByRole("status")).toHaveText("Si el email existe, enviamos instrucciones");
});
test("errores de red no simulan éxito; recuperación y preview permiten reintento", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.route("**/web-api/v1/auth/recovery", route => route.abort());
  await page.getByLabel("Email").fill(`fault-${randomUUID()}@synthetic.example.test`);
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.getByText("Si el email existe, enviamos instrucciones").count()).toBe(0);
  await page.unroute("**/web-api/v1/auth/recovery");
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  await expect(page.getByRole("status")).toHaveText("Si el email existe, enviamos instrucciones");
  const { token } = issued(`web216-fault-${randomUUID()}@synthetic.example.test`);
  await page.route("**/web-api/v1/invitations/preview", route => route.abort());
  await page.goto("/invitations/" + token);
  await expect(page.getByRole("heading", { name: "No pudimos cargar la página" })).toBeVisible();
  await page.unroute("**/web-api/v1/invitations/preview");
  await page.getByRole("button", { name: "Volver a cargar" }).click();
  await expect(page.getByRole("heading", { name: "Aceptar invitación", level: 1 })).toBeVisible();
});
test("OAuth/callbacks Nest y enlaces sensibles tienen headers sin datos privados", async ({ page, request }) => {
  for (const route of ["/login", "/register", "/forgot-password", "/reset-password?token=" + "a".repeat(64), "/invitations/" + "b".repeat(64), "/accept-terms", "/auth/callback", "/auth/callback/google?code=synthetic-private-code&state=synthetic-private-state"]) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-robots-tag"]).toBe("noindex,nofollow");
  }
  const providers = await (await request.get("/web-api/v1/auth/social/providers")).json();
  expect(providers).toEqual({ google: true, apple: false });
  await page.goto("/login?social_error=1&return_to=https://evil.example.test");
  await expect(page.getByRole("alert")).toContainText("No pudimos iniciar sesión");
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continuar con Apple" })).toBeDisabled();
  const unavailable = await post(request, "auth/social/start", { provider: "apple", context: {} });
  expect(unavailable.status()).toBe(503);
  const logs = readFileSync(".qa/logs.json", "utf8");
  expect(logs.includes("synthetic-private-code")).toBe(false);
  expect(logs.includes("synthetic-private-state")).toBe(false);
});

test("OAuth Google atraviesa start, proveedor sintético firmado, callback y consentimiento; replay no duplica identidad", async ({ page }) => {
  const address = `web216-oauth-${randomUUID()}@synthetic.example.test`;
  let callback = "";
  await page.route("https://accounts.google.com/o/oauth2/v2/auth**", async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const code = Buffer.from(JSON.stringify({ nonce: url.searchParams.get("nonce"), email: address, sub: randomUUID() })).toString("base64url");
    callback = "http://127.0.0.1:3130/auth/callback/google?" + new URLSearchParams({ code, state: url.searchParams.get("state")! });
    await route.fulfill({ contentType: "text/html", body: `<html lang="es"><script>location.replace(${JSON.stringify(callback)})</script></html>` });
  });
  await page.goto("/login?invite_code=WEB21502");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.getByRole("heading", { name: "Revisa las condiciones de uso y privacidad" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("return_to")).toBe("/join?code=WEB21502");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Unirme con código", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Código de invitación")).toHaveValue("WEB21502");
  await page.goto(callback);
  // Replay goes to login; an already live session then resumes authorized groups.
  expect(sql(`select count(*) from public.users where email=${quote(address)}`)).toBe("1");
  const logs = readFileSync(".qa/logs.json", "utf8");
  expect(logs.includes(address)).toBe(false);
  expect(logs.includes(new URL(callback).searchParams.get("code")!)).toBe(false);
});

test("raíz recuerda únicamente un grupo autorizado y descarta una cookie ajena", async ({ page, context }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await page.goto("/groups/" + groups.second);
  await expect(page.getByRole("heading", { name: "Club WEB215 second" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/groups/${groups.second}$`));
  const saved = (await context.cookies()).find(cookie => cookie.name.startsWith("asisteam-group-"))!;
  await context.addCookies([{ name: saved.name, value: randomUUID(), url: "http://127.0.0.1:3130" }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
});

test("OAuth rechaza state distinto sin crear identidad ni registrar el código", async ({ request }) => {
  const started = await post(request, "auth/social/start", { provider: "google", context: {} });
  expect(started.status()).toBe(200);
  const response = await request.get("/auth/callback/google?code=synthetic-wrong-state-code&state=wrong-state", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()["location"]).toBe("http://127.0.0.1:3130/login?social_error=1");
  expect(readFileSync(".qa/logs.json", "utf8").includes("synthetic-wrong-state-code")).toBe(false);
});
