// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCOUNT_TERMS_VERSION } from "@asisteam/core";
const mock = vi.hoisted(() => ({ accept: vi.fn(), signOut: vi.fn() }));
vi.mock("./actions", () => ({ acceptAccountTerms: mock.accept }));
vi.mock("@/app/login/actions", () => ({ signOutUser: mock.signOut }));
import { AcceptTermsForm } from "./accept-terms-form";
import AccountTermsPage from "../legal/2026-09-21/page";
beforeEach(() => vi.resetAllMocks()); afterEach(cleanup);
it("muestra enlaces antes de aceptar y el checkbox no está marcado", async () => {
  render(<AcceptTermsForm returnTo="/welcome" />);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  for (const link of screen.getAllByRole("link")) {
    expect(link.getAttribute("href")).toContain(`/legal/${ACCOUNT_TERMS_VERSION}#`);
    expect(link.getAttribute("target")).toBe("_blank");
  }
  await userEvent.click(screen.getByRole("button", { name: "Aceptar y continuar" }));
  expect(mock.accept).not.toHaveBeenCalled(); expect(document.activeElement).toBe(checkbox);
  expect(checkbox.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("Debes aceptar");
  await userEvent.keyboard(" "); expect(checkbox.checked).toBe(true);
});
it("doble envío, fallo y reintento no pierden la decisión ni adelantan aceptación", async () => {
  let finish!: (value: unknown) => void;
  mock.accept.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ error: "Vuelve a intentar" });
  const { container } = render(<AcceptTermsForm returnTo="/welcome" />);
  await userEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(container.querySelector("form")!); fireEvent.submit(container.querySelector("form")!);
  expect(mock.accept).toHaveBeenCalledExactlyOnceWith({ terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION });
  expect((screen.getByRole("button", { name: "Aceptar y continuar" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ error: "Error temporal" }));
  expect(screen.getByRole("alert").textContent).toBe("Error temporal");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Aceptar y continuar" }));
  await waitFor(() => expect(mock.accept).toHaveBeenCalledTimes(2));
});
it("salir no registra aceptación", async () => {
  mock.signOut.mockResolvedValue({ error: "No pudimos cerrar la sesión" });
  render(<AcceptTermsForm returnTo="/welcome" />);
  await userEvent.click(screen.getByRole("button", { name: "Salir sin aceptar" }));
  expect(mock.signOut).toHaveBeenCalledTimes(1); expect(mock.accept).not.toHaveBeenCalled();
});
it("el snapshot público tiene ambos destinos y consultarlo no acepta", () => {
  const { container } = render(<AccountTermsPage />);
  expect(container.querySelector("#condiciones")).toBeTruthy(); expect(container.querySelector("#privacidad")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Condiciones de uso y privacidad");
  expect(screen.queryByRole("checkbox")).toBeNull(); expect(mock.accept).not.toHaveBeenCalled();
});
