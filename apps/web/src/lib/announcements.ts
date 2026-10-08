import { notFound } from "next/navigation";
import { announcementPageSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/groups";
import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";

export async function getAnnouncements(groupId: string, rawPage?: string | string[]) {
  const page = announcementPageSchema.safeParse(rawPage ?? 1);
  if (!page.success || Array.isArray(rawPage)) notFound();
  const group = await getGroup(groupId);
  if (moduleTransport("announcements") === "nest") {
    try { return { group, ...await createServerApiClient().getAnnouncements({ params: { groupId: group.id }, query: { page: page.data } }) }; }
    catch (error) { if (error instanceof ApiClientError && [403,404].includes(error.status)) notFound(); throw error; }
  }
  const supabase = await createClient();
  const [wall, preference, devices] = await Promise.all([
    supabase.rpc("list_group_announcements", { p_group_id: group.id, p_page: page.data }),
    supabase.from("announcement_push_preferences").select("enabled").maybeSingle(),
    supabase.from("push_tokens").select("id").eq("is_active", true),
  ]);
  if (wall.error?.code === "PT404") notFound();
  if (wall.error || preference.error || devices.error) throw new Error("No pudimos cargar los anuncios. Vuelve a intentarlo.");
  return { group, announcements: wall.data ?? [], page: page.data,
    pushEnabled: preference.data?.enabled ?? false, hasDevices: !!devices.data?.length };
}
