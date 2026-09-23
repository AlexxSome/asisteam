import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { activeGroupCookie, isGroupId } from "@/lib/group-routing";

export type MyGroup = {
  id: string;
  name: string;
  sport: string | null;
  logo_url: string | null;
  roles: MembershipRole[];
};

export const getMyGroups = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.from("v_my_groups")
    .select("id, name, sport, logo_url, roles").order("name").order("id");
  if (error) throw new Error("No pudimos cargar tus grupos. Vuelve a intentarlo.");
  const groups: MyGroup[] = (data ?? []).flatMap((group) => {
    if (!group.id || !group.name) return [];
    const roles = MEMBERSHIP_ROLES.filter((role) => group.roles?.includes(role));
    return [{ ...group, id: group.id, name: group.name, roles }];
  });
  return { userId: user.id, groups };
});

export const getGroup = cache(async (groupId: string) => {
  if (!isGroupId(groupId)) notFound();
  const { groups } = await getMyGroups();
  const membership = groups.find((group) => group.id === groupId.toLowerCase());
  if (!membership) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_group_detail")
    .select("id, name, sport, description, logo_url, roles, invite_code, settings, can_view_group_stats, settings_updated_at, settings_updated_by_name")
    .eq("id", groupId).maybeSingle();
  if (error) throw new Error("No pudimos cargar el grupo. Vuelve a intentarlo.");
  if (!data) notFound();
  return { ...data, id: membership.id, name: data.name ?? membership.name,
    roles: MEMBERSHIP_ROLES.filter((role) => data.roles?.includes(role)) };
});

export async function groupHomePath() {
  const { userId, groups } = await getMyGroups();
  if (!groups.length) return "/welcome";
  const saved = (await cookies()).get(activeGroupCookie(userId))?.value;
  const group = groups.find((item) => item.id === saved);
  if (group) return `/groups/${group.id}`;
  if (groups.length === 1) return `/groups/${groups[0]!.id}`;
  return "/groups";
}
