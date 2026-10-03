// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import GroupError from "@/app/groups/[groupId]/error";
import { LoadingState } from "./loading-state";
import { NavigationProgress } from "./navigation-progress";
import { resourceResponseHtml } from "@/lib/resource-state";

const navigation = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async importOriginal => ({ ...await importOriginal<typeof import("next/link")>(), useLinkStatus: () => navigation }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); navigation.pending = false; });

it("ofrece reintentar con teclado y no mueve el foco a los mensajes", async () => {
  const user = userEvent.setup();
  const reset = vi.fn();
  render(<ErrorPage {...{ reset, error: new Error("internal stack with private@example.test") }} />);
  expect(document.body.textContent).not.toContain("private@example.test");
  expect(screen.getByRole("main")).toBeTruthy();
  expect(document.activeElement).toBe(document.body);
  await user.tab();
  const retry = screen.getByRole("button", { name: "Volver a intentar" });
  expect(document.activeElement).toBe(retry);
  await user.keyboard("{Enter}");
  expect(reset).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(retry);
  expect(screen.getByRole("link", { name: "Volver a mis grupos" }).getAttribute("href")).toBe("/groups");
});

it("distingue pérdida y recuperación de conexión sin perder el foco", () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<GroupError reset={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Sin conexión" })).toBeTruthy();
  expect(screen.queryByRole("main")).toBeNull(); // The group layout owns the main landmark.
  const retry = screen.getByRole("button", { name: "Volver a intentar" }); retry.focus();
  online.mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event("online")); });
  expect(screen.getByRole("heading", { name: "No pudimos cargar esta página" })).toBeTruthy();
  expect(document.activeElement).toBe(retry);
});

it("presenta el mismo recurso no disponible en Next y middleware sin revelar el motivo", () => {
  render(<NotFound />);
  const title = screen.getByRole("heading", { level: 1 }).textContent;
  const html = resourceResponseHtml(404);
  expect(html).toContain(`<h1>${title}</h1>`);
  expect(html).toContain('name="robots" content="noindex"');
  expect(html).toContain('href="/groups"');
  expect(resourceResponseHtml(403)).toContain("No tienes permisos");
});

it("oculta los esqueletos a lectores de pantalla y solo anuncia la carga", () => {
  const { container } = render(<LoadingState label="Cargando actividades…" />);
  expect(screen.getByRole("status").textContent).toBe("Cargando actividades…");
  expect(screen.getByRole("region", { name: "Cargando actividades…" }).getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status").closest('[aria-busy="true"]')).toBeNull();
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("");
  expect(screen.queryByRole("link")).toBeNull();
});

it("el progreso sigue la navegación real y desaparece cuando termina o se cancela", () => {
  const { rerender } = render(<NavigationProgress />);
  expect(screen.queryByRole("status")).toBeNull();
  navigation.pending = true;
  rerender(<NavigationProgress />);
  expect(screen.getByRole("status").getAttribute("aria-busy")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Cargando página");
  navigation.pending = false;
  rerender(<NavigationProgress />);
  expect(screen.queryByRole("status")).toBeNull();
});
