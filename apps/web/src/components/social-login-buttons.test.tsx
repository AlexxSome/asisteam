// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
