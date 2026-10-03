// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ attendance: vi.fn() }));
vi.mock("@/lib/attendance", () => ({ getAttendance: mock.attendance }));
vi.mock("./attendance-sheet", () => ({ AttendanceSheet: () => null }));
import AttendancePage from "./page";
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each([true, false])("vacío de asistencia solo ofrece gestión a ADMIN: %s", async canEditNotes => {
  mock.attendance.mockResolvedValue({ activity: { title: "Actividad sintética", starts_at: null }, roster: [], canEditNotes });
  render(await AttendancePage({ params: Promise.resolve({ groupId: "club", activityId: "activity" }) }));
  expect(screen.getByRole("heading", { name: "Aún no hay deportistas para tomar asistencia" })).toBeTruthy();
  if (canEditNotes) {
    expect(screen.getByRole("link", { name: "Agregar deportista" }).getAttribute("href")).toBe("/groups/club/members/new");
    expect(screen.getByRole("link", { name: "Invitar por email" }).getAttribute("href")).toBe("/groups/club/invitations/new");
  } else {
    expect(screen.queryByRole("link", { name: "Agregar deportista" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Invitar por email" })).toBeNull();
    expect(screen.getByText(/Pide a un administrador/)).toBeTruthy();
  }
});
