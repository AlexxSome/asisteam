// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ publish: vi.fn(), update: vi.fn(), remove: vi.fn(), refresh: vi.fn(), preference: vi.fn() }));
vi.mock("next/navigation", () => { const router = { refresh: mock.refresh }; return { useRouter: () => router }; });
vi.mock("./actions", () => ({ publishAnnouncement: mock.publish, updateAnnouncement: mock.update, deleteAnnouncement: mock.remove, setAnnouncementPush: mock.preference }));
import { AnnouncementComposer, AnnouncementForm, AnnouncementManagement } from "./announcement-form";
import { AnnouncementPushPreference, WallRefresh, WallSession } from "./wall-controls";
const item = { id: "announcement", title: "Aviso inicial", body: "Cuerpo inicial", updated_at: "2026-10-03T10:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); mock.publish.mockResolvedValue({ success: true }); mock.update.mockResolvedValue({ success: true }); mock.remove.mockResolvedValue({ success: true }); mock.preference.mockResolvedValue({ success: true }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
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


describe("composición y confirmación accesibles", () => {
  it("revela el editor por teclado y conserva el borrador al ocultarlo y refrescar", async () => {
    const user = userEvent.setup();
    const view = render(<WallSession><WallRefresh /><AnnouncementComposer groupId="group" /></WallSession>);
    expect(screen.queryByRole("textbox")).toBeNull();
    const publish = screen.getByRole("button", { name: "Publicar anuncio" });
    publish.focus(); await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Borrador conservado");
    await user.type(screen.getByLabelText("Contenido"), "Texto pendiente");
    await user.click(screen.getByRole("button", { name: "Actualizar muro" }));
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Actualización pausada");
    await user.click(screen.getByRole("button", { name: "Ocultar editor" }));
    await user.click(screen.getByRole("button", { name: "Actualizar muro" }));
    expect(mock.refresh).toHaveBeenCalledTimes(1);
    view.rerender(<WallSession><WallRefresh /><AnnouncementComposer groupId="group" /></WallSession>);
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Borrador conservado");
    expect((screen.getByLabelText("Contenido") as HTMLTextAreaElement).value).toBe("Texto pendiente");
  });
  it("conserva el éxito de publicación tras ocultar el editor y devuelve el foco", async () => {
    const user = userEvent.setup(); render(<AnnouncementComposer groupId="group" />);
    await user.click(screen.getByRole("button", { name: "Publicar anuncio" }));
    await user.type(screen.getByLabelText("Título"), "Aviso"); await user.type(screen.getByLabelText("Contenido"), "Texto");
    await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Publicar anuncio" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("Anuncio publicado.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Publicar anuncio" }));
  });
  it("conserva el éxito de edición después de cerrar el formulario", async () => {
    const user = userEvent.setup(); render(<AnnouncementManagement groupId="group" announcement={item} />);
    await user.click(screen.getByRole("button", { name: "Editar anuncio" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("Anuncio actualizado.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar anuncio" }));
  });
  it("mantiene el borrador y la versión original cuando otro administrador lo modifica", async () => {
    const user = userEvent.setup();
    mock.update.mockResolvedValue({ error: { code: "announcement_changed", message: "Otro administrador cambió este anuncio." } });
    const view = render(<AnnouncementManagement groupId="group" announcement={item} />);
    await user.click(screen.getByRole("button", { name: "Editar anuncio" }));
    await user.clear(screen.getByLabelText("Título")); await user.type(screen.getByLabelText("Título"), "Mi borrador");
    view.rerender(<AnnouncementManagement groupId="group" announcement={{ ...item, title: "Cambio ajeno", updated_at: "2026-10-03T11:00:00Z" }} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Otro administrador");
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Mi borrador");
    expect(mock.update).toHaveBeenCalledWith("group", item.id, item.updated_at, { title: "Mi borrador", body: item.body });
    expect(mock.refresh).not.toHaveBeenCalled();
  });
  it("confirmación enfoca cancelar, permite Escape y devuelve el foco", async () => {
    const user = userEvent.setup(); render(<AnnouncementManagement groupId="group" announcement={item} />);
    const trigger = screen.getByRole("button", { name: "Eliminar anuncio" });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Confirmar eliminación" })).toBeNull();
    expect(document.activeElement).toBe(trigger); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("conserva el éxito de eliminación cuando desaparece la tarjeta", async () => {
    const user = userEvent.setup(); const view = render(<WallSession><AnnouncementManagement groupId="group" announcement={item} /></WallSession>);
    await user.click(screen.getByRole("button", { name: "Eliminar anuncio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    await screen.findByRole("status");
    view.rerender(<WallSession><p>Muro vacío</p></WallSession>);
    expect(screen.getByRole("status").textContent).toBe("Anuncio eliminado.");
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });
  it("vuelve a anunciar y enfocar el éxito al eliminar otro anuncio", async () => {
    const user = userEvent.setup(); const view = render(<WallSession><AnnouncementManagement key="first" groupId="group" announcement={item} /></WallSession>);
    await user.click(screen.getByRole("button", { name: "Eliminar anuncio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    const firstMessage = await screen.findByRole("status");
    view.rerender(<WallSession><AnnouncementManagement key="second" groupId="group" announcement={{ ...item, id: "second" }} /></WallSession>);
    await user.click(screen.getByRole("button", { name: "Eliminar anuncio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    await waitFor(() => expect(screen.getByRole("status")).not.toBe(firstMessage));
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });
  it("no elimina ni cierra la confirmación ante un conflicto de versión", async () => {
    const user = userEvent.setup(); mock.remove.mockResolvedValue({ error: { message: "Otro administrador cambió este anuncio." } });
    render(<WallSession><WallRefresh /><AnnouncementManagement groupId="group" announcement={item} /></WallSession>);
    await user.click(screen.getByRole("button", { name: "Eliminar anuncio" }));
    await user.click(screen.getByRole("button", { name: "Actualizar muro" }));
    expect(mock.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Otro administrador");
    expect(screen.getByRole("group", { name: "Confirmar eliminación" })).toBeTruthy();
  });
});

describe("refresco durante la lectura", () => {
  it("refresca cada 30 segundos y al recuperar foco solo si la página está visible", () => {
    vi.useFakeTimers(); const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = render(<WallSession><WallRefresh /></WallSession>);
    act(() => { vi.advanceTimersByTime(30_000); }); expect(mock.refresh).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("hidden");
    act(() => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event("focus")); }); expect(mock.refresh).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible"); act(() => { window.dispatchEvent(new Event("focus")); }); expect(mock.refresh).toHaveBeenCalledTimes(2);
    view.unmount(); act(() => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event("focus")); }); expect(mock.refresh).toHaveBeenCalledTimes(2);
  });
  it("pausa también el refresco automático mientras se redacta", () => {
    vi.useFakeTimers(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<WallSession><AnnouncementForm groupId="group" /></WallSession>);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mi borrador" } });
    const input = screen.getByLabelText("Título"); input.focus();
    act(() => { vi.advanceTimersByTime(90_000); window.dispatchEvent(new Event("focus")); });
    expect(mock.refresh).not.toHaveBeenCalled(); expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Mi borrador");
  });
  it("mantiene el foco del botón mientras espera el refresco y evita duplicarlo", async () => {
    let complete!: () => void;
    mock.refresh.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    const user = userEvent.setup(); render(<WallSession><WallRefresh /></WallSession>);
    const trigger = screen.getByRole("button", { name: "Actualizar muro" });
    await user.click(trigger);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger); expect(mock.refresh).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    expect(document.activeElement).toBe(trigger);
  });
  it("compensa contenido insertado antes del anuncio visible sin robar el foco", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<WallSession><WallRefresh /><article id="visible" data-announcement>Estoy leyendo</article></WallSession>);
    const article = screen.getByRole("article");
    const rect = vi.spyOn(article, "getBoundingClientRect").mockReturnValue({ top: 20, bottom: 300 } as DOMRect);
    mock.refresh.mockImplementation(() => rect.mockReturnValue({ top: 170, bottom: 450 } as DOMRect));
    const trigger = screen.getByRole("button", { name: "Actualizar muro" }); trigger.focus(); fireEvent.click(trigger);
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 150, behavior: "instant" }); expect(document.activeElement).toBe(trigger);
  });
});

describe("avisos globales", () => {
  it("sin dispositivos permite guardar opt-in futuro sin prometer avisos de navegador", async () => {
    const user = userEvent.setup(); render(<AnnouncementPushPreference enabled={false} hasDevices={false} />);
    expect(screen.getByText("Avisos de todos mis grupos").closest("details")?.open).toBe(false);
    await user.click(screen.getByText("Avisos de todos mis grupos"));
    expect(screen.getByText(/aplicación móvil.*pendiente/).textContent).toContain("Este navegador no recibe");
    await user.click(screen.getByRole("checkbox"));
    expect(mock.preference).toHaveBeenCalledWith(true);
    expect((await screen.findByRole("status")).textContent).toContain("todos tus grupos");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
  it("mantiene la preferencia ante error y permite desactivar sin dispositivos", async () => {
    const user = userEvent.setup(); mock.preference.mockResolvedValueOnce({ error: { message: "No pudimos guardar tu preferencia." } });
    render(<AnnouncementPushPreference enabled={true} hasDevices={false} />);
    await user.click(screen.getByText("Avisos de todos mis grupos"));
    await user.click(screen.getByRole("checkbox"));
    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos guardar");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    expect(mock.preference).toHaveBeenLastCalledWith(false);
    expect((await screen.findByRole("status")).textContent).toContain("deshabilitados");
  });
});
