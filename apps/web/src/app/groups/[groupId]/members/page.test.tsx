// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ listGroupMembers: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("./member-management", () => ({ MemberManagement: () => <p>Gestión</p> }));
import { ApiClientError } from "@asisteam/api-client";
import MembersPage from "./page";
const groupId = "34000000-0000-4000-8000-000000000201";
const params = Promise.resolve({ groupId });
beforeEach(() => { mock.group.mockResolvedValue({ id: groupId, name: "Club", roles: ["ADMIN"] }); mock.rpc.mockResolvedValue({ data: [], error: null }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each(["ATHLETE", "GUARDIAN", "COACH"])("%s no consulta nómina privada", async role => {
  mock.group.mockResolvedValue({ id: groupId, roles: [role] });
  await expect(MembersPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("conserva filtros al paginar y enlaza histórico con inactivos", async () => {
  mock.rpc.mockResolvedValue({ data: [{ membership_id: "34000000-0000-4000-8000-000000000311", full_name: "Persona", email: null, phone: null, birthdate: "1990-01-01", role: "ATHLETE", status: "INACTIVE", account_status: "MANAGED", total_count: 101, user_id: "34000000-0000-4000-8000-000000000111", person_roles: [{ role: "ATHLETE", status: "INACTIVE" }], is_last_admin: false }], error: null });
  render(await MembersPage({ params, searchParams: Promise.resolve({ page: "2", role: "ATHLETE", status: "INACTIVE" }) }));
  expect(mock.rpc).toHaveBeenCalledWith({ params: { groupId }, query: { page: 2, role: "ATHLETE", status: "INACTIVE", search: undefined } });
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3&role=ATHLETE&status=INACTIVE");
  expect(screen.getByRole("link", { name: "Reportes con inactivos" }).getAttribute("href")).toContain("include_inactive=true");
});
it("rechaza filtros inválidos y distingue vacío de error del servidor", async () => {
  render(await MembersPage({ params, searchParams: Promise.resolve({ role: "OWNER" }) }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled();
  cleanup();
  render(await MembersPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Aún no hay integrantes en la nómina")).toBeTruthy();
  mock.rpc.mockRejectedValue(new ApiClientError(503, "unavailable"));
  await expect(MembersPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar");
});

it("distingue filtros vacíos de una página fuera de rango y conserva filtros al recuperar", async () => {
  render(await MembersPage({ params, searchParams: Promise.resolve({ role: "ATHLETE" }) }));
  expect(screen.getByRole("heading", { name: "Sin resultados para estos filtros" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Limpiar filtros" }).getAttribute("href")).toBe(`/groups/${groupId}/members`);
  cleanup();
  render(await MembersPage({ params, searchParams: Promise.resolve({ page: "99", role: "ATHLETE", status: "ACTIVE" }) }));
  expect(screen.getByRole("heading", { name: "No hay integrantes en esta página" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Volver a la primera página" }).getAttribute("href")).toBe("?page=1&role=ATHLETE&status=ACTIVE");
});
it.each(["PT403", "PT404"])("conserva notFound ante %s del servicio", async code => {
  mock.rpc.mockRejectedValue(new ApiClientError(Number(code.slice(2)), "not_visible"));
  await expect(MembersPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
});

const row = { membership_id: "34000000-0000-4000-8000-000000000311", full_name: "Ana Sintética", email: null, phone: null, birthdate: "1990-01-01", role: "ATHLETE", status: "ACTIVE", account_status: "MANAGED", total_count: 105, user_id: "34000000-0000-4000-8000-000000000111", person_roles: [{ role: "ATHLETE", status: "ACTIVE" }], is_last_admin: false };
it("envía búsqueda global a RPC y conserva nombre, rol, estado, total y página", async () => {
  mock.rpc.mockResolvedValue({ data: [row], error: null });
  render(await MembersPage({ params, searchParams: Promise.resolve({ page: "2", search: "  Ana & José  ", role: "ATHLETE", status: "ACTIVE" }) }));
  expect(mock.rpc).toHaveBeenCalledWith({ params: { groupId }, query: { page: 2, role: "ATHLETE", status: "ACTIVE", search: "Ana & José" } });
  expect(screen.getByRole("status").textContent).toContain("51–51 de 105 membresías");
  expect(screen.getByText("Página 2 de 3")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3&role=ATHLETE&status=ACTIVE&search=Ana+%26+Jos%C3%A9");
  const form = screen.getByRole("form", { name: "Buscar y filtrar integrantes" }) as HTMLFormElement;
  expect(form.getAttribute("action")).toBe(`/groups/${groupId}/members`);
  expect(new FormData(form).has("page")).toBe(false);
  expect(new FormData(form).get("search")).toBe("Ana & José");
});
it("recupera total en página fuera de rango con una segunda consulta acotada y filtros intactos", async () => {
  mock.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [row], error: null });
  render(await MembersPage({ params, searchParams: Promise.resolve({ page: "99", search: "Ana" }) }));
  expect(mock.rpc).toHaveBeenCalledTimes(2);
  expect(mock.rpc).toHaveBeenNthCalledWith(2, { params: { groupId }, query: { page: 1, role: undefined, status: undefined, search: "Ana" } });
  expect(screen.getByRole("status").textContent).toContain("105 membresías encontradas");
  expect(screen.getByText(/La página 99 está fuera/).textContent).toContain("3 páginas");
  expect(screen.getByRole("link", { name: "Volver a la primera página" }).getAttribute("href")).toBe("?page=1&search=Ana");
  expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
});
it("búsqueda vacía ofrece restauración y no inventa total ni segunda consulta", async () => {
  render(await MembersPage({ params, searchParams: Promise.resolve({ search: "Ausente" }) }));
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toContain("0 membresías");
  expect(screen.getByRole("link", { name: "Restablecer la nómina" }).getAttribute("href")).toBe(`/groups/${groupId}/members`);
});
it("rechaza búsquedas múltiples o excesivas sin consultar datos", async () => {
  for (const search of [["Ana", "José"], "a".repeat(121)]) {
    render(await MembersPage({ params, searchParams: Promise.resolve({ search }) }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mock.rpc).not.toHaveBeenCalled();
    cleanup();
  }
});
