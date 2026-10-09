// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
"use server";

import { revalidatePath } from "next/cache";
import { ANNOUNCEMENT_ERROR_MESSAGES, announcementSchema, announcementIdSchema, announcementVersionSchema } from "@asisteam/core";
import { createClient } from "@legacy/lib/supabase/server";
import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";
async function nestAction(action: () => Promise<unknown>, path: string): Promise<AnnouncementResult> {
  try { await action(); revalidatePath(path, path === "/groups" ? "layout" : "page"); return { success: true }; }
  catch (error) { return failure(error instanceof ApiClientError ? error.error.code : "announcement_save_failed"); }
}

export type AnnouncementResult = { success: true } | { error: { code: string; message: string; details: Record<string, string[] | undefined> } };
function failure(code: string, details: Record<string, string[] | undefined> = {}): AnnouncementResult {
  const safeCode = Object.hasOwn(ANNOUNCEMENT_ERROR_MESSAGES, code) ? code : "announcement_save_failed";
  return { error: { code: safeCode, message: ANNOUNCEMENT_ERROR_MESSAGES[safeCode]!, details } };
}

export async function publishAnnouncement(groupId: string, requestId: string, input: unknown): Promise<AnnouncementResult> {
  if (!announcementIdSchema.safeParse(groupId).success) return failure("group_not_found");
  if (!announcementIdSchema.safeParse(requestId).success) return failure("invalid_announcement");
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_announcement", parsed.error.flatten().fieldErrors);
  if (moduleTransport("announcements") === "nest") return nestAction(() => createServerApiClient().publishAnnouncement({ params: { groupId }, body: { ...parsed.data, request_id: requestId } }), `/groups/${groupId}/announcements`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_group_announcement", {
    p_group_id: groupId, p_request_id: requestId, p_title: parsed.data.title, p_body: parsed.data.body,
  });
  if (error) return failure(error.message);
  revalidatePath(`/groups/${groupId}/announcements`);
  return { success: true };
}

export async function updateAnnouncement(groupId: string, announcementId: string, updatedAt: string, input: unknown): Promise<AnnouncementResult> {
  if (!announcementIdSchema.safeParse(groupId).success) return failure("group_not_found");
  if (!announcementIdSchema.safeParse(announcementId).success) return failure("announcement_not_found");
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_announcement", parsed.error.flatten().fieldErrors);
  if (!announcementVersionSchema.safeParse(updatedAt).success) return failure("announcement_changed");
  if (moduleTransport("announcements") === "nest") return nestAction(() => createServerApiClient().updateAnnouncement({ params: { groupId, announcementId }, body: { ...parsed.data, updated_at: updatedAt } }), `/groups/${groupId}/announcements`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_group_announcement", {
    p_group_id: groupId, p_announcement_id: announcementId, p_updated_at: updatedAt, p_title: parsed.data.title, p_body: parsed.data.body,
  });
  if (error) return failure(error.message);
  revalidatePath(`/groups/${groupId}/announcements`);
  return { success: true };
}

export async function deleteAnnouncement(groupId: string, announcementId: string, updatedAt: string): Promise<AnnouncementResult> {
  if (!announcementIdSchema.safeParse(groupId).success) return failure("group_not_found");
  if (!announcementIdSchema.safeParse(announcementId).success) return failure("announcement_not_found");
  if (!announcementVersionSchema.safeParse(updatedAt).success) return failure("announcement_changed");
  if (moduleTransport("announcements") === "nest") return nestAction(() => createServerApiClient().deleteAnnouncement({ params: { groupId, announcementId }, body: { updated_at: updatedAt } }), `/groups/${groupId}/announcements`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_group_announcement", {
    p_group_id: groupId, p_announcement_id: announcementId, p_updated_at: updatedAt,
  });
  if (error) return failure(error.message);
  revalidatePath(`/groups/${groupId}/announcements`);
  return { success: true };
}

export async function setAnnouncementPush(enabled: unknown): Promise<AnnouncementResult> {
  if (typeof enabled !== "boolean") return failure("invalid_push_preference");
  if (moduleTransport("announcements") === "nest") return nestAction(() => createServerApiClient().setAnnouncementPush({ body: { enabled } }), "/groups");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_announcement_push_enabled", { p_enabled: enabled });
  if (error) return failure(error.message);
  revalidatePath("/groups", "layout");
  return { success: true };
}
