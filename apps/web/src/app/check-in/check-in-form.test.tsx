// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect((await screen.findByRole("alert")).textContent).toContain("Escanea el código actual");
    expect(screen.queryByRole("button", { name: "Reintentar registro" })).toBeNull();
    expect(screen.getByRole("link", { name: "Volver a mis grupos" }).getAttribute("href")).toBe("/groups");
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
    await screen.findByText("Necesitas el QR de la actividad");
    expect(screen.getByRole("link", { name: "Volver a mis grupos" }).getAttribute("href")).toBe("/groups");
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

describe("recuperación segura de la llegada", () => {
  it("conserva el QR en memoria durante login y exige reescaneo si venció al volver", async () => {
    const { rerender } = render(<CheckinForm authenticated={false} />);
    await screen.findByRole("form", { name: "Iniciar sesión" });
    expect(window.location.hash).toBe("");
    expect(screen.getByText(/Si el QR vence mientras ingresas/)).toBeTruthy();
    mock.redeem.mockResolvedValue({ error: { code: "checkin_qr_expired", message: "Escanea el código actual" } });
    rerender(<CheckinForm authenticated />);
    await screen.findByRole("alert");
    expect(mock.redeem).toHaveBeenCalledExactlyOnceWith(input);
    expect(screen.queryByRole("button", { name: "Reintentar registro" })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain(input.token);
      expect(link.getAttribute("href")).not.toContain("?");
    }
  });
  it("reintenta con teclado un fallo recuperable y confirma actividad y estado", async () => {
    const user = userEvent.setup();
    mock.redeem.mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ receipt: { activity_id: input.activity_id, group_id: "group", activity_title: "Entrenamiento del viernes", status: "LATE", created: true } });
    render(<CheckinForm authenticated />);
    const retry = await screen.findByRole("button", { name: "Reintentar registro" });
    await user.tab();
    expect(document.activeElement).toBe(retry);
    await user.keyboard("{Enter}");
    await screen.findByText("Llegada confirmada");
    expect(screen.getByRole("status").textContent).toContain("Entrenamiento del viernes");
    expect(screen.getByRole("status").textContent).toContain("Atrasado");
    expect(mock.redeem).toHaveBeenCalledTimes(2);
  });
  it.each(["checkin_not_available", "checkin_window_closed"])("no reintenta %s y ofrece ayuda y salida", async code => {
    mock.redeem.mockResolvedValue({ error: { code, message: "No disponible" } });
    render(<CheckinForm authenticated />);
    await screen.findByRole("alert");
    expect(screen.getByText(/Consulta al administrador/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Volver a mis grupos" })).toBeTruthy();
  });
  it("muestra el estado registrando mientras espera respuesta", async () => {
    mock.redeem.mockReturnValue(new Promise(() => {}));
    render(<CheckinForm authenticated />);
    expect((await screen.findByRole("status")).textContent).toBe("Registrando tu llegada…");
    expect(screen.queryByText("Llegada confirmada")).toBeNull();
  });
  it("descarta la respuesta de un escaneo anterior cuando llega otro QR", async () => {
    let resolveFirst!: (value: unknown) => void;
    mock.redeem.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ error: { code: "checkin_qr_expired", message: "Escanea el código actual" } });
    render(<CheckinForm authenticated />);
    await waitFor(() => expect(mock.redeem).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.history.replaceState(null, "", checkinPath({ ...input, token: "b".repeat(64) }));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await screen.findByRole("alert");
    await act(async () => resolveFirst({ receipt: { activity_id: input.activity_id, group_id: "group", activity_title: "Anterior", status: "PRESENT", created: true } }));
    expect(screen.queryByText("Llegada confirmada")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Escanea el código actual");
  });
});
