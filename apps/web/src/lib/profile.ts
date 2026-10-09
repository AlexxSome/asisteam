import { createServerApiClient } from "@/lib/api/server";
import "server-only";
export async function getProfilePageData(authUserId: string) {
    {
        const client = createServerApiClient();
        const [profile, context] = await Promise.all([client.getOwnProfile(), client.getProfileContext()]);
        return { profile, allowed: context.avatar_allowed, request: context.birthdate_request, hasAdminRole: context.has_admin_role, avatarPermissions: context.avatar_permissions };
    }
}
