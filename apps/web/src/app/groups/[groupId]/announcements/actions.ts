"use server";

import { revalidatePath } from "next/cache";
import { ANNOUNCEMENT_ERROR_MESSAGES, announcementSchema, announcementIdSchema, announcementVersionSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_announcement_push_enabled", { p_enabled: enabled });
  if (error) return failure(error.message);
  revalidatePath("/groups", "layout");
  return { success: true };
}
