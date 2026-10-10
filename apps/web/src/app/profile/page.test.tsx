// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProfilePage from "@/app/profile/page";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/api/session", () => ({ createSessionClient: async () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock("@/lib/profile",()=>({getProfilePageData:mock.profile}));
vi.mock("@/lib/social-auth",()=>({getSocialProviderAvailability:async()=>({google:false,apple:false})}));
vi.mock("@/app/profile/profile-form", () => ({ ProfileForm: () => <div>Formulario de perfil</div> }));
vi.mock("@/app/profile/avatar-permissions", () => ({ AvatarPermissions: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "test-auth" } } });
  mock.profile.mockResolvedValue({profile:{id:"test-profile",full_name:"Ana Prueba",birthdate:null,phone:null,email:"ana@example.test",avatar_url:null},allowed:true,request:null,hasAdminRole:false,avatarPermissions:[]});
});
afterEach(cleanup);
it("ofrece recuperación existente y solicitudes al canal confirmado sin precargar PII", async () => {
  render(await ProfilePage());
  expect(screen.getByRole("heading", { name: "Cuenta y seguridad" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Recuperar o cambiar contraseña" }).getAttribute("href")).toBe("/forgot-password");
  expect(screen.getByText(/Para cerrar la sesión/).textContent).toContain("Mi cuenta");
  expect(screen.getByRole("link", { name: "Consultar condiciones y privacidad" }).getAttribute("href")).toBe("/legal/2026-09-21#privacidad");
  for (const name of ["Solicitar copia de mis datos", "Solicitar supresión de datos", "Solicitar revocación de consentimiento", "Pedir ayuda a soporte"]) {
    const href = screen.getByRole("link", { name }).getAttribute("href")!;
    expect(href).toMatch(/^mailto:soporte@asisteam\.cl\?subject=/);
    expect(href).not.toContain("ana"); expect(href).not.toContain("body=");
  }
  expect(screen.getByRole("link", { name: "soporte@asisteam.cl" })).toBeTruthy();
  expect(screen.getByText(/No descargan datos, eliminan tu cuenta ni revocan permisos automáticamente/)).toBeTruthy();
});
it("exige sesión para mostrar el perfil", async () => {
  mock.getUser.mockResolvedValueOnce({ data: { user: null } });
  await expect(ProfilePage()).rejects.toThrow("/login");
  expect(mock.profile).not.toHaveBeenCalled();
});
