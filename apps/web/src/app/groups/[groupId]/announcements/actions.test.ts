import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ operation: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({
  publishAnnouncement: (request:unknown)=>mock.operation("publishAnnouncement",request),
  updateAnnouncement: (request:unknown)=>mock.operation("updateAnnouncement",request),
  deleteAnnouncement: (request:unknown)=>mock.operation("deleteAnnouncement",request),
  setAnnouncementPush: (request:unknown)=>mock.operation("setAnnouncementPush",request),
}) }));
import { deleteAnnouncement, publishAnnouncement, setAnnouncementPush, updateAnnouncement } from "@/app/groups/[groupId]/announcements/actions";
const group = "57000000-0000-4000-8000-000000000201";
const id = "57000000-0000-4000-8000-000000000301";
const version = "2026-10-03T14:00:00.123456+00:00";
const input = { title: " Aviso ", body: " Texto " };
beforeEach(() => { vi.resetAllMocks(); mock.operation.mockResolvedValue({ success:true }); });
describe("acciones de anuncios", () => {
  it("publica por RPC con ID idempotente y refresca ruta del grupo", async () => {
    expect(await publishAnnouncement(group, id, input)).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("publishAnnouncement",{ params:{groupId:group},body:{request_id:id,title:"Aviso",body:"Texto"} });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/announcements`,"page");
  });
  it("edición y eliminación conservan versión completa y scoping", async () => {
    expect(await updateAnnouncement(group, id, version, input)).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("updateAnnouncement",{ params:{groupId:group,announcementId:id},body:{updated_at:version,title:"Aviso",body:"Texto"} });
    expect(await deleteAnnouncement(group, id, version)).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("deleteAnnouncement",{ params:{groupId:group,announcementId:id},body:{updated_at:version} });
  });
  it("rechaza entradas antes de escribir", async () => {
    for (const result of [await publishAnnouncement("bad", id, input), await publishAnnouncement(group, id, { title: " ", body: "texto" }),
      await updateAnnouncement(group, id, "ayer", input), await deleteAnnouncement(group, "", version), await setAnnouncementPush("true")]) {
      expect(result).toHaveProperty("error");
    }
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it.each(["authentication_required", "admin_required", "group_not_found", "announcement_changed", "announcement_not_found"])("conserva rechazo SQL %s", async (message) => {
    mock.operation.mockRejectedValue(new ApiClientError(422,message));
    expect(await publishAnnouncement(group, id, input)).toMatchObject({ error: { code: message } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta errores desconocidos y permite deshabilitar push", async () => {
    mock.operation.mockRejectedValueOnce(new ApiClientError(500,"private email"));
    expect(await publishAnnouncement(group, id, input)).toMatchObject({ error: { code: "announcement_save_failed" } });
    expect(await setAnnouncementPush(false)).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("setAnnouncementPush",{ body:{enabled:false} });
  });
});
