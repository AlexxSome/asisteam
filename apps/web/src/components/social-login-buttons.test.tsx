// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SOCIAL_AUTH_ERROR } from "@asisteam/core";
const mock = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ loginWithSocial: mock.login }));
import { SocialLoginButtons } from "./social-login-buttons";
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe("botones de acceso social", () => {
  it.each(["Google", "Apple"])("%s funciona por teclado y mantiene el contexto", async label => {
    render(<SocialLoginButtons context={{ invite_code: "ABCD1234" }} />);
    screen.getByRole("button", { name: `Continuar con ${label}` }).focus();
    await userEvent.keyboard("{Enter}");
    expect(mock.login).toHaveBeenCalledExactlyOnceWith({ provider: label.toLowerCase(), invite_code: "ABCD1234" });
  });
  it("un error permite reintentar y lo anuncia de forma accesible", async () => {
    mock.login.mockResolvedValue({ error: SOCIAL_AUTH_ERROR });
    render(<SocialLoginButtons />);
    await userEvent.click(screen.getByRole("button", { name: "Continuar con Apple" }));
    expect((await screen.findByRole("alert")).textContent).toBe(SOCIAL_AUTH_ERROR);
    expect((screen.getByRole("button", { name: "Continuar con Apple" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("deshabilita ambos proveedores mientras el formulario de contraseña está ocupado", () => {
    render(<SocialLoginButtons disabled />);
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

it.each(["Google", "Apple"])("anuncia progreso de %s, evita doble OAuth y libera el formulario al fallar", async label => {
  let finish!: (value: unknown) => void;
  mock.login.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onPendingChange = vi.fn();
  render(<SocialLoginButtons onPendingChange={onPendingChange} context={{ invite_code: "ABCD1234" }} />);
  const button = screen.getByRole("button", { name: `Continuar con ${label}` });
  await userEvent.dblClick(button);
  expect(mock.login).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toBe(`Conectando con ${label}…`);
  expect(button.textContent?.trim()).toBe(`Continuar con ${label}`);
  for (const control of screen.getAllByRole("button")) expect((control as HTMLButtonElement).disabled).toBe(true);
  expect(onPendingChange).toHaveBeenLastCalledWith(true);
  await act(async () => finish({ error: SOCIAL_AUTH_ERROR }));
  expect(onPendingChange).toHaveBeenLastCalledWith(false);
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

it("explica capacidades deshabilitadas sin mostrar configuración y permite el proveedor habilitado", async () => {
  render(<SocialLoginButtons providers={{ google: false, apple: true }} />);
  const google = screen.getByRole("button", { name: "Continuar con Google" });
  expect((google as HTMLButtonElement).disabled).toBe(true);
  expect(document.getElementById(google.getAttribute("aria-describedby")!)?.textContent).toContain("Google no está disponible");
  await userEvent.click(google);
  expect(mock.login).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Continuar con Apple" }));
  expect(mock.login).toHaveBeenCalledTimes(1);
});

it("disponibilidad desconocida permite reintentar y un fallo de red no expone detalles", async () => {
  mock.login.mockRejectedValue(new Error("secret transport failure"));
  render(<SocialLoginButtons providers={{ google: null, apple: null }} />);
  expect(screen.getByText(/No pudimos comprobar/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Continuar con Google" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(SOCIAL_AUTH_ERROR));
});
