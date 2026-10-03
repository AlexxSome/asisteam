// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ send: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ sendInvitation: mock.send }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
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
    expect((await screen.findByRole("status")).textContent).toContain("Invitación enviada");
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
