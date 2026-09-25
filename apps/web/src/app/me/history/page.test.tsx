// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ groups: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getMyGroups: mock.groups }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
import MyHistoryGroupsPage from "./page";
afterEach(cleanup);
it("acceso directo redirige a la única membership ATHLETE", async () => {
  mock.groups.mockResolvedValue({ groups: [{ id: "a", roles: ["ATHLETE", "ADMIN"] }, { id: "b", roles: ["ADMIN"] }] });
  await expect(MyHistoryGroupsPage()).rejects.toThrow("/groups/a/me/history");
});
it("varios grupos se eligen sin agregar métricas ni incluir grupos sin ATHLETE", async () => {
  mock.groups.mockResolvedValue({ groups: [{ id: "a", name: "Tenis", roles: ["ATHLETE"] }, { id: "b", name: "Natación", roles: ["ATHLETE"] }, { id: "c", name: "Administración", roles: ["ADMIN"] }] });
  render(await MyHistoryGroupsPage());
  expect(screen.getByRole("link", { name: "Tenis" }).getAttribute("href")).toBe("/groups/a/me/history");
  expect(screen.getByRole("link", { name: "Natación" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Administración" })).toBeNull();
});
