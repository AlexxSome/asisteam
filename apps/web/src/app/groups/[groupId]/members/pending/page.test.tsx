// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("./membership-review", () => ({ MembershipReview: () => <p>Revisión</p> }));
import PendingMembershipsPage from "./page";
const groupId = "26000000-0000-4000-8000-000000000201";
beforeEach(() => { mock.group.mockResolvedValue({ id: groupId, name: "Club", roles: ["ADMIN"] }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each(["ATHLETE", "GUARDIAN"])("%s no accede ni consulta pendientes", async role => {
  mock.group.mockResolvedValue({ id: groupId, roles: [role] });
  await expect(PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("página 2 usa offset y ofrece navegación a todos los resultados", async () => {
  mock.rpc.mockResolvedValue({ data: [{ membership_id: "member", total_count: 101 }], error: null });
  render(await PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ page: "2" }) }));
  expect(mock.rpc).toHaveBeenCalledWith("list_pending_memberships", { p_group_id: groupId, p_offset: 50 });
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("?page=1");
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3");
});
it("página inválida vuelve al comienzo y distingue lista vacía de un fallo", async () => {
  mock.rpc.mockResolvedValue({ data: [], error: null });
  render(await PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ page: "-1" }) }));
  expect(mock.rpc).toHaveBeenCalledWith("list_pending_memberships", { p_group_id: groupId, p_offset: 0 });
  expect(screen.getByText("No hay incorporaciones pendientes en esta página.")).toBeTruthy();
  mock.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  await expect(PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar las aprobaciones");
});
