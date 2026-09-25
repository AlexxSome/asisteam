// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ status: vi.fn(), update: vi.fn(), activate: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ changeMemberStatus: mock.status, updateManagedMember: mock.update, requestManagedActivation: mock.activate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { MemberManagement } from "./member-management";
import type { GroupMember } from "@asisteam/core";
const groupId = "34000000-0000-4000-8000-000000000201";
const member: GroupMember = { membership_id: "34000000-0000-4000-8000-000000000311", full_name: "Persona gestionada", email: null, phone: null, birthdate: "1990-01-01", account_status: "MANAGED", role: "ATHLETE", status: "ACTIVE", total_count: 1 };
beforeEach(() => { mock.status.mockResolvedValue({ success: true }); mock.update.mockResolvedValue({ success: true }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("solo ofrece editar MANAGED y exige confirmación de baja", async () => {
  render(<MemberManagement groupId={groupId} member={{ ...member, account_status: "ACTIVE" }} />);
  expect(screen.queryByRole("button", { name: "Editar perfil" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(mock.status).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirmar desactivación" }));
  expect(mock.status).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, action: "deactivate" });
  expect((await screen.findByRole("status")).textContent).toContain("historial se conserva");
  expect(mock.refresh).toHaveBeenCalled();
});
it("reactiva inactivos y mantiene errores de negocio visibles", async () => {
  mock.status.mockResolvedValue({ error: { message: "El menor requiere consentimiento vigente." } });
  render(<MemberManagement groupId={groupId} member={{ ...member, status: "INACTIVE" }} />);
  await userEvent.click(screen.getByRole("button", { name: "Reactivar" }));
  expect(mock.status).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, action: "reactivate" });
  expect((await screen.findByRole("alert")).textContent).toContain("consentimiento");
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("edita el nombre y teléfono opcional sin enviar identidad ni credenciales", async () => {
  render(<MemberManagement groupId={groupId} member={member} />);
  await userEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  const name = screen.getByLabelText("Nombre completo");
  await userEvent.clear(name); await userEvent.type(name, "Nombre corregido");
  await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
  await waitFor(() => expect(mock.update).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id,
    profile: { full_name: "Nombre corregido", birthdate: member.birthdate, email: "", phone: null } }));
  expect((await screen.findByRole("status")).textContent).toContain("todos sus grupos");
});
it("muestra enlace a aprobación cuando la corrección de fecha queda pendiente", async () => {
  mock.update.mockResolvedValue({ success: true, birthdatePending: true });
  render(<MemberManagement groupId={groupId} member={member} />);
  await userEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
  expect((await screen.findByRole("link", { name: "Revisar correcciones de fecha" })).getAttribute("href")).toBe("/profile/birthdate-requests");
});
it("deshabilita controles mientras guarda y no publica éxito antes de respuesta", async () => {
  mock.status.mockReturnValue(new Promise(() => {}));
  render(<MemberManagement groupId={groupId} member={{ ...member, status: "INACTIVE" }} />);
  await userEvent.click(screen.getByRole("button", { name: "Reactivar" }));
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("solicita email antes de activar y abre edición sin enviar", async () => {
  render(<MemberManagement groupId={groupId} member={member} />);
  await userEvent.click(screen.getByRole("button", { name: "Activar cuenta propia" }));
  expect(screen.getByLabelText("Email (opcional)")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("email único");
  expect(mock.activate).not.toHaveBeenCalled();
});
it.each([true, false])("distingue consentimiento pendiente (%s) de correo enviado", async consentPending => {
  mock.activate.mockResolvedValue({ success: true, consentPending });
  render(<MemberManagement groupId={groupId} member={{ ...member, email: "managed@example.test" }} />);
  await userEvent.click(screen.getByRole("button", { name: "Activar cuenta propia" }));
  expect(mock.activate).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id });
  expect((await screen.findByRole("status")).textContent).toContain(consentPending ? "apoderado debe autorizarla" : "Invitación de activación enviada");
});
