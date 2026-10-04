// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { navigateWithUnsavedChanges } from "@/lib/use-unsaved-changes";
import { ActivityForm } from "./activity-form";

const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push, refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ createActivity: mock.create, updateActivity: mock.update, deleteActivity: mock.remove }));
const groupId = "28000000-0000-4000-8000-000000000201";
const id = "28000000-0000-4000-8000-000000000501";
const types = [{ id: "b2c3d4e5-0001-4b3c-8d4e-111111111111", name: "TRAINING", group_id: null }];
const values = { title: "Entrenamiento", activity_type_id: types[0]!.id, starts_at: "2026-07-07T18:30", ends_at: "2026-07-07T20:00", description: "", location: "" };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/"); mock.create.mockResolvedValue({ activityId: id }); mock.update.mockResolvedValue({ affected: 3 }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

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
    await waitFor(() => expect(mock.push).toHaveBeenCalledWith(`/groups/${groupId}/activities/${id}`));
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

describe("edición protegida y alcance explícito", () => {
  it("cancelar sin cambios vuelve al origen sin confirmar", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} returnHref="/groups?period=past&page=3#agenda" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(mock.push).toHaveBeenCalledWith("/groups?period=past&page=3#agenda");
  });
  it("avisa al cancelar con cambios y permite seguir editando sin perderlos", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nuevo título" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(mock.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Nuevo título");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    await waitFor(() => expect(mock.push).toHaveBeenCalledWith(`/groups/${groupId}/activities/${id}`));
  });
  it("restaurar valores elimina el aviso y guardar con éxito tampoco confirma descarte", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} detailQuery="?from=group&period=past&page=2" />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Temporal" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: values.title } });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 20));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Guardado nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock.push).toHaveBeenCalledWith(`/groups/${groupId}/activities/${id}?from=group&period=past&page=2`));
    expect(confirm).not.toHaveBeenCalled();
  });
  it("protege enlaces, cambios de grupo y Atrás, y limpia listeners al desmontar", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = render(<><a href="/groups">Salir a grupos</a><ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} /></>);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Borrador" } });
    fireEvent.click(screen.getByRole("link", { name: "Salir a grupos" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    const switchGroup = vi.fn();
    navigateWithUnsavedChanges(switchGroup);
    expect(switchGroup).not.toHaveBeenCalled();
    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(3));
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Borrador");
    expect(window.history.state?.asisteamUnsavedActivity).toBe(true);
    view.unmount();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    navigateWithUnsavedChanges(switchGroup);
    expect(switchGroup).toHaveBeenCalledOnce();
  });
  it("no restablece la fecha al cambiar alcance y exige corregirla antes de enviar serie", async () => {
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} />);
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: "2026-07-08T18:30" } });
    fireEvent.change(screen.getByLabelText("Término"), { target: { value: "2026-07-08T20:00" } });
    fireEvent.click(screen.getByLabelText("Esta y las siguientes"));
    expect((screen.getByLabelText("Inicio") as HTMLInputElement).value).toBe("2026-07-08T18:30");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Para mover la fecha elige Solo esta actividad. Para editar la serie, conserva la fecha original.");
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("el alcance de guardar no amplía el de eliminar y Escape conserva la actividad", async () => {
    const user = userEvent.setup();
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: true, values }} />);
    await user.click(screen.getByLabelText("Esta y las siguientes"));
    await user.click(screen.getByRole("button", { name: "Eliminar actividad" }));
    expect(screen.getByText("Se eliminará solo esta actividad. Las demás ocurrencias de la serie se conservan.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Conservar actividad" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Confirmar eliminación" })).toBeNull();
    expect(mock.remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Eliminar actividad" }));
  });
  it("un fallo de guardado mantiene el borrador y la protección", async () => {
    mock.update.mockResolvedValueOnce({ error: { message: "Sin conexión", details: {} } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ActivityForm groupId={groupId} types={types} activity={{ id, recurring: false, values }} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Borrador local" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Sin conexión");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(confirm).toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
  });
});
