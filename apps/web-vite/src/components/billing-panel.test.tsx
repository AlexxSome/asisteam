// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BillingSummary } from "@asisteam/core/browser";
const mock = vi.hoisted(() => ({ manage: vi.fn(), refresh: vi.fn(), group: vi.fn(), api: vi.fn() }));
vi.mock("../capability-mutations", () => ({ manageSubscription: mock.manage }));
vi.mock("../navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }), notFound: () => { throw new Error("not-found"); } }));
import { BillingPanel } from "./billing-panel";

const group = "56000000-0000-4000-8000-000000000201";
const billing: BillingSummary = {
  plans: [
    { code: "TEAM", name: "Equipo", amount_clp: 4990, athlete_limit: 50, currency: "CLP" },
    { code: "CLUB", name: "Club", amount_clp: 9990, athlete_limit: 200, currency: "CLP" },
    { code: "ACADEMY", name: "Academia", amount_clp: 15990, athlete_limit: 1000, currency: "CLP" },
  ], subscription: null, active_athletes: 0, athlete_limit: 0, invoices: [], total_invoices: 0, overdue_amount_clp: 0, page: 1,
};
const subscription: NonNullable<BillingSummary["subscription"]> = {
  id: group, plan_code: "TEAM", amount_clp: 4990, status: "AUTHORIZED", next_payment_at: null, activated_at: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.manage.mockResolvedValue({ success: true });
  mock.group.mockResolvedValue({ roles: ["ADMIN"] });
  mock.api.mockResolvedValue(billing);
});
afterEach(() => { vi.unstubAllEnvs(); cleanup(); vi.unstubAllGlobals(); });

async function reviewCheckout(plan = "Equipo") {
  await userEvent.click(screen.getByRole("button", { name: `Seleccionar ${plan}` }));
  await userEvent.type(screen.getByRole("textbox", { name: "Correo de la cuenta de Mercado Pago" }), "payer@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Revisar y continuar" }));
}

it("permite comparar y elegir antes de pedir email; confirma y envía solo la intención", async () => {
  render(<BillingPanel groupId={group} billing={billing} />);
  expect(screen.getByText(/15.990 CLP\/mes/)).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  await reviewCheckout("Academia");
  expect(mock.manage).not.toHaveBeenCalled();
  const confirmation = screen.getByRole("group", { name: "Continuar a Mercado Pago" });
  expect(confirmation.textContent).toContain("$15.990 CLP al mes");
  expect(confirmation.textContent).toContain("payer@example.test");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Volver al resumen" }));
  await userEvent.click(within(confirmation).getByRole("button", { name: "Ir a Mercado Pago" }));
  expect(mock.manage).toHaveBeenCalledExactlyOnceWith({ action: "checkout", group_id: group, plan_code: "ACADEMY", payer_email: "payer@example.test" });
  expect(screen.getByText(/El regreso desde el checkout no confirma un pago/)).toBeTruthy();
});

it("conecta los requisitos de correo vacío e inválido con la acción bloqueada", async () => {
  render(<BillingPanel groupId={group} billing={billing} />);
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar Equipo" }));
  const submit = screen.getByRole("button", { name: "Revisar y continuar" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(document.getElementById(submit.getAttribute("aria-describedby")!)?.textContent).toContain("Ingresa un correo válido");
  const email = screen.getByRole("textbox");
  await userEvent.type(email, "incompleto");
  await userEvent.tab();
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(email.getAttribute("aria-describedby")).toContain("payer-email-error");
  expect(submit.disabled).toBe(true);
  expect(mock.manage).not.toHaveBeenCalled();
});

it("Escape cierra la confirmación de checkout y devuelve foco sin iniciar cobros", async () => {
  render(<BillingPanel groupId={group} billing={billing} />);
  await reviewCheckout();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("group", { name: "Continuar a Mercado Pago" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revisar y continuar" }));
  expect(mock.manage).not.toHaveBeenCalled();
});

it("explica el bloqueo por contrato, distingue deuda y confirma cancelar", async () => {
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription }} />);
  const academy = screen.getByRole("button", { name: "Seleccionar Academia" }) as HTMLButtonElement;
  expect(academy.disabled).toBe(true);
  expect(document.getElementById(academy.getAttribute("aria-describedby")!)?.textContent).toContain("Cancela primero la renovación");
  expect(screen.getByText("Pago pendiente de verificación")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar renovación" }));
  expect(mock.manage).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "Cancelar renovación" }).textContent).toContain("esta acción no paga una deuda");
  await userEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(mock.manage).toHaveBeenCalledExactlyOnceWith({ action: "cancel", group_id: group });
  expect(screen.getByText(/Renovación cancelada. Los cupos habilitados/)).toBeTruthy();
});

it("cancelar con Escape devuelve foco sin cancelar la suscripción", async () => {
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription }} />);
  const trigger = screen.getByRole("button", { name: "Cancelar renovación" });
  await userEvent.click(trigger);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Volver" }));
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
  expect(mock.manage).not.toHaveBeenCalled();
});

