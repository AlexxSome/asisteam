// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ coach: vi.fn(), status: vi.fn(), update: vi.fn(), activate: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ assignMemberCoach: mock.coach, changeMemberStatus: mock.status, updateManagedMember: mock.update, requestManagedActivation: mock.activate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { MemberManagement } from "./member-management";
import type { GroupMember } from "@asisteam/core";
const groupId = "34000000-0000-4000-8000-000000000201";
const member: GroupMember = { membership_id: "34000000-0000-4000-8000-000000000311", full_name: "Persona gestionada", email: null, phone: null, birthdate: "1990-01-01", account_status: "MANAGED", role: "ATHLETE", status: "ACTIVE", total_count: 1, user_id: "34000000-0000-4000-8000-000000000111", person_roles: [{ role: "ATHLETE", status: "ACTIVE" }], is_last_admin: false };
beforeEach(() => { mock.status.mockResolvedValue({ success: true }); mock.update.mockResolvedValue({ success: true }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });
async function openActions() { await userEvent.click(screen.getByLabelText(/^Acciones de/)); }
async function openEditor() {
  await userEvent.click(screen.getByRole("button", { name: /^Ver detalle/ }));
  await userEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
}
it("solo ofrece editar MANAGED y exige confirmación de baja", async () => {
  render(<MemberManagement groupId={groupId} member={{ ...member, account_status: "ACTIVE" }} />);
  expect(screen.queryByRole("button", { name: "Editar perfil" })).toBeNull();
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Desactivar este rol" }));
  expect(mock.status).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirmar desactivación" }));
  expect(mock.status).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, action: "deactivate" });
  expect((await screen.findByRole("status")).textContent).toContain("historial se conserva");
  expect(mock.refresh).toHaveBeenCalled();
});
it("reactiva inactivos y mantiene errores de negocio visibles", async () => {
  mock.status.mockResolvedValue({ error: { message: "El menor requiere consentimiento vigente." } });
  render(<MemberManagement groupId={groupId} member={{ ...member, status: "INACTIVE" }} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Reactivar este rol" }));
  expect(mock.status).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, action: "reactivate" });
  expect((await screen.findByRole("alert")).textContent).toContain("consentimiento");
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("edita el nombre y teléfono opcional sin enviar identidad ni credenciales", async () => {
  render(<MemberManagement groupId={groupId} member={member} />);
  await openEditor();
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
  await openEditor();
  await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
  expect((await screen.findByRole("link", { name: "Revisar correcciones de fecha" })).getAttribute("href")).toBe("/profile/birthdate-requests");
});
it("deshabilita controles mientras guarda y no publica éxito antes de respuesta", async () => {
  mock.status.mockReturnValue(new Promise(() => {}));
  render(<MemberManagement groupId={groupId} member={{ ...member, status: "INACTIVE" }} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Reactivar este rol" }));
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("solicita email antes de activar y abre edición sin enviar", async () => {
  render(<MemberManagement groupId={groupId} member={member} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Activar cuenta propia" }));
  expect(screen.getByLabelText("Email (opcional)")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("email único");
  expect(mock.activate).not.toHaveBeenCalled();
});
it.each([true, false])("distingue consentimiento pendiente (%s) de correo enviado", async consentPending => {
  mock.activate.mockResolvedValue({ success: true, consentPending });
  render(<MemberManagement groupId={groupId} member={{ ...member, email: "managed@example.test" }} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Activar cuenta propia" }));
  expect(mock.activate).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id });
  expect((await screen.findByRole("status")).textContent).toContain(consentPending ? "apoderado debe autorizarla" : "Invitación de activación enviada");
});

it("asigna entrenador sin reemplazar el rol actual y refresca la nómina", async () => {
  mock.coach.mockResolvedValue({ success: true });
  render(<MemberManagement groupId={groupId} member={member} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Asignar rol Entrenador" }));
  expect(mock.coach).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id });
  expect((await screen.findByRole("status")).textContent).toContain("otros roles e historial se conservan");
  expect(mock.status).not.toHaveBeenCalled();
  expect(mock.refresh).toHaveBeenCalled();
});
it("COACH se puede desactivar y no ofrece volver a asignar el mismo rol", async () => {
  render(<MemberManagement groupId={groupId} member={{ ...member, role: "COACH" }} />);
  await openActions();
  expect(screen.queryByRole("button", { name: "Asignar rol Entrenador" })).toBeNull();
  expect(screen.getByRole("button", { name: "Desactivar este rol" })).toBeTruthy();
});

it("reactivación sin cupos guía al ADMIN a su plan sin anunciar éxito", async () => {
  mock.status.mockResolvedValue({ error: { code: "subscription_athlete_limit", message: "Solicita al administrador" } });
  render(<MemberManagement groupId={groupId} member={{ ...member, status: "INACTIVE" }} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Reactivar este rol" }));
  expect((await screen.findByRole("link", { name: "Gestionar plan" })).getAttribute("href")).toBe(`/groups/${groupId}/billing`);
  expect(screen.queryByRole("status")).toBeNull();
  expect(mock.refresh).not.toHaveBeenCalled();
});


it("revela contactos solo en detalle y el menú se cierra con Escape", async () => {
  render(<MemberManagement groupId={groupId} member={{ ...member, email: "persona@example.test" }} />);
  expect(screen.getByText("persona@example.test").closest("[hidden]")).toBeTruthy();
  await openActions();
  expect(screen.getByRole("button", { name: "Editar perfil" })).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByLabelText(/^Acciones de/)).toBe(document.activeElement);
  expect(screen.queryByRole("button", { name: "Activar cuenta propia" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /^Ver detalle/ }));
  expect(screen.getByText("persona@example.test").closest("[hidden]")).toBeNull();
});
it("cancelar sin cambios no pregunta; con cambios permite conservarlos o descartarlos", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MemberManagement groupId={groupId} member={member} />);
  await openEditor();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(confirm).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  await userEvent.type(screen.getByLabelText("Nombre completo"), " corregida");
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toBe("Persona gestionada corregida");
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByLabelText("Nombre completo")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toBe(member.full_name);
});
it("protege enlaces, filtros externos y recarga solo mientras hay edición sin guardar", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<><a href="/groups">Salir</a><form aria-label="Filtros"><button>Filtrar</button></form><MemberManagement groupId={groupId} member={member} /></>);
  await openEditor();
  await userEvent.type(screen.getByLabelText("Nombre completo"), " borrador");
  expect(fireEvent.click(screen.getByRole("link", { name: "Salir" }))).toBe(false);
  expect(fireEvent.submit(screen.getByRole("form", { name: "Filtros" }))).toBe(false);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(2);
  await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
  await waitFor(() => expect(mock.update).toHaveBeenCalled());
  const cleanUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
  expect(confirm).toHaveBeenCalledTimes(2);
});
it("el aviso de baja nombra el rol y Escape devuelve el foco a Acciones", async () => {
  render(<MemberManagement groupId={groupId} member={member} />);
  await openActions();
  await userEvent.click(screen.getByRole("button", { name: "Desactivar este rol" }));
  const confirmation = screen.getByRole("group", { name: "Desactivar rol Deportista" });
  expect(confirmation.textContent).toContain("sus otros roles no cambian");
  expect(within(confirmation).getByRole("button", { name: "Cancelar" })).toBe(document.activeElement);
  await userEvent.keyboard("{Escape}");
  expect(mock.status).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/^Acciones de/)).toBe(document.activeElement);
});

