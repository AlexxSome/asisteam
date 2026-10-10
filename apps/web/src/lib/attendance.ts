import { getActivity } from "@/lib/activities";
import { createServerApiClient } from "@/lib/api/server";
import { getGroup } from "@/lib/groups";
import { ApiClientError } from "@asisteam/api-client";
import { canManageAttendance,type AttendanceRosterRow } from "@asisteam/core";
import { notFound } from "next/navigation";
export async function getAttendance(groupId: string, activityId: string) {
    const group = await getGroup(groupId);
    // El middleware entrega HTTP403 antes del streaming. Esta comprobación
    // mantiene la defensa al reutilizar el loader fuera de esa ruta.
    if (!canManageAttendance(group.roles))
        notFound();
    const activity = await getActivity(groupId, activityId);
    {
        try {
            const client = createServerApiClient();
            const roster: AttendanceRosterRow[] = [];
            let canEditNotes = false;
            for (let page = 1;; page++) {
                const result = await client.getAttendanceRoster({ params: { groupId, activityId }, query: { page } });
                roster.push(...result.roster);
                canEditNotes = result.canEditNotes;
                if (!result.hasNext)
                    break;
            }
            return { activity, roster, canEditNotes };
        }
        catch (error) {
            if (error instanceof ApiClientError && [403, 404].includes(error.status))
                notFound();
            throw error;
        }
    }
}