it.each(["checkout", "cancel"])("evita doble envío y Escape durante %s", async action => {
  let finish!: (value: unknown) => void;
  mock.manage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<BillingPanel groupId={group} billing={action === "checkout" ? billing : { ...billing, subscription }} />);
  if (action === "checkout") await reviewCheckout();
  else await userEvent.click(screen.getByRole("button", { name: "Cancelar renovación" }));
  const label = action === "checkout" ? "Ir a Mercado Pago" : "Confirmar cancelación";
  const confirm = screen.getByRole("button", { name: label });
  await userEvent.dblClick(confirm);
  expect(mock.manage).toHaveBeenCalledTimes(1);
  expect(confirm.textContent).toBe(label);
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  expect(screen.getAllByText(/Hay una operación en curso/).length).toBeGreaterThan(0);
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("group", { name: action === "checkout" ? "Continuar a Mercado Pago" : "Cancelar renovación" })).toBeTruthy();
  await act(async () => finish({ error: { code: "payment_rejected", message: "Intenta nuevamente.", details: {} } }));
  expect(screen.getByRole("alert").textContent).toBe("Intenta nuevamente.");
});

it.each(["checkout_uncertain", "billing_unavailable", "transport"])("exige conciliar tras resultado incierto %s, incluso sin contrato aún visible", async code => {
  if (code === "transport") mock.manage.mockRejectedValueOnce(new Error("network"));
  else mock.manage.mockResolvedValueOnce({ error: { code, message: "Verifica el estado.", details: {} } });
  render(<BillingPanel groupId={group} billing={billing} />);
  await reviewCheckout();
  await userEvent.click(screen.getByRole("button", { name: "Ir a Mercado Pago" }));
  expect((screen.getByRole("button", { name: "Revisar y continuar" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Pago pendiente de verificación")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Actualizar estado de pago" }));
  expect(mock.manage).toHaveBeenLastCalledWith({ action: "sync", group_id: group });
  expect(mock.manage.mock.calls.filter(([input]) => input.action === "checkout")).toHaveLength(1);
  expect(screen.getByText(/actualizar no equivale a un pago aprobado/)).toBeTruthy();
});

it("retoma solo el plan pendiente con el precio contratado, aunque el catálogo cambie", async () => {
  render(<BillingPanel groupId={group} billing={{ ...billing, subscription: { ...subscription, status: "PENDING", amount_clp: 4500 } }} />);
  expect(screen.getByText(/Equipo · \$4.500 CLP\/mes/)).toBeTruthy();
  expect(screen.getByText(/No se crea una segunda suscripción/)).toBeTruthy();
  await userEvent.type(screen.getByRole("textbox"), "payer@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Revisar y continuar" }));
  expect(screen.getByRole("group", { name: "Continuar a Mercado Pago" }).textContent).toContain("$4.500 CLP al mes");
  await userEvent.click(screen.getByRole("button", { name: "Ir a Mercado Pago" }));
  expect(mock.manage).toHaveBeenCalledWith({ action: "checkout", group_id: group, plan_code: "TEAM", payer_email: "payer@example.test" });
});

it("bloquea al navegar al proveedor y permite verificar al volver desde la caché del navegador", async () => {
  const assign = vi.fn();
  const browserWindow = window;
  vi.stubGlobal("window", new Proxy(browserWindow, { get: (target, prop) => prop === "location" ? { assign } : Reflect.get(target, prop) }));
  mock.manage.mockResolvedValueOnce({ success: true, checkout_url: "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=test" });
  render(<BillingPanel groupId={group} billing={billing} />);
  await reviewCheckout();
  await userEvent.click(screen.getByRole("button", { name: "Ir a Mercado Pago" }));
  expect(assign).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Abriendo el checkout seguro de Mercado Pago…")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Revisar y continuar" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  expect(screen.getByText("Pago pendiente de verificación")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Actualizar estado de pago" }) as HTMLButtonElement).disabled).toBe(false);
  expect(mock.manage).toHaveBeenCalledTimes(1);
});











it("un fallo al conciliar mantiene el bloqueo, pero la ausencia confirmada permite reintentar", async () => {
  mock.manage.mockResolvedValueOnce({ error: { code: "billing_unavailable", message: "No disponible.", details: {} } });
  render(<BillingPanel groupId={group} billing={billing} />);
  await reviewCheckout();
  await userEvent.click(screen.getByRole("button", { name: "Ir a Mercado Pago" }));
  mock.manage.mockResolvedValueOnce({ error: { code: "billing_unavailable", message: "No disponible.", details: {} } });
  await userEvent.click(screen.getByRole("button", { name: "Actualizar estado de pago" }));
  expect((screen.getByRole("button", { name: "Revisar y continuar" }) as HTMLButtonElement).disabled).toBe(true);
  mock.manage.mockResolvedValueOnce({ error: { code: "subscription_not_found", message: "Sin suscripción.", details: {} } });
  await userEvent.click(screen.getByRole("button", { name: "Actualizar estado de pago" }));
  expect((screen.getByRole("button", { name: "Revisar y continuar" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/No hay una suscripción para actualizar/)).toBeTruthy();
  expect(mock.manage.mock.calls.filter(([input]) => input.action === "checkout")).toHaveLength(1);
});
