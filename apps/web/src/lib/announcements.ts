import { createServerApiClient } from "@/lib/api/server";
import { getGroup } from "@/lib/groups";
import { ApiClientError } from "@asisteam/api-client";
import { announcementPageSchema } from "@asisteam/core";
import { notFound } from "next/navigation";
export async function getAnnouncements(groupId: string, rawPage?: string | string[]) {
    const page = announcementPageSchema.safeParse(rawPage ?? 1);
    if (!page.success || Array.isArray(rawPage))
        notFound();
    const group = await getGroup(groupId);
    {
        try {
            return { group, ...await createServerApiClient().getAnnouncements({ params: { groupId: group.id }, query: { page: page.data } }) };
        }
        catch (error) {
            if (error instanceof ApiClientError && [403, 404].includes(error.status))
                notFound();
            throw error;
        }
    }
}
