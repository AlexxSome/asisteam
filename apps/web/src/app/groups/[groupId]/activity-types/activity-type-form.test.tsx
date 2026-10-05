// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityTypeForm } from "./activity-type-form";
const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ createActivityType: mock.create, updateActivityType: mock.update }));
const groupId = "29000000-0000-4000-8000-000000000201";
const type = { id: "29000000-0000-4000-8000-000000000301", name: "Amistoso", color: "#123ABC", is_active: true };
beforeEach(() => { vi.resetAllMocks(); mock.create.mockResolvedValue({ id: type.id }); mock.update.mockResolvedValue({ id: type.id }); });
afterEach(cleanup);
it("crea con nombre/color, muestra éxito y limpia formulario", async () => {
  render(<ActivityTypeForm groupId={groupId} />);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Amistoso " } });
  fireEvent.click(screen.getByLabelText("Azul"));
  fireEvent.click(screen.getByRole("button", { name: "Crear tipo" }));
  await screen.findByRole("status");
  expect(mock.create).toHaveBeenCalledWith(groupId, { name: type.name, color: "#2563EB" });
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("");
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it("desactiva un tipo existente solo al guardar", async () => {
  render(<ActivityTypeForm groupId={groupId} activityType={type} />);
  expect(screen.queryByLabelText("Disponible para nuevas actividades")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Editar Amistoso" }));
  fireEvent.click(screen.getByLabelText("Disponible para nuevas actividades"));
  expect(screen.getByText(/No se cancelan ni modifican/)).toBeTruthy();
  expect(mock.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mock.update).toHaveBeenCalledWith(groupId, type.id, { name: type.name, color: type.color, is_active: false }));
});
it("valida y conserva datos al recibir nombre duplicado", async () => {
  mock.create.mockResolvedValue({ error: { code: "activity_type_name_exists", message: "Ya existe ese nombre", details: {} } });
  render(<ActivityTypeForm groupId={groupId} />);
  fireEvent.click(screen.getByRole("button", { name: "Crear tipo" }));
  await screen.findByText("El nombre debe tener al menos 2 caracteres");
  expect(mock.create).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: type.name } });
  fireEvent.click(screen.getByRole("button", { name: "Crear tipo" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Ya existe ese nombre");
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(type.name);
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("cancelar descarta edición, conserva datos y devuelve foco al disparador", async () => {
  const user = userEvent.setup();
  render(<ActivityTypeForm groupId={groupId} activityType={type} />);
  await user.click(screen.getByRole("button", { name: "Editar Amistoso" }));
  expect(document.activeElement).toBe(screen.getByLabelText("Nombre"));
  await user.clear(screen.getByLabelText("Nombre"));
  await user.type(screen.getByLabelText("Nombre"), "Cambio sin guardar");
  await user.click(screen.getByRole("button", { name: "Cancelar edición" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar Amistoso" }));
  expect(mock.update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Editar Amistoso" }));
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(type.name);
});
it("edición avanzada conserva color personalizado y expone errores", async () => {
  const user = userEvent.setup();
  render(<ActivityTypeForm groupId={groupId} activityType={type} />);
  await user.click(screen.getByRole("button", { name: "Editar Amistoso" }));
  await user.click(screen.getByText("Color personalizado (avanzado)"));
  const input = screen.getByLabelText("Color hexadecimal") as HTMLInputElement;
  expect(input.value).toBe(type.color);
  await user.clear(input); await user.type(input, "error");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText(/Ingresa un color hexadecimal/)).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(mock.update).not.toHaveBeenCalled();
  await user.click(screen.getByLabelText("Verde"));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mock.update).toHaveBeenCalledWith(groupId, type.id, { name: type.name, color: "#15803D", is_active: true }));
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Tipo de actividad actualizado.");
  expect(screen.queryByRole("form")).toBeNull();
});
