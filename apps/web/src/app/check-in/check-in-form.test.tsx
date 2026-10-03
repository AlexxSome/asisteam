// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { checkinPath } from "@asisteam/core";
const mock = vi.hoisted(() => ({ redeem: vi.fn() }));
vi.mock("./actions", () => ({ redeemCheckin: mock.redeem }));
vi.mock("@/app/login/login-form", () => ({ LoginForm: () => <form aria-label="Iniciar sesión" /> }));
import { CheckinForm } from "./check-in-form";
const input = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState(null, "", checkinPath(input)); });
afterEach(cleanup);
describe("llegada desde la cámara", () => {
  it("funciona bajo StrictMode, retira token del historial y envía un solo registro", async () => {
    mock.redeem.mockResolvedValue({ receipt: { activity_id: input.activity_id, group_id: "group", activity_title: "Entreno", status: "PRESENT", created: true } });
    render(<StrictMode><CheckinForm authenticated /></StrictMode>);
    await screen.findByText("Presente");
    expect(mock.redeem).toHaveBeenCalledExactlyOnceWith(input);
    expect(window.location.hash).toBe("");
  });
  it("pide sesión antes de registrar", async () => {
    render(<CheckinForm authenticated={false} />);
    await screen.findByRole("form", { name: "Iniciar sesión" });
    expect(mock.redeem).not.toHaveBeenCalled();
  });
  it("explica el vencimiento sin confirmar asistencia", async () => {
    mock.redeem.mockResolvedValue({ error: { code: "checkin_qr_expired", message: "Escanea el código actual" } });
    render(<CheckinForm authenticated />);
    expect((await screen.findByRole("alert")).textContent).toBe("Escanea el código actual");
    expect(screen.queryByText("Llegada registrada")).toBeNull();
  });
  it("confirma que un registro anterior se conserva", async () => {
    mock.redeem.mockResolvedValue({ receipt: { activity_id: input.activity_id, group_id: "group", activity_title: "Entreno", status: "EXCUSED", created: false } });
    render(<CheckinForm authenticated />);
    await screen.findByText("Justificado");
    expect(screen.getByText(/Se conservó tu asistencia anterior/)).toBeTruthy();
  });
  it("no invoca escrituras desde un enlace sin QR", async () => {
    window.history.replaceState(null, "", "/check-in");
    render(<CheckinForm authenticated />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("escanea el QR"));
    expect(mock.redeem).not.toHaveBeenCalled();
  });
  it("permite reescanear si la cámara reutiliza la misma pestaña", async () => {
    mock.redeem.mockResolvedValueOnce({ error: { code: "checkin_qr_expired", message: "QR vencido" } })
      .mockResolvedValueOnce({ receipt: { activity_id: input.activity_id, group_id: "group", activity_title: "Entreno", status: "LATE", created: true } });
    render(<CheckinForm authenticated />);
    await screen.findByText("QR vencido");
    await act(async () => {
      window.history.replaceState(null, "", checkinPath({ ...input, token: "b".repeat(64) }));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await screen.findByText("Atrasado");
    expect(mock.redeem).toHaveBeenLastCalledWith({ ...input, token: "b".repeat(64) });
  });
});
