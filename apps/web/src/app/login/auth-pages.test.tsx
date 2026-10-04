// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), signUp: vi.fn(), signIn: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {
  getUser: mock.getUser, signUp: mock.signUp, signInWithPassword: mock.signIn,
} }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("@/lib/social-auth", () => ({ getSocialProviderAvailability: async () => ({ google: true, apple: false }) }));
vi.mock("@/components/social-login-buttons", () => ({ SocialLoginButtons: ({ context }: { context?: { invite_code?: string } }) => <div data-testid="social-context">{context?.invite_code}</div> }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/app/groups/[groupId]/actions", () => ({ joinByCode: vi.fn() }));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import LoginPage from "./page";
import RegisterPage from "../register/page";
import ForgotPasswordPage from "../forgot-password/page";
import ResetPasswordPage from "../reset-password/page";
import JoinPage from "../join/page";
import { registerUser } from "../register/actions";
import { loginUser } from "./actions";

const profile = { full_name: "Persona Sintética", email: "persona@example.test", password: "test-password-123", birthdate: "2000-01-01" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: null } });
  mock.signUp.mockResolvedValue({ error: null });
  mock.signIn.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it("invitación → login → crear cuenta → retorno al código, también con OAuth", async () => {
  await expect(JoinPage({ searchParams: Promise.resolve({ code: "ABCD1234" }) })).rejects.toThrow("redirect:/login?invite_code=ABCD1234");
  render(await LoginPage({ searchParams: Promise.resolve({ invite_code: "ABCD1234" }) }));
  const href = screen.getByRole("link", { name: "Crea una" }).getAttribute("href")!;
  expect(href).toBe("/register?invite_code=ABCD1234");
  cleanup();
  const invite_code = new URL(href, "https://asisteam.test").searchParams.get("invite_code")!;
  render(await RegisterPage({ searchParams: Promise.resolve({ invite_code }) }));
  expect(screen.getByTestId("social-context").textContent).toBe("ABCD1234");
  expect(screen.getByRole("link", { name: "Inicia sesión" }).getAttribute("href")).toBe("/login?invite_code=ABCD1234");
  await expect(registerUser(profile, invite_code)).rejects.toThrow("redirect:/join?code=ABCD1234");
  expect(mock.signUp.mock.calls[0]![0].options.data).not.toHaveProperty("invite_code");
  await expect(loginUser(profile, invite_code)).rejects.toThrow("redirect:/join?code=ABCD1234");
});

it.each(["//evil.test", "https://evil.test", "ABCD1234&token=secret", ["ABCD1234", "CODE0002"]])("las páginas descartan código inválido o duplicado (%j)", async invite_code => {
  render(await LoginPage({ searchParams: Promise.resolve({ invite_code }) }));
  expect(screen.getByRole("link", { name: "Crea una" }).getAttribute("href")).toBe("/register");
  expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).getAttribute("href")).toBe("/forgot-password");
  cleanup();
  render(await RegisterPage({ searchParams: Promise.resolve({ invite_code }) }));
  expect(screen.getByRole("link", { name: "Inicia sesión" }).getAttribute("href")).toBe("/login");
  expect(screen.getByTestId("social-context").textContent).toBe("");
  await expect(registerUser(profile, invite_code as string)).rejects.toThrow("redirect:/welcome");
});

it("recuperación y restablecimiento conservan la invitación sin trasladar el token a enlaces secundarios", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({ invite_code: "ABCD1234" }) }));
  expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).getAttribute("href")).toBe("/forgot-password?invite_code=ABCD1234");
  cleanup();
  render(await ForgotPasswordPage({ searchParams: Promise.resolve({ invite_code: "ABCD1234" }) }));
  expect(screen.getByRole("link").getAttribute("href")).toBe("/login?invite_code=ABCD1234");
  cleanup();
  mock.cookie.mockReturnValue({ value: "ABCD1234" });
  render(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "synthetic-token" }) }));
  expect(screen.getByRole("link", { name: "Volver a iniciar sesión" }).getAttribute("href")).toBe("/login?invite_code=ABCD1234");
  expect(screen.getByRole("link", { name: "Solicitar un nuevo enlace" }).getAttribute("href")).toBe("/forgot-password?invite_code=ABCD1234");
  for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).not.toContain("token");
});

it("restablecimiento sin cookie o con cookie manipulada sigue funcionando sin destino externo", async () => {
  mock.cookie.mockReturnValue({ value: "//evil.test" });
  render(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "synthetic-token" }) }));
  expect(screen.getByLabelText("Nueva contraseña", { exact: true })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Volver a iniciar sesión" }).getAttribute("href")).toBe("/login");
});

it.each([
  { page: LoginPage, title: "Iniciar sesión" },
  { page: RegisterPage, title: "Crear cuenta" },
  { page: ForgotPasswordPage, title: "Recuperar contraseña" },
  { page: ResetPasswordPage, title: "Restablecer contraseña" },
])("$title tiene una marca, un h1 y enlaces secundarios", async ({ page, title }) => {
  render(await page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Asisteam")).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
  expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
});

it.each([LoginPage, RegisterPage])("una sesión existente continúa la invitación en lugar de perderla en bienvenida", async page => {
  mock.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } } });
  await expect(page({ searchParams: Promise.resolve({ invite_code: "ABCD1234" }) })).rejects.toThrow("redirect:/join?code=ABCD1234");
});
