// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MembershipRole } from "@asisteam/core";
import { AppShell, GroupLogo } from "./app-shell";

const navigation = vi.hoisted(() => ({ pathname: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
vi.mock("@/app/login/actions", () => ({ signOutUser: vi.fn() }));
const groupId = "17000000-0000-4000-8000-000000000201";
const group = { id: groupId, name: "Club sintético", sport: null, logo_url: null, roles: ["ADMIN", "ATHLETE"] as MembershipRole[] };
beforeEach(() => {
  navigation.pathname = `/groups/${groupId}/members/pending`;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("navegación compartida", () => {
  it("identifica la sección activa, agrupa tareas y ofrece salto a un único main y h1", async () => {
    render(<AppShell group={group} groups={[group]} userId="synthetic"><h1>Aprobaciones pendientes</h1></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Navegación del grupo" });
    expect(within(nav).getByRole("link", { name: "Aprobaciones" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByText("Integrantes").closest("details")?.open).toBe(true);
    expect(within(nav).getByRole("link", { name: "Invitaciones" }).closest("details")?.textContent).toContain("Integrantes");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await userEvent.click(screen.getByRole("link", { name: "Saltar al contenido" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it.each(["ATHLETE", "GUARDIAN", "COACH"] as MembershipRole[])("no ofrece gestión a %s", role => {
    const current = { ...group, roles: [role] };
    render(<AppShell group={current} groups={[current]} userId="synthetic"><h1>Inicio</h1></AppShell>);
    expect(screen.queryByText("Gestión")).toBeNull();
    expect(screen.queryByText("Integrantes")).toBeNull();
    expect(screen.queryByRole("link", { name: "Invitaciones" })).toBeNull();
    if (role === "GUARDIAN") {
      expect(screen.getByRole("link", { name: "Elegir pupilo" })).toBeTruthy();
      expect(screen.queryByRole("combobox")).toBeNull();
    }
  });

  it("mantiene el nombre completo fuera del selector y IDs únicos en sidebar/drawer", () => {
    const current = { ...group, name: "Club Deportivo de Entrenamiento Comunitario con Nombre Extenso" };
    render(<AppShell group={current} groups={[current]} userId="synthetic"><h1>Inicio</h1></AppShell>);
    expect(within(screen.getByRole("banner")).getByText(current.name)).toBeTruthy();
    const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("abre un diálogo titulado, cierra al navegar y también al cambiar de ruta", async () => {
    const view = render(<AppShell group={group} groups={[group]} userId="synthetic"><h1>Inicio</h1></AppShell>);
    const trigger = screen.getByRole("button", { name: "Menú" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "Navegación" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const home = within(menu).getByRole("link", { name: "Inicio", hidden: true });
    home.addEventListener("click", event => event.preventDefault());
    fireEvent.click(home);
    expect((menu as HTMLDialogElement).open).toBe(false);
    await userEvent.click(trigger);
    navigation.pathname = `/groups/${groupId}/activities`;
    view.rerender(<AppShell group={group} groups={[group]} userId="synthetic"><h1>Actividades</h1></AppShell>);
    expect((menu as HTMLDialogElement).open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("distingue agenda global y actividades de un grupo sin duplicar aria-current", () => {
    navigation.pathname = `/groups/${groupId}/activities/private-id`;
    render(<AppShell group={group} groups={[group]}><h1>Actividad</h1></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Navegación del grupo" });
    expect(within(nav).getByRole("link", { name: "Actividades" }).getAttribute("aria-current")).toBe("page");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Mi agenda global" }).getAttribute("href")).toBe("/groups#agenda");
  });
});

it.each(["settings", "settings/visibility", "activity-types", "invitations/new"])("gestión conserva rutas y señala una sección activa en %s", suffix => {
  navigation.pathname = `/groups/${groupId}/${suffix}`;
  render(<AppShell group={group}><h1>Gestión</h1></AppShell>);
  const nav = screen.getByRole("navigation", { name: "Gestión del grupo" });
  expect(within(nav).getAllByRole("link")).toHaveLength(4);
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(nav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(navigation.pathname);
});
it("logo no disponible conserva identificación accesible", () => {
  render(<GroupLogo src="https://example.test/missing.png" name="Club local" />);
  fireEvent.error(screen.getByRole("img", { name: "Logo de Club local" }));
  expect(screen.getByRole("img", { name: "Club local: logo no disponible" }).textContent).toBe("CL");
});