it("cerrar detalle y volver atrás conservan el borrador al rechazar descarte", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  window.history.replaceState({ test: "members" }, "", `/groups/${groupId}/members?page=2`);
  render(<MemberManagement groupId={groupId} member={member} />);
  await openEditor();
  await userEvent.type(screen.getByLabelText("Nombre completo"), " pendiente");
  await userEvent.click(screen.getByRole("button", { name: /^Cerrar detalle/ }));
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toContain("pendiente");
  window.history.replaceState({}, "", "/groups");
  const routerListener = vi.fn();
  window.addEventListener("popstate", routerListener);
  fireEvent.popState(window);
  expect(window.location.pathname).toBe(`/groups/${groupId}/members`);
  expect(window.location.search).toBe("?page=2");
  expect(routerListener).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toContain("pendiente");
  window.removeEventListener("popstate", routerListener);
  window.history.replaceState({}, "", "/");
});
it("un refresco de otra membership no descarta un perfil en edición", async () => {
  const { rerender } = render(<MemberManagement groupId={groupId} member={member} />);
  await openEditor();
  await userEvent.type(screen.getByLabelText("Nombre completo"), " borrador");
  rerender(<MemberManagement groupId={groupId} member={{ ...member, full_name: "Cambio externo" }} />);
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toBe("Persona gestionada borrador");
});
it("un error de guardado conserva los cambios y su protección", async () => {
  mock.update.mockResolvedValue({ error: { message: "No pudimos guardar." } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MemberManagement groupId={groupId} member={member} />);
  await openEditor();
  await userEvent.type(screen.getByLabelText("Nombre completo"), " corregida");
  await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No pudimos guardar");
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toContain("corregida");
});

it("último ADMIN mantiene bloqueo visible y no ofrece promoción inventada", async () => {
  render(<MemberManagement groupId={groupId} member={{ ...member, role: "ADMIN", is_last_admin: true, person_roles: [{ role: "ADMIN", status: "ACTIVE" }, { role: "ATHLETE", status: "INACTIVE" }] }} />);
  expect(screen.getByText("Último administrador")).toBeTruthy();
  expect(screen.getByText(/Otros roles de esta persona/).textContent).toContain("Deportista (Inactivo)");
  await openActions();
  expect((screen.getByRole("button", { name: "Desactivar este rol" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Debe haber otro administrador activo/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Promover|Asignar.*Administrador/ })).toBeNull();
  expect(mock.status).not.toHaveBeenCalled();
});
