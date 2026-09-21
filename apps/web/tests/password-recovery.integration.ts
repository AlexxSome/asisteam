import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requestPasswordRecovery } from "../src/app/forgot-password/actions";
import { resetPassword } from "../src/app/reset-password/actions";

// Opt-in: pnpm --filter @asisteam/web test:integration, con Supabase local iniciado.
// Solo cuentas sintéticas y endpoints loopback. Nunca apunta a Cloud.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const createdIds: string[] = [];
const oldPassword = "clave inicial sintetica 2026";
const password = "una nueva clave sintetica 2026";
let admin: SupabaseClient;
let apiUrl: string;
let anonKey: string;
let mailUrl: string;

function client() {
  return createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sql(statement: string) {
  return execFileSync("docker", ["exec", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function createAccount(status: "ACTIVE" | "INVITED") {
  const email = `recovery-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: oldPassword, email_confirm: status === "ACTIVE",
    user_metadata: { full_name: "Cuenta sintética recuperación", birthdate: "1995-01-01" },
  });
  expect(error).toBeNull();
  const id = data.user!.id;
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  createdIds.push(id);
  // Preparación del fixture por SQL: el rol service_role no tiene grants
  // sobre public.users. No se amplían permisos de la aplicación para tests.
  sql(`UPDATE public.users SET account_status = '${status}' WHERE auth_user_id = '${id}'::uuid`);
  expect(sql(`SELECT account_status FROM public.users WHERE auth_user_id = '${id}'::uuid`)).toBe(status);
  return { email, id };
}

async function recoveryToken(email: string) {
  let messageId: string | undefined;
  await vi.waitFor(async () => {
    const response = await fetch(`${mailUrl}/api/v1/messages`);
    expect(response.ok).toBe(true);
    const inbox = await response.json();
    messageId = inbox.messages.find((message: { ID: string; To: { Address: string }[] }) =>
      message.To.some((recipient) => recipient.Address === email),
    )?.ID;
    expect(messageId).toBeTruthy();
  }, { timeout: 10_000, interval: 100 });
  const message = await (await fetch(`${mailUrl}/api/v1/message/${messageId}`)).json();
  const match = message.HTML.match(/href="([^"]*\/reset-password\?token=[^"]+)"/);
  expect(match).not.toBeNull();
  const url = new URL(match[1].replaceAll("&amp;", "&"));
  expect(url.origin).toBe("http://localhost:3000");
  expect(message.HTML).toContain("60 minutos");
  return url.searchParams.get("token")!;
}

describe("HU-GEN-03 con Supabase Auth y Mailpit reales", () => {
  beforeAll(() => {
    const status = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
    }));
    apiUrl = status.API_URL;
    anonKey = status.ANON_KEY;
    mailUrl = status.INBUCKET_URL;
    for (const endpoint of [apiUrl, mailUrl]) {
      if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) {
        throw new Error("La integración solo permite Supabase local");
      }
    }
    admin = createClient(apiUrl, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", apiUrl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      // Estas cuentas se crean en esta suite y no tienen historial de dominio.
      sql(`DELETE FROM public.users WHERE auth_user_id = '${id}'::uuid`);
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
    vi.unstubAllEnvs();
  });

  it.each(["ACTIVE", "INVITED"] as const)("envía correo a %s, cambia la contraseña y rechaza el mismo enlace", async (status) => {
    const account = await createAccount(status);
    expect(await requestPasswordRecovery({ email: account.email }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
    const token = await recoveryToken(account.email);
    expect(await resetPassword(token, { password, confirmPassword: password })).toEqual({ success: true });
    const login = client();
    expect((await login.auth.signInWithPassword({ email: account.email, password })).error).toBeNull();
    await login.auth.signOut();
    expect((await client().auth.signInWithPassword({ email: account.email, password: oldPassword })).error).not.toBeNull();
    expect(await resetPassword(token, { password, confirmPassword: password })).toHaveProperty("error");
  }, 20_000);

  it("mantiene la respuesta para un email inexistente y no envía correo", async () => {
    const email = `missing-${randomUUID()}@example.test`;
    expect(await requestPasswordRecovery({ email })).toEqual({ message: "Si el email existe, enviamos instrucciones" });
    const inbox = await (await fetch(`${mailUrl}/api/v1/messages`)).json();
    expect(inbox.messages.some((message: { To: { Address: string }[] }) =>
      message.To.some((recipient) => recipient.Address === email),
    )).toBe(false);
  });

  it("rechaza un enlace después de 60 minutos y conserva la contraseña anterior", async () => {
    const account = await createAccount("ACTIVE");
    await requestPasswordRecovery({ email: account.email });
    const token = await recoveryToken(account.email);
    expect(account.id).toMatch(/^[a-f0-9-]{36}$/);
    sql(`UPDATE auth.users SET recovery_sent_at = now() - interval '61 minutes' WHERE id = '${account.id}'::uuid`);
    expect(await resetPassword(token, { password, confirmPassword: password })).toHaveProperty("error");
    const login = client();
    expect((await login.auth.signInWithPassword({ email: account.email, password: oldPassword })).error).toBeNull();
    await login.auth.signOut();
  }, 20_000);
});
