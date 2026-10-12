
import { browserApi } from "./api";
import { ApiClientError } from "@asisteam/api-client";
import { ANNOUNCEMENT_ERROR_MESSAGES,announcementIdSchema,announcementSchema,announcementVersionSchema } from "@asisteam/core/browser";

async function nestAction(action: () => Promise<unknown>): Promise<AnnouncementResult> {
    try {
        await action();
        return { success: true };
    }
    catch (error) {
        if (!(error instanceof ApiClientError) || error.status >= 500) return {error:{code:"announcement_save_failed",message:"No pudimos confirmar el cambio. Actualiza el muro y comprueba su estado antes de reintentar.",details:{}}};
        return failure(error.error.code);
    }
}
export type AnnouncementResult = {
    success: true;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
function failure(code: string, details: Record<string, string[] | undefined> = {}): AnnouncementResult {
    const safeCode = Object.hasOwn(ANNOUNCEMENT_ERROR_MESSAGES, code) ? code : "announcement_save_failed";
    return { error: { code: safeCode, message: ANNOUNCEMENT_ERROR_MESSAGES[safeCode]!, details } };
}
export async function publishAnnouncement(groupId: string, requestId: string, input: unknown): Promise<AnnouncementResult> {
    if (!announcementIdSchema.safeParse(groupId).success)
        return failure("group_not_found");
    if (!announcementIdSchema.safeParse(requestId).success)
        return failure("invalid_announcement");
    const parsed = announcementSchema.safeParse(input);
    if (!parsed.success)
        return failure("invalid_announcement", parsed.error.flatten().fieldErrors);
    return nestAction(() => browserApi().publishAnnouncement({ params: { groupId }, body: { ...parsed.data, request_id: requestId } }));
}
export async function updateAnnouncement(groupId: string, announcementId: string, updatedAt: string, input: unknown): Promise<AnnouncementResult> {
    if (!announcementIdSchema.safeParse(groupId).success)
        return failure("group_not_found");
    if (!announcementIdSchema.safeParse(announcementId).success)
        return failure("announcement_not_found");
    const parsed = announcementSchema.safeParse(input);
    if (!parsed.success)
        return failure("invalid_announcement", parsed.error.flatten().fieldErrors);
    if (!announcementVersionSchema.safeParse(updatedAt).success)
        return failure("announcement_changed");
    return nestAction(() => browserApi().updateAnnouncement({ params: { groupId, announcementId }, body: { ...parsed.data, updated_at: updatedAt } }));
}
export async function deleteAnnouncement(groupId: string, announcementId: string, updatedAt: string): Promise<AnnouncementResult> {
    if (!announcementIdSchema.safeParse(groupId).success)
        return failure("group_not_found");
    if (!announcementIdSchema.safeParse(announcementId).success)
        return failure("announcement_not_found");
    if (!announcementVersionSchema.safeParse(updatedAt).success)
        return failure("announcement_changed");
    return nestAction(() => browserApi().deleteAnnouncement({ params: { groupId, announcementId }, body: { updated_at: updatedAt } }));
}
export async function setAnnouncementPush(enabled: unknown): Promise<AnnouncementResult> {
    if (typeof enabled !== "boolean")
        return failure("invalid_push_preference");
    return nestAction(() => browserApi().setAnnouncementPush({ body: { enabled } }));
}
