"use server";
import { isGroupId } from "@/lib/group-routing";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { GUARDIANSHIP_ERROR_MESSAGES,guardianshipIdSchema,guardianshipSchema } from "@asisteam/core";
import { revalidatePath } from "next/cache";
import { sendInvitation } from "../invitations/new/actions";
export type CreateGuardianshipResult = {
    guardianshipId: string;
    invitation: "sent" | "retry_required";
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
const fail = (code: string): CreateGuardianshipResult => ({ error: {
        code, message: GUARDIANSHIP_ERROR_MESSAGES[code] ?? GUARDIANSHIP_ERROR_MESSAGES.unavailable!, details: {},
    } });
export async function createGuardianship(groupId: string, input: unknown): Promise<CreateGuardianshipResult> {
    if (!isGroupId(groupId))
        return fail("group_not_found");
    const parsed = guardianshipSchema.safeParse(input);
    if (!parsed.success)
        return { error: { code: "invalid_guardianship", message: GUARDIANSHIP_ERROR_MESSAGES.invalid_guardianship!, details: parsed.error.flatten().fieldErrors } };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return fail("authentication_required");
    try {
        const { data, error } = await memberOperation(async (api) => (await api.createGuardianship({ params: { groupId }, body: parsed.data })).guardianship_id);
        if (error)
            return fail(Object.hasOwn(GUARDIANSHIP_ERROR_MESSAGES, error.message) ? error.message : "unavailable");
        const id = guardianshipIdSchema.safeParse(data);
        if (!id.success)
            return fail("unavailable");
        // El vínculo ya se confirmó: un fallo del email no debe repetir el registro.
        let invitation: "sent" | "retry_required" = "retry_required";
        try {
            const result = await sendInvitation({ action: "send", group_id: groupId, email: parsed.data.email, role: "GUARDIAN" });
            if (!("error" in result))
                invitation = "sent";
        }
        catch { /* La pantalla ofrece recuperar el envío desde Invitaciones. */ }
        revalidatePath(`/groups/${groupId}`, "layout");
        return { guardianshipId: id.data, invitation };
    }
    catch {
        return fail("unavailable");
    }
}
