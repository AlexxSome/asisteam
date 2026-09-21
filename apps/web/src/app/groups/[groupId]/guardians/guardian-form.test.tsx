// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./actions", () => ({ createGuardianship: mock.create }));
import { GuardianForm } from "./guardian-form";
const athlete = { user_id: "25000000-0000-4000-8000-000000000111", full_name: "Menor sintético" };
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
async function fill() {
  const user = userEvent.setup();
  render(<GuardianForm groupId="group-id" athletes={[athlete]} />);
  await user.selectOptions(screen.getByLabelText("Deportista menor de edad"), athlete.user_id);
  await user.type(screen.getByLabelText("Nombre completo del apoderado"), "Persona apoderada");
  await user.type(screen.getByLabelText("Email del apoderado"), "persona@example.test");
  await user.type(screen.getByLabelText("Vínculo con el menor"), "Madre");
  return user;
}
it("valida campos obligatorios sin registrar", async () => {
  const user = userEvent.setup();
  render(<GuardianForm groupId="group-id" athletes={[athlete]} />);
  await user.click(screen.getByRole("button", { name: "Registrar y vincular apoderado" }));
  expect(await screen.findByText("Selecciona un deportista menor de edad")).toBeTruthy();
  expect(mock.create).not.toHaveBeenCalled();
});
it("confirma vínculo e invitación sin afirmar activación del deportista", async () => {
  mock.create.mockResolvedValue({ guardianshipId: "id", invitation: "sent" });
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Registrar y vincular apoderado" }));
  expect((await screen.findByRole("status")).textContent).toContain("conservan sus requisitos");
  expect(screen.getByText(/Invitación enviada/)).toBeTruthy();
  expect(mock.create).toHaveBeenCalledWith("group-id", { athlete_user_id: athlete.user_id, full_name: "Persona apoderada", email: "persona@example.test", relationship: "Madre" });
});
it("ofrece recuperar el correo sin repetir el vínculo", async () => {
  mock.create.mockResolvedValue({ guardianshipId: "id", invitation: "retry_required" });
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Registrar y vincular apoderado" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No repitas el registro");
  expect(screen.getByRole("link", { name: "Revisar invitaciones" }).getAttribute("href")).toBe("/groups/group-id/invitations/new");
  expect(screen.queryByRole("button", { name: "Registrar y vincular apoderado" })).toBeNull();
});
it("muestra el duplicado y conserva el formulario para corregir", async () => {
  mock.create.mockResolvedValue({ error: { code: "guardianship_already_exists", message: "Este vínculo ya está registrado.", details: {} } });
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Registrar y vincular apoderado" }));
  expect((await screen.findByRole("alert")).textContent).toContain("ya está registrado");
  expect(screen.queryByRole("status")).toBeNull();
});
