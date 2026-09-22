// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActivityForm } from "./activity-form";

const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push, refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ createActivity: mock.create, updateActivity: mock.update, deleteActivity: mock.remove }));
const groupId = "28000000-0000-4000-8000-000000000201";
const id = "28000000-0000-4000-8000-000000000501";
const types = [{ id: "b2c3d4e5-0001-4b3c-8d4e-111111111111", name: "TRAINING", group_id: null }];
const values = { title: "Entrenamiento", activity_type_id: types[0]!.id, starts_at: "2026-07-07T18:30", ends_at: "2026-07-07T20:00", description: "", location: "" };
beforeEach(() => { vi.clearAllMocks(); mock.create.mockResolvedValue({ activityId: id }); mock.update.mockResolvedValue({ affected: 3 }); });
afterEach(cleanup);

describe("formulario de serie semanal", () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: values.title } });
    fireEvent.change(screen.getByLabelText("Tipo de actividad"), { target: { value: values.activity_type_id } });
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: values.starts_at } });
    fireEvent.change(screen.getByLabelText("Término"), { target: { value: values.ends_at } });
  };
  it("permite seleccionar días y término, y envía una sola creación", async () => {
    render(<ActivityForm groupId={groupId} types={types} />);
    fill();
    fireEvent.click(screen.getByLabelText("Repetir semanalmente"));
    fireEvent.click(screen.getByLabelText("Martes"));
    fireEvent.click(screen.getByLabelText("Jueves"));
    fireEvent.change(screen.getByLabelText("Repetir hasta"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear serie semanal" }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledExactlyOnceWith(groupId, { ...values, recurrence_rule: { freq: "WEEKLY", by_weekday: ["TU", "TH"], until: "2026-09-30" } }));
    expect(mock.push).toHaveBeenCalledWith(`/groups/${groupId}/activities/${id}`);
  });
  it("desactivar recurrencia elimina una regla incompleta y permite actividad puntual", async () => {
    render(<ActivityForm groupId={groupId} types={types} />);
    fill();
    fireEvent.click(screen.getByLabelText("Repetir semanalmente"));
    fireEvent.click(screen.getByLabelText("Repetir semanalmente"));
    fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledWith(groupId, { ...values, recurrence_rule: null }));
  });
  it("permite elegir alcance al guardar los cambios", async () => {
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} />);
    fireEvent.click(screen.getByLabelText("Esta y las siguientes"));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nuevo título" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock.update).toHaveBeenCalledWith(groupId, id, { ...values, title: "Nuevo título" }, "series"));
  });
  it("requiere confirmación adicional explícita antes de eliminar asistencia", async () => {
    mock.remove.mockResolvedValueOnce({ error: { code: "attendance_confirmation_required", message: "Tiene asistencia", details: {} } }).mockResolvedValueOnce({ affected: 1 });
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar actividad" }));
    expect(mock.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    await screen.findByText("Tiene asistencia");
    expect(mock.remove).toHaveBeenCalledWith(groupId, id, "single", false);
    expect((screen.getByRole("button", { name: "Confirmar eliminación" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Confirmo eliminar también la asistencia registrada de esta actividad."));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    await waitFor(() => expect(mock.remove).toHaveBeenLastCalledWith(groupId, id, "single", true));
  });
});
