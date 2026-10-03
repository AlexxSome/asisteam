// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ issue: vi.fn(), save: vi.fn() }));
vi.mock("@/app/check-in/actions", () => ({ issueCheckinQr: mock.issue, saveQrSettings: mock.save }));
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
