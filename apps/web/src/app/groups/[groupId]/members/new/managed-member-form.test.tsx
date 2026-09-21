// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./actions", () => ({ createManagedMember: mock.create }));
import { ManagedMemberForm } from "./managed-member-form";
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });
it("crea adulto sin email y confirma su disponibilidad en asistencia", async () => {
  mock.create.mockResolvedValue({ member: { membership_id: "id", membership_status: "ACTIVE" } });
  const user = userEvent.setup();
  render(<ManagedMemberForm groupId="group-id" />);
  await user.type(screen.getByLabelText("Nombre completo"), "Persona sin correo");
  await user.type(screen.getByLabelText("Fecha de nacimiento"), "1990-01-01");
  await user.click(screen.getByRole("button", { name: "Crear cuenta gestionada" }));
  expect((await screen.findByRole("status")).textContent).toContain("toma de asistencia");
  expect(mock.create).toHaveBeenCalledWith("group-id", { full_name: "Persona sin correo", birthdate: "1990-01-01", email: "" });
});
it("bloquea menor sin autorización y explica PENDING sin afirmar activación", async () => {
  mock.create.mockResolvedValue({ member: { membership_id: "id", membership_status: "PENDING" }, guardianInvitation: "retry_required" });
  const user = userEvent.setup();
  render(<ManagedMemberForm groupId="group-id" />);
  await user.type(screen.getByLabelText("Nombre completo"), "Menor gestionado");
  await user.type(screen.getByLabelText("Fecha de nacimiento"), "2020-01-01");
  await user.type(screen.getByLabelText("Nombre completo del apoderado"), "Persona apoderada");
  await user.type(screen.getByLabelText("Email del apoderado"), "tutor@example.test");
  await user.type(screen.getByLabelText("Vínculo con el menor"), "Tutor");
  await user.click(screen.getByRole("button", { name: "Crear cuenta gestionada" }));
  expect(mock.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Crear cuenta gestionada" }));
  expect((await screen.findByRole("status")).textContent).toContain("pendiente del consentimiento");
  expect(screen.getByRole("alert").textContent).toContain("No repitas el alta");
});
it("retira los campos de apoderado al corregir la fecha a un adulto", async () => {
  mock.create.mockResolvedValue({ member: { membership_id: "id", membership_status: "ACTIVE" } });
  const user = userEvent.setup();
  render(<ManagedMemberForm groupId="group-id" />);
  await user.type(screen.getByLabelText("Nombre completo"), "Persona gestionada");
  const birthdate = screen.getByLabelText("Fecha de nacimiento");
  await user.type(birthdate, "2020-01-01");
  await user.type(screen.getByLabelText("Nombre completo del apoderado"), "Dato descartado");
  await user.clear(birthdate); await user.type(birthdate, "1990-01-01");
  expect(screen.queryByRole("group", { name: "Apoderado del menor" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Crear cuenta gestionada" }));
  await screen.findByRole("status");
  expect(mock.create).toHaveBeenCalledWith("group-id", { full_name: "Persona gestionada", birthdate: "1990-01-01", email: "" });
});
