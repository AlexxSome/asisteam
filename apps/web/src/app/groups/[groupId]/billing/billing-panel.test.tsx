// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BillingSummary } from "@asisteam/core";
const mock = vi.hoisted(() => ({ manage: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ manageSubscription: mock.manage }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { BillingPanel } from "./billing-panel";
const group = "56000000-0000-4000-8000-000000000201";
const billing: BillingSummary = { plans: [{ code: "TEAM", name: "Equipo", amount_clp: 4990, athlete_limit: 50, currency: "CLP" }, { code: "ACADEMY", name: "Academia", amount_clp: 15990, athlete_limit: 1000, currency: "CLP" }], subscription: null, active_athletes: 0, athlete_limit: 0, invoices: [], total_invoices: 0, overdue_amount_clp: 0, page: 1 };
beforeEach(() => { vi.resetAllMocks(); mock.manage.mockResolvedValue({ success: true }); });
afterEach(cleanup);
it("muestra el catálogo y envía solo intención, nunca precio/cupo/paid", async () => {
  render(<BillingPanel groupId={group} billing={billing} />);
  expect(screen.getByText(/15.990/)).toBeTruthy();
  await userEvent.type(screen.getByRole("textbox"), "payer@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Suscribir Academia" }));
  expect(mock.manage).toHaveBeenCalledWith({ action: "checkout", group_id: group, plan_code: "ACADEMY", payer_email: "payer@example.test" });
  expect(screen.getByText(/El regreso desde el checkout no confirma un pago/)).toBeTruthy();
});
it("no trata autorización como pago y exige confirmar cancelación", async () => {
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription: { id: group, plan_code: "TEAM", amount_clp: 4990, status: "AUTHORIZED", next_payment_at: null, activated_at: null } }} />);
  expect((screen.getByRole("button", { name: "Suscribir Academia" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar renovación" }));
  expect(mock.manage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(mock.manage).toHaveBeenCalledWith({ action: "cancel", group_id: group });
});
it("un fallo conserva la pantalla y muestra error seguro", async () => {
  mock.manage.mockResolvedValue({ error: { code: "billing_unavailable", message: "No pudimos conectar con el servicio de pagos.", details: {} } });
  render(<BillingPanel groupId={group} billing={billing} />);
  await userEvent.type(screen.getByRole("textbox"), "payer@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Suscribir Equipo" }));
  expect(screen.getByRole("alert").textContent).toContain("No pudimos conectar");
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("cancelar con Escape devuelve el foco sin cancelar la suscripción", async () => {
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription: { id: group, plan_code: "TEAM", amount_clp: 4990, status: "AUTHORIZED", next_payment_at: null, activated_at: null } }} />);
  const trigger = screen.getByRole("button", { name: "Cancelar renovación" });
  await userEvent.click(trigger);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("group", { name: "Cancelar renovación" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Volver" }));
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
  expect(mock.manage).not.toHaveBeenCalled();
});

it("conserva la etiqueta y evita doble cobro o cancelación mientras procesa", async () => {
  let finish!: (value: unknown) => void;
  mock.manage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription: { id: group, plan_code: "TEAM", amount_clp: 4990, status: "AUTHORIZED", next_payment_at: null, activated_at: null } }} />);
  const trigger = screen.getByRole("button", { name: "Cancelar renovación" });
  await userEvent.click(trigger);
  const confirm = screen.getByRole("button", { name: "Confirmar cancelación" });
  await userEvent.dblClick(confirm);
  expect(mock.manage).toHaveBeenCalledTimes(1);
  expect(confirm.textContent).toBe("Confirmar cancelación");
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("group", { name: "Cancelar renovación" })).toBeTruthy();
  await act(async () => finish({ error: { code: "unavailable", message: "Intenta nuevamente.", details: {} } }));
  expect(screen.getByRole("alert").textContent).toBe("Intenta nuevamente.");
  expect(document.activeElement).toBe(trigger);
});
