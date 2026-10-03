import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
import { deleteAnnouncement, publishAnnouncement, setAnnouncementPush, updateAnnouncement } from "./actions";
const group = "57000000-0000-4000-8000-000000000201";
const id = "57000000-0000-4000-8000-000000000301";
const version = "2026-10-03T14:00:00.123456+00:00";
const input = { title: " Aviso ", body: " Texto " };
beforeEach(() => { vi.resetAllMocks(); mock.rpc.mockResolvedValue({ data: id, error: null }); });
describe("acciones de anuncios", () => {
  it("publica por RPC con ID idempotente y refresca ruta del grupo", async () => {
    expect(await publishAnnouncement(group, id, input)).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("publish_group_announcement", { p_group_id: group, p_request_id: id, p_title: "Aviso", p_body: "Texto" });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/announcements`);
  });
  it("edición y eliminación conservan versión completa y scoping", async () => {
    expect(await updateAnnouncement(group, id, version, input)).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("update_group_announcement", { p_group_id: group, p_announcement_id: id, p_updated_at: version, p_title: "Aviso", p_body: "Texto" });
    expect(await deleteAnnouncement(group, id, version)).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("delete_group_announcement", { p_group_id: group, p_announcement_id: id, p_updated_at: version });
  });
  it("rechaza entradas antes de escribir", async () => {
    for (const result of [await publishAnnouncement("bad", id, input), await publishAnnouncement(group, id, { title: " ", body: "texto" }),
      await updateAnnouncement(group, id, "ayer", input), await deleteAnnouncement(group, "", version), await setAnnouncementPush("true")]) {
      expect(result).toHaveProperty("error");
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["authentication_required", "admin_required", "group_not_found", "announcement_changed", "announcement_not_found"])("conserva rechazo SQL %s", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await publishAnnouncement(group, id, input)).toMatchObject({ error: { code: message } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta errores desconocidos y permite deshabilitar push", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "private email" } });
    expect(await publishAnnouncement(group, id, input)).toMatchObject({ error: { code: "announcement_save_failed" } });
    expect(await setAnnouncementPush(false)).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("set_announcement_push_enabled", { p_enabled: false });
  });
});
