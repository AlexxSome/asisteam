import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/announcements", () => ({ getAnnouncements: mock.load }));
vi.mock("./announcement-form", () => ({ AnnouncementComposer: () => <span>boton-publicar</span>, AnnouncementManagement: () => <span>gestionar-anuncio</span> }));
vi.mock("./wall-controls", () => ({ WallSession: ({ children }: { children: ReactNode }) => <>{children}</>, WallRefresh: () => <span>actualizar</span>, AnnouncementPushPreference: () => <span>preferencias</span> }));
import AnnouncementsPage, { dynamic } from "./page";
const item = { id: "announcement", group_id: "group", title: "<script>alert(1)</script>", body: "<img src=x onerror=alert(1)>\nTexto", created_at: "2026-07-01T23:00:00Z", updated_at: "2026-07-01T23:00:00Z", total_count: 51 };
beforeEach(() => mock.load.mockResolvedValue({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [item], page: 1, pushEnabled: false, hasDevices: false }));
const renderPage = async () => renderToStaticMarkup(await AnnouncementsPage({ params: Promise.resolve({ groupId: "group" }), searchParams: Promise.resolve({}) }));
describe("muro de anuncios", () => {
  it("renderiza texto escapado, hora chilena y paginación sin gestión para ATHLETE", async () => {
    const html = await renderPage();
    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x");
    expect(html).toContain("19:00"); expect(html).toContain("?page=2");
    expect(html).not.toContain("boton-publicar"); expect(html).not.toContain("gestionar-anuncio");
  });
  it.each(["GUARDIAN", "COACH"])("%s lee sin gestión", async (role) => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: [role] }, announcements: [item], page: 1, pushEnabled: false, hasDevices: false });
    expect(await renderPage()).not.toContain("gestionar-anuncio");
  });
  it("ADMIN puede publicar y gestionar aunque sea multirol", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE", "ADMIN"] }, announcements: [item], page: 1, pushEnabled: false, hasDevices: false });
    const html = await renderPage(); expect(html).toContain("boton-publicar"); expect(html).toContain("gestionar-anuncio");
  });
  it("muestra vacío y propaga denegación sin filtrar datos", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [], page: 1, pushEnabled: false, hasDevices: false });
    expect(await renderPage()).toContain("Todavía no hay anuncios");
    mock.load.mockRejectedValueOnce(new Error("404")); await expect(renderPage()).rejects.toThrow("404");
  });
});


describe("lectura primero y límites del muro", () => {
  it("ubica los avisos después del muro y hace legibles autoría y edición", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ADMIN"] }, announcements: [{ ...item, updated_at: "2026-07-02T00:00:00Z" }], page: 1, pushEnabled: false, hasDevices: false });
    const html = await renderPage();
    expect(html.indexOf("Muro de anuncios")).toBeLessThan(html.indexOf("preferencias"));
    expect(html).toContain("Administración del grupo");
    expect(html).toContain("Publicado"); expect(html).toContain("Editado");
    expect(html).not.toContain("<form");
  });
  it("conserva completos títulos largos y cuerpos de 5000 caracteres", async () => {
    const long = { ...item, title: "A".repeat(120), body: "Texto extenso.\n".repeat(400).slice(0, 5000), total_count: 1 };
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [long], page: 1, pushEnabled: false, hasDevices: false });
    const html = await renderPage();
    expect(html).toContain(long.title); expect(html).toContain(long.body);
    expect(html).toContain("Llegaste al final del muro."); expect(html).not.toContain("Siguiente");
  });
  it("última página muestra anterior y ofrece salida de una página vacía", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [item], page: 2, pushEnabled: false, hasDevices: false });
    const html = await renderPage();
    expect(html).toContain("Anterior"); expect(html).not.toContain("Siguiente"); expect(html).toContain("Página 2");
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [], page: 3, pushEnabled: false, hasDevices: false });
    expect(await renderPage()).toContain("Volver al inicio del muro");
  });
});
