// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ listMembershipOnboarding: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("./membership-review", () => ({ MembershipReview: () => <p>Revisión</p> }));
import { ApiClientError } from "@asisteam/api-client";
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
  expect(mock.rpc).toHaveBeenCalledWith({ query: { group_id: groupId, membership_id: undefined, page: 2 } });
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("?page=1");
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3");
});
it("página inválida vuelve al comienzo y distingue lista vacía de un fallo", async () => {
  mock.rpc.mockResolvedValue({ data: [], error: null });
  render(await PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ page: "-1" }) }));
  expect(mock.rpc).toHaveBeenCalledWith({ query: { group_id: groupId, membership_id: undefined, page: 1 } });
  expect(screen.getByText("No hay incorporaciones pendientes en esta página.")).toBeTruthy();
  mock.rpc.mockRejectedValue(new ApiClientError(503, "unavailable"));
  await expect(PendingMembershipsPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar las aprobaciones");
});
