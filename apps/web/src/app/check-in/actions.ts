"use server";

import { revalidatePath } from "next/cache";
import { CHECKIN_ERROR_MESSAGES, checkinInputSchema, checkinQrSchema, checkinResultSchema, qrCheckinSettingsSchema,
  type CheckinQr, type CheckinReceipt, type QrCheckinSettings } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

type Failure = { error: { code: string; message: string; details: Record<string, never> } };
function failure(code: string): Failure {
  const safe = Object.hasOwn(CHECKIN_ERROR_MESSAGES, code) ? code : "checkin_failed";
  return { error: { code: safe, message: CHECKIN_ERROR_MESSAGES[safe]!, details: {} } };
}

export async function loadQrSettings(groupId: string): Promise<Failure | { settings: QrCheckinSettings }> {
  if (!isGroupId(groupId)) return failure("group_not_found");
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return failure("authentication_required");
  const { data, error } = await client.rpc("get_qr_checkin_settings", { p_group_id: groupId });
  if (error) return failure(error.message);
  const parsed = qrCheckinSettingsSchema.safeParse(data);
  return parsed.success ? { settings: parsed.data } : failure("checkin_failed");
}

export async function saveQrSettings(groupId: string, input: unknown): Promise<Failure | { settings: QrCheckinSettings }> {
  if (!isGroupId(groupId)) return failure("group_not_found");
  const parsed = qrCheckinSettingsSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_qr_settings");
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return failure("authentication_required");
  const { data, error } = await client.rpc("set_qr_checkin_settings", { p_group_id: groupId, p_settings: parsed.data });
  if (error) return failure(error.message);
  const saved = qrCheckinSettingsSchema.safeParse(data);
  return saved.success ? { settings: saved.data } : failure("checkin_failed");
}

export async function issueCheckinQr(activityId: string): Promise<Failure | { qr: CheckinQr }> {
  if (!isGroupId(activityId)) return failure("activity_not_found");
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return failure("authentication_required");
  const { data, error } = await client.rpc("issue_activity_checkin_qr", { p_activity_id: activityId });
  if (error) return failure(error.message);
  const parsed = checkinQrSchema.safeParse(data);
  return parsed.success ? { qr: parsed.data } : failure("checkin_failed");
}

export async function redeemCheckin(input: unknown): Promise<Failure | { receipt: CheckinReceipt }> {
  const parsed = checkinInputSchema.safeParse(input);
  if (!parsed.success) return failure("checkin_qr_expired");
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return failure("authentication_required");
  const { data, error } = await client.rpc("self_checkin", { p_activity_id: parsed.data.activity_id, p_token: parsed.data.token });
  if (error) return failure(error.message);
  const saved = checkinResultSchema.safeParse(data);
  if (!saved.success) return failure("checkin_failed");
  revalidatePath(`/groups/${saved.data.group_id}/activities/${saved.data.activity_id}/attendance`);
  revalidatePath(`/groups/${saved.data.group_id}/me/history`);
  return { receipt: saved.data };
}
