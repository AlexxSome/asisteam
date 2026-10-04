// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GroupCapacityNotice } from "./group-capacity";
import { GettingStarted } from "@/app/groups/[groupId]/getting-started";

afterEach(cleanup);

it("cero cupos exige primer pago sin prometer prueba ni activación al volver", () => {
  render(<GroupCapacityNotice groupId="group" capacity={{ active_athletes: 0, athlete_limit: 0 }} />);
  expect(screen.getByText(/0 cupos habilitados/)).toBeTruthy();
  expect(screen.getByText(/Volver de Mercado Pago no confirma el pago/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Revisar suscripción" }).getAttribute("href")).toBe("/groups/group/billing");
});
it.each([50, 51])("plan lleno o reducido conserva miembros y anuncia capacidad real: %s", active_athletes => {
  render(<GroupCapacityNotice groupId="group" capacity={{ active_athletes, athlete_limit: 50 }} />);
  expect(screen.getByRole("heading").textContent).toBe("Cupos de deportistas completos");
  expect(screen.getByText(new RegExp(`${active_athletes} deportistas activos de 50`))).toBeTruthy();
  expect(screen.queryByText(/primer pago/)).toBeNull();
});
it.each([50, null])("capacidad pagada disponible o histórica (%s) no se confunde con impago", athlete_limit => {
  const { container } = render(<GroupCapacityNotice groupId="group" capacity={{ active_athletes: 2, athlete_limit }} />);
  expect(container.textContent).toBe("");
});
it("capacidad desconocida permite recuperar sin afirmar cero cupos", () => {
  render(<GroupCapacityNotice groupId="group" capacity={null} />);
  expect(screen.getByRole("heading").textContent).toBe("No pudimos comprobar los cupos");
  expect(screen.queryByText(/0 cupos/)).toBeNull();
  expect(screen.getByRole("link", { name: "Revisar suscripción" })).toBeTruthy();
});
it.each([0, 50, null])("los pasos usan capacidad habilitada (%s), no retorno de checkout", athlete_limit => {
  render(<GettingStarted groupId="group" capacity={{ active_athletes: 0, athlete_limit }} hasActivities={false} />);
  expect(screen.getByText(`${athlete_limit === 0 ? 1 : 2} de 4 pasos listos. Puedes avanzar a tu ritmo.`)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Continuar configuración" }).getAttribute("href")).toBe("/groups/group/settings");
  expect(screen.getByRole("link", { name: "Crear primera actividad" }).getAttribute("href")).toBe("/groups/group/activities/new");
});
it("oculta guía terminada y conserva desconocido al fallar una lectura", () => {
  const { rerender, container } = render(<GettingStarted groupId="group" capacity={{ active_athletes: 1, athlete_limit: 50 }} hasActivities />);
  expect(container.textContent).toBe("");
  rerender(<GettingStarted groupId="group" capacity={null} hasActivities={null} />);
  expect(screen.getByText(/No pudimos comprobar los cupos/)).toBeTruthy();
  expect(screen.getByText(/No pudimos comprobar las actividades/)).toBeTruthy();
});
