// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AttendanceRosterRow } from "@asisteam/core";
const actions = vi.hoisted(() => ({ saveAttendance: vi.fn(), clearAttendance: vi.fn(), updateAttendance: vi.fn() }));
vi.mock("./actions", () => actions);
import { AttendanceSheet } from "./attendance-sheet";
const group = "30000000-0000-4000-8000-000000000201";
const activity = "30000000-0000-4000-8000-000000000501";
const ana: AttendanceRosterRow = { membership_id: "30000000-0000-4000-8000-000000000303", full_name: "Ana", avatar_url: null, status: null, note: null };
const ben: AttendanceRosterRow = { ...ana, membership_id: "30000000-0000-4000-8000-000000000314", full_name: "Ben", status: "ABSENT", note: "Nota existente" };
const error = { error: { code: "failed", message: "Falló el guardado", details: {} } };
const controls = (name: string) => within(screen.getByRole("group", { name: `Asistencia de ${name}` }));
beforeEach(() => {
  vi.resetAllMocks();
  actions.saveAttendance.mockImplementation(async (_group, _activity, records) => ({ records }));
  actions.clearAttendance.mockResolvedValue({ cleared: true });
});
afterEach(cleanup);
describe("toma de asistencia", () => {
  it("guarda por toque, bloquea doble envío y revierte si falla", async () => {
    const user = userEvent.setup();
    let rejectSave!: (value: typeof error) => void;
    actions.saveAttendance.mockReturnValue(new Promise((resolve) => { rejectSave = resolve; }));
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ana]} />);
    const present = controls("Ana").getByRole("button", { name: "Presente" });
    await user.click(present);
    expect(present.getAttribute("aria-pressed")).toBe("true");
    expect((present as HTMLButtonElement).disabled).toBe(true);
    await user.click(present);
    expect(actions.saveAttendance).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(error));
    expect(present.getAttribute("aria-pressed")).toBe("false");
    expect((present as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Falló el guardado");
    expect(screen.getByText(/Sin marcar 1/)).toBeTruthy();
  });
  it("repetir el estado desmarca mediante acción acotada", async () => {
    const user = userEvent.setup();
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ben]} />);
    await user.click(controls("Ben").getByRole("button", { name: "Ausente" }));
    expect(actions.clearAttendance).toHaveBeenCalledWith(group, activity, ben.membership_id);
    expect(actions.saveAttendance).not.toHaveBeenCalled();
    expect(screen.getByText("Registro desmarcado.")).toBeTruthy();
    expect(screen.getByText(/Sin marcar 1/)).toBeTruthy();
  });
  it("cambiar estado conserva nota; editar nota envía texto explícito", async () => {
    const user = userEvent.setup();
    actions.updateAttendance.mockResolvedValueOnce({ records: [{ membership_id: ben.membership_id, status: "LATE", note: ben.note }] });
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ben]} />);
    await user.click(controls("Ben").getByRole("button", { name: "Atrasado" }));
    expect(actions.updateAttendance).toHaveBeenCalledWith(group, activity, ben.membership_id, { status: "LATE" });
    await user.click(screen.getByText("Nota (registrada)"));
    const note = screen.getByRole("textbox", { name: "Nota de Ben" });
    expect((note as HTMLTextAreaElement).value).toBe("Nota existente");
    await user.clear(note);
    await user.type(note, "Llegó después");
    actions.updateAttendance.mockResolvedValueOnce({ records: [{ membership_id: ben.membership_id, status: "EXCUSED", note: "Llegó después" }] });
    await user.click(screen.getByRole("button", { name: "Guardar nota" }));
    expect(actions.updateAttendance).toHaveBeenLastCalledWith(group, activity, ben.membership_id, { note: "Llegó después" });
    expect(actions.saveAttendance).not.toHaveBeenCalled();
    expect(controls("Ben").getByRole("button", { name: "Justificado" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("una corrección fallida revierte el estado y conserva la nota", async () => {
    const user = userEvent.setup();
    actions.updateAttendance.mockResolvedValue(error);
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ben]} />);
    await user.click(controls("Ben").getByRole("button", { name: "Justificado" }));
    expect(actions.updateAttendance).toHaveBeenCalledWith(group, activity, ben.membership_id, { status: "EXCUSED" });
    expect(controls("Ben").getByRole("button", { name: "Ausente" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByText("Nota (registrada)"));
    expect((screen.getByRole("textbox", { name: "Nota de Ben" }) as HTMLTextAreaElement).value).toBe(ben.note);
    expect(screen.getByRole("alert").textContent).toBe("Falló el guardado");
  });
  it("todos presentes requiere confirmación, ignora filtro y conserva marcas del servidor", async () => {
    const user = userEvent.setup();
    actions.saveAttendance.mockResolvedValue({ records: [{ membership_id: ana.membership_id, status: "EXCUSED", note: "Otro administrador" }] });
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ana, ben]} />);
    await user.type(screen.getByRole("searchbox"), "Ben");
    await user.click(screen.getByRole("button", { name: "Marcar todos como Presente" }));
    expect(actions.saveAttendance).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(actions.saveAttendance).toHaveBeenCalledWith(group, activity, [{ membership_id: ana.membership_id, status: "PRESENT" }], true);
    await user.clear(screen.getByRole("searchbox"));
    expect(controls("Ana").getByRole("button", { name: "Justificado" }).getAttribute("aria-pressed")).toBe("true");
    expect(controls("Ben").getByRole("button", { name: "Ausente" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Justificados 1 · Sin marcar 0/)).toBeTruthy();
  });
  it("un fallo de red revierte y pide reconciliar antes de reintentar", async () => {
    const user = userEvent.setup();
    actions.saveAttendance.mockRejectedValue(new Error("network"));
    render(<AttendanceSheet groupId={group} activityId={activity} initialRows={[ana]} />);
    await user.click(controls("Ana").getByRole("button", { name: "Presente" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Recarga la asistencia"));
    expect(controls("Ana").getByRole("button", { name: "Presente" }).getAttribute("aria-pressed")).toBe("false");
  });
});
