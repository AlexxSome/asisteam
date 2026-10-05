// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ send: vi.fn(), refresh: vi.fn(), group: vi.fn(), range: vi.fn() }));
vi.mock("./actions", () => ({ sendInvitation: mock.send }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }), notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: mock.range };
  return { from: () => query };
} }));
import InvitationPage from "./page";
import { InvitationFeedback, InvitationForm, ResendInvitationButton } from "./invitation-form";
const groupId = "23000000-0000-4000-8000-000000000201";
const invitationId = "23000000-0000-4000-8000-000000000301";
beforeEach(() => { vi.resetAllMocks(); mock.send.mockResolvedValue({ invitation: { id: invitationId } }); });
afterEach(cleanup);
describe("formulario ADMIN de invitaciones", () => {
  it("ofrece solo Deportista/Apoderado y envía email con rol elegido", async () => {
    const user = userEvent.setup();
    render(<InvitationFeedback><InvitationForm groupId={groupId} /></InvitationFeedback>);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Deportista", "Apoderado"]);
    await user.type(screen.getByLabelText("Email"), "GUARDIAN@example.test");
    await user.selectOptions(screen.getByLabelText("Rol en el grupo"), "GUARDIAN");
    await user.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledWith({ action: "send", group_id: groupId, email: "guardian@example.test", role: "GUARDIAN" }));
    expect((await screen.findByRole("status")).textContent).toContain("Envío de invitación confirmado");
  });
  it("un email inválido no dispara envío", async () => {
    const user = userEvent.setup();
    render(<InvitationFeedback><InvitationForm groupId={groupId} /></InvitationFeedback>);
    await user.type(screen.getByLabelText("Email"), "no-email");
    await user.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText("Ingresa un email válido")).toBeTruthy();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("mantiene error del proveedor aunque el reenvío retire el botón anterior", async () => {
    const user = userEvent.setup();
    mock.send.mockResolvedValue({ error: { message: "La invitación quedó guardada, pero no se confirmó el envío." } });
    const view = render(<InvitationFeedback><ResendInvitationButton groupId={groupId} invitationId={invitationId} /></InvitationFeedback>);
    await user.click(screen.getByRole("button", { name: "Reenviar invitación" }));
    expect(mock.send).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar reenvío" }));
    await screen.findByRole("alert");
    view.rerender(<InvitationFeedback><p>Listado actualizado</p></InvitationFeedback>);
    expect(screen.getByRole("alert").textContent).toContain("no se confirmó");
    expect(mock.send).toHaveBeenCalledWith({ action: "resend", group_id: groupId, invitation_id: invitationId });
  });
});

it.each(["rejection", "business"])("conserva email, rol y foco al fallar (%s), sin refrescar la página", async mode => {
  if (mode === "rejection") mock.send.mockRejectedValue(new Error("private detail"));
  else mock.send.mockResolvedValue({ error: { message: "No pudimos enviar la invitación." } });
  const user = userEvent.setup();
  render(<InvitationFeedback><InvitationForm groupId={groupId} /></InvitationFeedback>);
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  const role = screen.getByLabelText("Rol en el grupo") as HTMLSelectElement;
  await user.type(email, "guardian@example.test");
  await user.selectOptions(role, "GUARDIAN");
  const submit = screen.getByRole("button", { name: "Enviar invitación" });
  await user.click(submit);
  await screen.findByRole("alert");
  expect(email.value).toBe("guardian@example.test");
  expect(role.value).toBe("GUARDIAN");
  expect(document.activeElement).toBe(submit);
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("private detail");
});

it("reenvío requiere confirmar, Escape cancela y éxito no afirma entrega", async () => {
  const user = userEvent.setup();
  render(<InvitationFeedback><ResendInvitationButton groupId={groupId} invitationId={invitationId} /></InvitationFeedback>);
  const trigger = screen.getByRole("button", { name: "Reenviar invitación" });
  await user.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
  expect(mock.send).not.toHaveBeenCalled();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Confirmar reenvío" }));
  expect((await screen.findByRole("status")).textContent).toContain("no confirma su entrega ni lectura");
  expect(mock.send).toHaveBeenCalledOnce();
});


it("separa alta e historial con estados, vencimientos y paginación", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  mock.range.mockResolvedValue({ data: [
    { id: invitationId, email: "expired@example.test", role: "ATHLETE", status: "PENDING", expires_at: "2020-01-01T12:00:00Z" },
    { id: "accepted", email: "accepted@example.test", role: "GUARDIAN", status: "ACCEPTED", expires_at: "2020-01-01T12:00:00Z" },
  ], count: 11, error: null });
  const params = Promise.resolve({ groupId });
  const view = render(await InvitationPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByLabelText("Email")).toBeTruthy();
  expect(screen.queryByText("expired@example.test")).toBeNull();
  expect(screen.getByRole("link", { name: "Historial (11)" }).getAttribute("href")).toBe("?view=history");
  view.rerender(await InvitationPage({ params, searchParams: Promise.resolve({ view: "history" }) }));
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(screen.getByText("Deportista · Expirada")).toBeTruthy();
  expect(screen.getByText("Apoderado · Aceptada")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Reenviar invitación" })).toHaveLength(1);
  expect(screen.getAllByText(/Vence:/)).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?view=history&page=2");
  expect(mock.range).toHaveBeenLastCalledWith(0, 9);
  view.rerender(await InvitationPage({ params, searchParams: Promise.resolve({ page: "2" }) }));
  expect(mock.range).toHaveBeenLastCalledWith(10, 19);
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("?view=history&page=1");
});
it.each(["ATHLETE", "GUARDIAN"])("no muestra gestión de invitaciones a %s", async role => {
  mock.group.mockResolvedValue({ id: groupId, roles: [role] });
  await expect(InvitationPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  expect(mock.range).not.toHaveBeenCalled();
});
