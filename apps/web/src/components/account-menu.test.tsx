// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ signOutUser: mock.signOut }));
import { AccountMenu } from "./account-menu";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function openAccount() {
  const user = userEvent.setup();
  render(<AccountMenu />);
  await user.tab();
  expect(document.activeElement?.textContent).toBe("Mi cuenta");
  await user.keyboard("{Enter}");
  // jsdom no implementa la activación nativa de summary con Enter.
  if (!screen.getByText("Mi cuenta").closest("details")?.open) await user.click(screen.getByText("Mi cuenta"));
  return user;
}

describe("menú de cuenta compartido", () => {
  it("ofrece perfil y salida local con controles accesibles", async () => {
    await openAccount();
    expect(screen.getByRole("link", { name: "Mi perfil" }).getAttribute("href")).toBe("/profile");
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    const description = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(description?.textContent).toContain("este dispositivo");
    expect(description?.textContent).toContain("otras sesiones seguirán abiertas");
    expect(mock.signOut).not.toHaveBeenCalled();
  });

  it("envía una sola salida, anuncia pendiente, evita doble envío y permite reintentar un error", async () => {
    let finish!: (value: { error: string }) => void;
    mock.signOut.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = await openAccount();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    const pending = screen.getByRole("button", { name: "Cerrando sesión…" }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Cerrando sesión…");
    await user.click(pending);
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    await act(async () => finish({ error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." }));
    expect(screen.getByRole("alert").textContent).toContain("No pudimos cerrar");
    mock.signOut.mockResolvedValueOnce({ error: "Inténtalo nuevamente." });
    await user.click(screen.getByRole("button", { name: "Reintentar cierre de sesión" }));
    await waitFor(() => expect(mock.signOut).toHaveBeenCalledTimes(2));
  });

  it("recupera una caída de red sin filtrar credenciales ni mostrar éxito", async () => {
    mock.signOut.mockRejectedValue(new Error("private token"));
    const user = await openAccount();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No pudimos cerrar tu sesión. Vuelve a intentarlo.");
    expect(document.body.textContent).not.toContain("private token");
    expect((screen.getByRole("button", { name: "Reintentar cierre de sesión" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
