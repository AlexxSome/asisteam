// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ issue: vi.fn(), save: vi.fn() }));
vi.mock("@/app/check-in/actions", () => ({ issueCheckinQr: mock.issue, saveQrSettings: mock.save }));
import userEvent from "@testing-library/user-event";
import { QrDisplay } from "./qr-display";
const activityId = "58000000-0000-4000-8000-000000000501";
const initialSettings = { opens_before_minutes: 15, closes_after_minutes: 60, late_after_minutes: 10 };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
describe("QR mostrado por ADMIN", () => {
  it("dibuja un QR local accesible con margen y renueva al vencer según hora servidor", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "performance"] });
    mock.issue.mockResolvedValueOnce({ qr: { activity_id: activityId, token: "a".repeat(64), server_time: "2026-10-03T12:00:00Z", expires_at: "2026-10-03T12:01:00Z" } })
      .mockResolvedValueOnce({ qr: { activity_id: activityId, token: "b".repeat(64), server_time: "2026-10-03T12:01:00Z", expires_at: "2026-10-03T12:02:00Z" } });
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await act(async () => {});
    const first = screen.getByTitle("QR temporal para registrar asistencia").parentElement!.innerHTML;
    expect(screen.getByText(/Se renueva en 60 s/)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mock.issue).toHaveBeenCalledTimes(2);
    expect(screen.getByTitle("QR temporal para registrar asistencia").parentElement!.innerHTML).not.toBe(first);
  });
  it("retira el QR y explica un permiso revocado o ventana cerrada", async () => {
    mock.issue.mockResolvedValue({ error: { code: "admin_required", message: "Solo un administrador puede mostrar el QR." } });
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Solo un administrador"));
    expect(screen.queryByTitle("QR temporal para registrar asistencia")).toBeNull();
  });
});

function validQr(token = "a") {
  return { qr: { activity_id: activityId, token: token.repeat(64), server_time: "2026-10-03T12:00:00Z", expires_at: "2026-10-03T12:01:00Z" } };
}
function fakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "performance"] });
}
describe("vigencia y recuperación del QR", () => {
  it("retira el código vencido mientras la renovación sigue pendiente y no anuncia segundos", async () => {
    fakeClock();
    mock.issue.mockResolvedValueOnce(validQr()).mockReturnValueOnce(new Promise(() => {}));
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await act(async () => {});
    expect(screen.getByText(/Se renueva en 60 s/).closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByTitle("QR temporal para registrar asistencia")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Actualizando QR…");
  });
  it("no presenta un código si la respuesta consumió toda su vigencia", async () => {
    fakeClock();
    let resolve!: (value: unknown) => void;
    mock.issue.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); resolve(validQr()); });
    expect(screen.queryByTitle("QR temporal para registrar asistencia")).toBeNull();
  });
  it("descarta respuestas recibidas con la pestaña oculta y consulta al volver", async () => {
    let resolve!: (value: unknown) => void;
    const visible = vi.spyOn(document, "visibilityState", "get");
    visible.mockReturnValue("visible");
    mock.issue.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce(validQr("b"));
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await act(async () => {
      visible.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      resolve(validQr());
    });
    expect(screen.queryByTitle("QR temporal para registrar asistencia")).toBeNull();
    await act(async () => {
      visible.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await screen.findByTitle("QR temporal para registrar asistencia");
    expect(mock.issue).toHaveBeenCalledTimes(2);
    visible.mockRestore();
  });
  it.each(["admin_required", "checkin_window_closed", "activity_not_found"])("no ofrece reintento ante %s", async code => {
    mock.issue.mockResolvedValue({ error: { code, message: "No disponible" } });
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Reintentar cargar QR" })).toBeNull();
    expect(screen.getByRole("link", { name: "Volver a la actividad" }).getAttribute("href")).toBe(`/groups/group/activities/${activityId}`);
  });
  it("permite reintentar una falla de conexión", async () => {
    const user = userEvent.setup();
    mock.issue.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(validQr());
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await user.click(await screen.findByRole("button", { name: "Reintentar cargar QR" }));
    await screen.findByTitle("QR temporal para registrar asistencia");
    expect(mock.issue).toHaveBeenCalledTimes(2);
  });
});
describe("ajustes globales explícitos", () => {
  it("enfoca y abre ajustes sin modificar valores y guarda solo al enviar", async () => {
    const user = userEvent.setup();
    mock.issue.mockResolvedValue(validQr());
    mock.save.mockImplementation(async (_group, settings) => ({ settings }));
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await screen.findByTitle("QR temporal para registrar asistencia");
    const disclosure = screen.getByText("Ajustes de QR de todo el grupo");
    expect(disclosure.closest("details")!.open).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(disclosure);
    await user.click(disclosure);
    expect(disclosure.closest("details")!.open).toBe(true);
    expect(mock.save).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Abrir minutos antes del inicio") as HTMLInputElement).value).toBe("15");
    await user.clear(screen.getByLabelText("Abrir minutos antes del inicio"));
    await user.type(screen.getByLabelText("Abrir minutos antes del inicio"), "20");
    expect(mock.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Guardar horario para todo el grupo" }));
    expect((await screen.findByRole("status")).textContent).toContain("Horario guardado para todas las actividades del grupo");
    expect(mock.save).toHaveBeenCalledExactlyOnceWith("group", { ...initialSettings, opens_before_minutes: 20 });
  });
  it("conserva el borrador y distingue error al guardar de éxito", async () => {
    const user = userEvent.setup();
    mock.issue.mockResolvedValue(validQr());
    mock.save.mockResolvedValue({ error: { code: "checkin_failed", message: "No pudimos guardar" } });
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await user.click(screen.getByText("Ajustes de QR de todo el grupo"));
    await user.clear(screen.getByLabelText("Registrar Atrasado después de estos minutos"));
    await user.type(screen.getByLabelText("Registrar Atrasado después de estos minutos"), "12");
    await user.click(screen.getByRole("button", { name: "Guardar horario para todo el grupo" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No pudimos guardar");
    expect((screen.getByLabelText("Registrar Atrasado después de estos minutos") as HTMLInputElement).value).toBe("12");
    expect(mock.issue).toHaveBeenCalledTimes(1);
  });
  it("vincula la validación del umbral al campo y no guarda un horario inválido", async () => {
    const user = userEvent.setup();
    mock.issue.mockResolvedValue(validQr());
    render(<QrDisplay groupId="group" activityId={activityId} initialSettings={initialSettings} />);
    await user.click(screen.getByText("Ajustes de QR de todo el grupo"));
    const late = screen.getByLabelText("Registrar Atrasado después de estos minutos");
    await user.clear(late); await user.type(late, "61");
    await user.click(screen.getByRole("button", { name: "Guardar horario para todo el grupo" }));
    expect(mock.save).not.toHaveBeenCalled();
    expect(late.getAttribute("aria-invalid")).toBe("true");
    expect(late.getAttribute("aria-describedby")).toContain("late_after_minutes-error");
    expect(screen.getByText("El umbral de atraso debe estar dentro de la ventana de registro.")).toBeTruthy();
  });
});
