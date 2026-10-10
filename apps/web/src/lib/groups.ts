import { createServerApiClient } from "@/lib/api/server";
import { activeGroupCookie,isGroupId } from "@/lib/group-routing";
import { memberOperation } from "@/lib/members";
import { createSessionClient } from "@/lib/api/session";
import { ApiClientError } from "@asisteam/api-client";
import { groupCapacitySchema,type MembershipRole } from "@asisteam/core";
import { cookies } from "next/headers";
import { notFound,redirect } from "next/navigation";
import { cache } from "react";
export type MyGroup = {
    id: string;
    name: string;
    sport: string | null;
    logo_url: string | null;
    roles: MembershipRole[];
};
export const getMyGroups = cache(async () => {
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user)
        redirect("/login");
    {
        try {
            const result = await createServerApiClient().listMyGroups({ query: { page: 1, page_size: 100 } });
            return { userId: user.id, groups: result.data as MyGroup[] };
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 401)
                redirect("/login");
            throw new Error("No pudimos cargar tus grupos. Vuelve a intentarlo.", { cause: error });
        }
    }
});
export const getGroup = cache(async (groupId: string) => {
    if (!isGroupId(groupId))
        notFound();
    const { groups } = await getMyGroups();
    const membership = groups.find((group) => group.id === groupId.toLowerCase());
    if (!membership)
        notFound();
    {
        try {
            const data = await createServerApiClient().getGroup({ params: { groupId } });
            return { invite_code: null, settings: null, settings_updated_at: null, settings_updated_by_name: null, ...data, roles: [...data.roles] };
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 404)
                notFound();
            if (error instanceof ApiClientError && error.status === 401)
                redirect("/login");
            throw new Error("No pudimos cargar el grupo. Vuelve a intentarlo.", { cause: error });
        }
    }
});
// Request-scoped only. Never infer capacity from checkout parameters or status.
export const getGroupCapacity = cache(async (groupId: string) => {
    const group = await getGroup(groupId);
    if (!group.roles.includes("ADMIN"))
        return null;
    try {
        {
            const data = await createServerApiClient().getGroupBilling({ params: { groupId: group.id }, query: { page: 1 } });
            const parsed = groupCapacitySchema.safeParse(data);
            return parsed.success ? parsed.data : null;
        }
    }
    catch {
        return null;
    }
});
export async function groupHomePath() {
    const { userId, groups } = await getMyGroups();
    if (!groups.length)
        return "/welcome";
    const saved = (await cookies()).get(activeGroupCookie(userId))?.value;
    const group = groups.find((item) => item.id === saved);
    if (group)
        return `/groups/${group.id}`;
    if (groups.length === 1)
        return `/groups/${groups[0]!.id}`;
    return "/groups";
}
/** A pending athlete sees only their request, never the group's private detail. */
export const getMyPendingMemberships = cache(async () => {

    const { data, error } = await memberOperation(async (api) => (await api.listMembershipOnboarding()).data);
    if (error)
        throw new Error("No pudimos cargar tus solicitudes pendientes. Vuelve a intentarlo.");
    return data ?? [];
});
