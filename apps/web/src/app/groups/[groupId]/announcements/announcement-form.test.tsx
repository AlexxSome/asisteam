// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ publish: vi.fn(), update: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ publishAnnouncement: mock.publish, updateAnnouncement: mock.update, deleteAnnouncement: mock.remove }));
import { AnnouncementForm, AnnouncementManagement } from "./announcement-form";
const item = { id: "announcement", title: "Aviso inicial", body: "Cuerpo inicial", updated_at: "2026-10-03T10:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); mock.publish.mockResolvedValue({ success: true }); mock.update.mockResolvedValue({ success: true }); mock.remove.mockResolvedValue({ success: true }); });
afterEach(cleanup);
describe("gestión del muro", () => {
  it("valida título/cuerpo, publica y vacía el formulario", async () => {
    const user = userEvent.setup(); render(<AnnouncementForm groupId="group" />);
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    expect(mock.publish).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Título"), "Nuevo horario");
    await user.type(screen.getByLabelText("Contenido"), "Entrenamos a las 19:00");
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    await waitFor(() => expect(mock.publish).toHaveBeenCalledWith("group", expect.any(String), { title: "Nuevo horario", body: "Entrenamos a las 19:00" }));
    expect(screen.getByRole("status").textContent).toBe("Anuncio publicado.");
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("");
  });
  it("reintenta publicación incierta con el mismo identificador", async () => {
    const user = userEvent.setup(); mock.publish.mockRejectedValueOnce(new Error("network"));
    render(<AnnouncementForm groupId="group" />);
    await user.type(screen.getByLabelText("Título"), "Aviso"); await user.type(screen.getByLabelText("Contenido"), "Texto");
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    await waitFor(() => expect(mock.publish).toHaveBeenCalledTimes(2));
    expect(mock.publish.mock.calls[0]![1]).toBe(mock.publish.mock.calls[1]![1]);
  });
  it("conserva versión al editar aunque llegue una actualización del muro", async () => {
    const user = userEvent.setup(); const view = render(<AnnouncementForm groupId="group" announcement={item} />);
    view.rerender(<AnnouncementForm groupId="group" announcement={{ ...item, updated_at: "2026-10-03T11:00:00Z", title: "Cambio ajeno" }} />);
    await user.clear(screen.getByLabelText("Título")); await user.type(screen.getByLabelText("Título"), "Mi edición");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock.update).toHaveBeenCalledWith("group", item.id, item.updated_at, { title: "Mi edición", body: item.body }));
  });
  it("exige confirmación antes de eliminar y conserva la versión confirmada", async () => {
    const user = userEvent.setup(); const view = render(<AnnouncementManagement groupId="group" announcement={item} />);
    await user.click(screen.getByRole("button", { name: "Eliminar anuncio" }));
    expect(mock.remove).not.toHaveBeenCalled();
    view.rerender(<AnnouncementManagement groupId="group" announcement={{ ...item, updated_at: "2026-10-03T11:00:00Z" }} />);
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    expect(mock.remove).toHaveBeenCalledWith("group", item.id, item.updated_at);
  });
});
