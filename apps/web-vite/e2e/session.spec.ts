import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { password, email, groups } from "./data.mjs";
const sql = (statement: string) => {
  const { name } = JSON.parse(readFileSync(".qa/runtime.json", "utf8"));
  if (!/^asisteam-native-[a-f0-9]+$/.test(name))
    throw new Error("Fixture propio requerido");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      name,
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
};
async function login(page: Page, role = "first") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email(role));
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name:
        role === "pending"
          ? "Revisa las condiciones de uso y privacidad"
          : "Mis grupos",
      exact: true,
    }),
  ).toBeVisible();
}
test("login → selección/cambio de grupo → recarga → logout y Atrás", async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Club WEB215 first" }).click();
  await expect(
    page.getByRole("heading", { name: "Club WEB215 first", level: 1 }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Club WEB215 first", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cambiar grupo" }).click();
  await page.getByRole("link", { name: "Club WEB215 second" }).click();
  await expect(
    page.getByRole("heading", { name: "Club WEB215 second", level: 1 }),
  ).toBeVisible();
  expect(await page.getByText("Club WEB215 first").count()).toBe(0);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "asisteam-web-session")?.httpOnly).toBe(
    true,
  );
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  expect(await page.getByText("Club WEB215 second").count()).toBe(0);
});
test("acceso directo sin sesión y después del login; grupo ajeno 404 sin datos", async ({
  page,
}) => {
  await page.goto("/groups/" + groups.second);
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email("second"));
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Club WEB215 second", level: 1 }),
  ).toBeVisible();
  await page.goto("/groups/" + groups.first);
  await expect(
    page.getByRole("heading", { name: "Recurso no disponible" }),
  ).toBeVisible();
  expect(await page.getByText("Club WEB215 first").count()).toBe(0);
});
test("consentimiento exige confirmación explícita antes de grupos", async ({
  page,
}) => {
  await login(page, "pending");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await expect(page.getByText("Aún no perteneces a un grupo.")).toBeVisible();
});
test("familia expirada elimina DTOs al recargar y vuelve a login", async ({
  page,
}) => {
  await login(page);
  sql(
    `update app_private.auth_families set expires_at=now()-interval '1 second' where subject_id in (select id from app_private.auth_subjects where email='${email("first")}');`,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  expect(await page.getByText("Club WEB215 first").count()).toBe(0);
});
test("logout de otra pestaña descarta identidad y login distinto no conserva grupos", async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto("/groups");
  await expect(
    other.getByRole("heading", { name: "Mis grupos" }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await login(page, "second");
  expect(await page.getByText("Club WEB215 first").count()).toBe(0);
  await expect(
    page.getByRole("link", { name: "Club WEB215 second" }),
  ).toBeVisible();
});
test("responsive/axe, error de transporte recuperable y ningún write duplicado", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/web-api/v1/auth/login")
    )
      writes++;
  });
  await login(page);
  expect(writes).toBe(1);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((item) => item.id)).toEqual([]);
  await page.route("**/web-api/v1/me/groups?*", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar la página" }),
  ).toBeVisible();
  expect(await page.getByText("Aún no perteneces a un grupo.").count()).toBe(0);
  await page.unroute("**/web-api/v1/me/groups?*");
  await page.getByRole("button", { name: "Volver a cargar" }).click();
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
});
