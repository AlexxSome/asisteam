"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { CHECKIN_ERROR_MESSAGES, checkinInputSchema, checkinQrSchema, checkinResultSchema, qrCheckinSettingsSchema,
  type CheckinQr, type CheckinReceipt, type QrCheckinSettings } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";
async function nestResult<S extends z.ZodTypeAny>(action: () => Promise<unknown>, schema: S) {
  try {
    const parsed = schema.safeParse(await action());
    return parsed.success ? { data: parsed.data as z.infer<S> } : failure("checkin_failed");
  } catch (error) { return failure(error instanceof ApiClientError ? error.error.code : "checkin_failed"); }
}

type Failure = { error: { code: string; message: string; details: Record<string, never> } };
function failure(code: string): Failure {
  const safe = Object.hasOwn(CHECKIN_ERROR_MESSAGES, code) ? code : "checkin_failed";
  return { error: { code: safe, message: CHECKIN_ERROR_MESSAGES[safe]!, details: {} } };
}

export async function loadQrSettings(groupId: string): Promise<Failure | { settings: QrCheckinSettings }> {
  if (!isGroupId(groupId)) return failure("group_not_found");
  if (moduleTransport("qr") === "nest") {
    const result = await nestResult(() => createServerApiClient().getQrSettings({ params: { groupId } }), qrCheckinSettingsSchema);
    return "error" in result ? result : { settings: result.data };
  }
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
  if (moduleTransport("qr") === "nest") {
    const result = await nestResult(() => createServerApiClient().setQrSettings({ params: { groupId }, body: parsed.data }), qrCheckinSettingsSchema);
    return "error" in result ? result : { settings: result.data };
  }
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return failure("authentication_required");
  const { data, error } = await client.rpc("set_qr_checkin_settings", { p_group_id: groupId, p_settings: parsed.data });
  if (error) return failure(error.message);
  const saved = qrCheckinSettingsSchema.safeParse(data);
  return saved.success ? { settings: saved.data } : failure("checkin_failed");
}

export async function issueCheckinQr(activityId: string): Promise<Failure | { qr: CheckinQr }> {
  if (!isGroupId(activityId)) return failure("activity_not_found");
  if (moduleTransport("qr") === "nest") {
    const result = await nestResult(() => createServerApiClient().issueCheckinQr({ params: { activityId } }), checkinQrSchema);
    return "error" in result ? result : { qr: result.data };
  }
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
  if (moduleTransport("qr") === "nest") {
    const result = await nestResult(() => createServerApiClient().selfCheckin({ body: parsed.data }), checkinResultSchema);
    if ("error" in result) return result;
    revalidatePath(`/groups/${result.data.group_id}/activities/${result.data.activity_id}/attendance`);
    revalidatePath(`/groups/${result.data.group_id}/me/history`);
    return { receipt: result.data };
  }
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
