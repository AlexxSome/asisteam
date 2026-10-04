// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ consent: vi.fn(), review: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ consentManagedMember: mock.consent, reviewManagedActivation: mock.review }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { AccountActivationConsent, ManagedConsentForm } from "./consent-form";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("requiere checkbox explícito y confirma activación después del servidor", async () => {
  mock.consent.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  render(<ManagedConsentForm membershipId="membership-id" fullName="Pupilo" relationship="Tutor" />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button"));
  expect(mock.consent).toHaveBeenCalledWith({ membership_id: "membership-id", accepted: true });
  expect((await screen.findByRole("status")).textContent).toContain("activo en el grupo");
});
it("activación requiere autorización propia y permite rechazo sin checkbox", async () => {
  mock.review.mockResolvedValue({ success: true });
  render(<AccountActivationConsent requestId="request" fullName="Pupilo" relationship="Tutor" approved={false} />);
  expect((screen.getByRole("button", { name: "Autorizar y enviar activación" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
  expect(mock.review).toHaveBeenCalledWith({ request_id: "request", accepted: false });
  expect((await screen.findByRole("status")).textContent).toContain("sigue gestionada");
});
it("confirmación explícita envía y no anuncia credenciales antes del titular", async () => {
  mock.review.mockResolvedValue({ success: true });
  render(<AccountActivationConsent requestId="request" fullName="Pupilo" relationship="Tutor" approved={false} />);
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Autorizar y enviar activación" }));
  expect(mock.review).toHaveBeenCalledWith({ request_id: "request", accepted: true });
  expect((await screen.findByRole("status")).textContent).toContain("debe crear su contraseña");
});
it("permite recuperar envío fallido sin duplicar consentimiento", async () => {
  mock.review.mockResolvedValue({ error: { message: "El consentimiento quedó registrado. Puedes volver a intentar el envío." } });
  render(<AccountActivationConsent requestId="request" fullName="Pupilo" relationship="Tutor" approved />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Enviar de nuevo la activación" }));
  expect((await screen.findByRole("alert")).textContent).toContain("consentimiento quedó registrado");
  expect(screen.queryByRole("status")).toBeNull();
});
it("conserva la aprobación al fallar el envío y permite reintentar sin ofrecer rechazo", async () => {
  mock.review.mockResolvedValueOnce({ approvalRecorded: true, error: { message: "El consentimiento quedó registrado. Puedes volver a intentar el envío." } })
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  render(<AccountActivationConsent requestId="request" fullName="Pupilo" relationship="Tutor" approved={false} />);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Autorizar y enviar activación" }));
  expect((await screen.findByRole("alert")).textContent).toContain("consentimiento quedó registrado");
  expect(screen.queryByRole("button", { name: "Rechazar solicitud" })).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Enviar de nuevo la activación" }));
  expect(mock.review).toHaveBeenNthCalledWith(2, { request_id: "request", accepted: true });
  expect((await screen.findByRole("status")).textContent).toContain("invitación enviada");
});
it("un error anterior a la aprobación mantiene la decisión pendiente", async () => {
  mock.review.mockResolvedValue({ error: { message: "No pudimos guardar el cambio." } });
  const user = userEvent.setup();
  render(<AccountActivationConsent requestId="request" fullName="Pupilo" relationship="Tutor" approved={false} />);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Autorizar y enviar activación" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No pudimos guardar");
  expect(screen.getByRole("button", { name: "Rechazar solicitud" })).toBeTruthy();
  expect(screen.getByRole("checkbox")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

it.each([undefined, "group-id"])("consentimiento sin cupos respeta permiso ADMIN (%s)", async billingGroupId => {
  mock.consent.mockResolvedValue({ error: { code: "subscription_athlete_limit", message: "Internal capacity message" } });
  render(<ManagedConsentForm membershipId="membership-id" fullName="Pupilo" relationship="Tutor" billingGroupId={billingGroupId} />);
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button"));
  const alert = await screen.findByRole("alert");
  if (billingGroupId) expect(screen.getByRole("link", { name: "Gestionar plan" }).getAttribute("href")).toBe("/groups/group-id/billing");
  else { expect(alert.textContent).toContain("Contacta a tu administrador"); expect(screen.queryByRole("link")).toBeNull(); }
  expect(screen.queryByRole("status")).toBeNull();
  expect(mock.refresh).not.toHaveBeenCalled();
});
