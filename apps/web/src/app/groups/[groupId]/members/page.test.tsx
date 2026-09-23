// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("./member-management", () => ({ MemberManagement: () => <p>Gestión</p> }));
import MembersPage from "./page";
const groupId = "34000000-0000-4000-8000-000000000201";
const params = Promise.resolve({ groupId });
beforeEach(() => { mock.group.mockResolvedValue({ id: groupId, name: "Club", roles: ["ADMIN"] }); mock.rpc.mockResolvedValue({ data: [], error: null }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each(["ATHLETE", "GUARDIAN"])("%s no consulta nómina privada", async role => {
  mock.group.mockResolvedValue({ id: groupId, roles: [role] });
  await expect(MembersPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("conserva filtros al paginar y enlaza histórico con inactivos", async () => {
  mock.rpc.mockResolvedValue({ data: [{ membership_id: "34000000-0000-4000-8000-000000000311", full_name: "Persona", email: null, phone: null, birthdate: "1990-01-01", role: "ATHLETE", status: "INACTIVE", account_status: "MANAGED", total_count: 101 }], error: null });
  render(await MembersPage({ params, searchParams: Promise.resolve({ page: "2", role: "ATHLETE", status: "INACTIVE" }) }));
  expect(mock.rpc).toHaveBeenCalledWith("list_group_members", { p_group_id: groupId, p_offset: 50, p_role: "ATHLETE", p_status: "INACTIVE" });
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3&role=ATHLETE&status=INACTIVE");
  expect(screen.getByRole("link", { name: "Reportes con inactivos" }).getAttribute("href")).toContain("include_inactive=true");
});
it("rechaza filtros inválidos y distingue vacío de error del servidor", async () => {
  render(await MembersPage({ params, searchParams: Promise.resolve({ role: "COACH" }) }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled();
  cleanup();
  render(await MembersPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No hay integrantes para estos filtros en esta página.")).toBeTruthy();
  mock.rpc.mockResolvedValue({ error: { message: "private" } });
  await expect(MembersPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar");
});
