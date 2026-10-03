import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/announcements", () => ({ getAnnouncements: mock.load }));
vi.mock("./announcement-form", () => ({ AnnouncementForm: () => <span>form-publicar</span>, AnnouncementManagement: () => <span>gestionar-anuncio</span> }));
vi.mock("./wall-controls", () => ({ WallRefresh: () => <span>actualizar</span>, AnnouncementPushPreference: () => <span>preferencias</span> }));
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
    expect(html).not.toContain("form-publicar"); expect(html).not.toContain("gestionar-anuncio");
  });
  it.each(["GUARDIAN", "COACH"])("%s lee sin gestión", async (role) => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: [role] }, announcements: [item], page: 1, pushEnabled: false, hasDevices: false });
    expect(await renderPage()).not.toContain("gestionar-anuncio");
  });
  it("ADMIN puede publicar y gestionar aunque sea multirol", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE", "ADMIN"] }, announcements: [item], page: 1, pushEnabled: false, hasDevices: false });
    const html = await renderPage(); expect(html).toContain("form-publicar"); expect(html).toContain("gestionar-anuncio");
  });
  it("muestra vacío y propaga denegación sin filtrar datos", async () => {
    mock.load.mockResolvedValueOnce({ group: { id: "group", roles: ["ATHLETE"] }, announcements: [], page: 1, pushEnabled: false, hasDevices: false });
    expect(await renderPage()).toContain("Todavía no hay anuncios");
    mock.load.mockRejectedValueOnce(new Error("404")); await expect(renderPage()).rejects.toThrow("404");
  });
});
