"use server";

import { revalidatePath } from "next/cache";
import { MANAGED_MEMBER_ERROR_MESSAGES, managedMemberSchema, managedMemberResultSchema, type ManagedMemberResult } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";
import { sendInvitation } from "../../invitations/new/actions";

export type CreateManagedMemberResult = { member: ManagedMemberResult; guardianInvitation?: "sent" | "retry_required" } | { error: { code: string; message: string; details: Record<string, string[] | undefined> } };
const fail = (code: string): CreateManagedMemberResult => ({ error: {
  code, message: MANAGED_MEMBER_ERROR_MESSAGES[code] ?? MANAGED_MEMBER_ERROR_MESSAGES.unavailable!, details: {},
} });

export async function createManagedMember(groupId: string, input: unknown): Promise<CreateManagedMemberResult> {
  if (!isGroupId(groupId)) return fail("group_not_found");
  const parsed = managedMemberSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "invalid_managed_member", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("authentication_required");
  try {
    const { data, error } = await supabase.rpc("create_managed_member", {
      p_group_id: groupId, p_full_name: parsed.data.full_name,
      p_birthdate: parsed.data.birthdate, p_email: parsed.data.email || undefined,
      p_guardian: parsed.data.guardian,
    });
    if (error) return fail(Object.hasOwn(MANAGED_MEMBER_ERROR_MESSAGES, error.message) ? error.message : "unavailable");
    const member = managedMemberResultSchema.safeParse(data);
    if (!member.success) return fail("unavailable");
    let guardianInvitation: "sent" | "retry_required" | undefined;
    if (parsed.data.guardian) {
      // El alta ya quedó PENDING. Un fallo de entrega no debe sugerir repetirla.
      try {
        const invitation = await sendInvitation({ action: "send", group_id: groupId,
          email: parsed.data.guardian.email, role: "GUARDIAN" });
        guardianInvitation = "error" in invitation ? "retry_required" : "sent";
      } catch { guardianInvitation = "retry_required"; }
    }
    revalidatePath(`/groups/${groupId}`, "layout");
    return { member: member.data, ...(guardianInvitation ? { guardianInvitation } : {}) };
  } catch { return fail("unavailable"); }
}
