import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { getGroup } from "@/lib/groups";
import { memberOperation } from "@/lib/members";
import { createSessionClient } from "@/lib/api/session";
import { ApiClientError } from "@asisteam/api-client";
import type { PersistenceSchema } from "@asisteam/db";
import { notFound,redirect } from "next/navigation";
import { cache } from "react";
type WardRow = PersistenceSchema["public"]["Views"]["v_my_wards"]["Row"];
type WardGroupRow = PersistenceSchema["public"]["Views"]["v_my_ward_groups"]["Row"];
export type Ward = WardRow & {
    athlete_user_id: string;
    full_name: string;
    groups: WardGroupRow[];
};
const loadError = () => new Error("No pudimos cargar tus pupilos. Vuelve a intentarlo.");
export function parseWardsPage(value: string | string[] | undefined) {
    const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
    return Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1;
}
export async function getMyWards(page = 1, pageSize = 50) {
    const client = await createSessionClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user)
        redirect("/login");
    {
        try {
            // The API pages 50 rows. Home summaries deliberately render ten.
            const offset = (page - 1) * pageSize;
            const apiPage = Math.floor(offset / 50) + 1;
            const start = offset % 50;
            const result = await createServerApiClient().listMyWards({ query: { page: apiPage } });
            return { wards: result.data.slice(start, start + pageSize), hasNext: result.has_next || result.data.length > start + pageSize };
        } catch { throw loadError(); }
    }
}
export async function getGroupWards(groupId: string, page = 1) {
    if (!isGroupId(groupId))
        notFound();
    const client = await createSessionClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user)
        redirect("/login");
    {
        try {
            const result = await createServerApiClient().listMyWards({ query: { page, group_id: groupId } });
            return { wards: result.data.map(ward => ({ athlete_user_id: ward.athlete_user_id, full_name: ward.full_name })), hasNext: result.has_next };
        } catch { throw loadError(); }
    }
}
export async function getWard(athleteUserId: string) {
    if (!isGroupId(athleteUserId))
        notFound();
    const client = await createSessionClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user)
        notFound();
    {
        try {
            return await createServerApiClient().getWard({ params: { athleteUserId } });
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 404)
                notFound();
            throw loadError();
        }
    }
}
export const getGuardianOnboarding = cache(async (groupId: string, athleteUserId?: string, page = 1) => {
    const group = await getGroup(groupId);
    if (!group.roles.includes("GUARDIAN"))
        notFound();
    if (athleteUserId !== undefined && !isGroupId(athleteUserId))
        notFound();

    const { data, error } = await memberOperation(async (api) => (await api.listMembershipOnboarding({ query: { group_id: group.id, as_guardian: true, athlete_user_id: athleteUserId, page } })).data).catch(() => ({ data: null, error: { code: "unavailable", message: "unavailable" } }));
    if (error)
        throw new Error("No pudimos cargar los consentimientos. Vuelve a intentarlo.");
    return data ?? [];
});
export const getGuardianTasks = cache(async (groupId: string, athleteUserId?: string) => {
    const memberships = await getGuardianOnboarding(groupId, athleteUserId);
    let consents = memberships.filter(member => member.can_consent).length;
    // Preserve every actionable pending request, including code enrollments.
    for (let offset = 50; offset < (memberships[0]?.total_count ?? 0); offset += 50) {
        const rows = await getGuardianOnboarding(groupId, athleteUserId, offset / 50 + 1);
        consents += rows.filter(member => member.can_consent).length;
    }
    const activations = await createServerApiClient().listManagedActivations({ params: { groupId }, query: { page: 1, athlete_user_id: athleteUserId } });
    return { consents, activations: activations.data[0]?.total_count ?? 0, memberships };
});
