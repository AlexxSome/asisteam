import { getGroup, getGroupCapacity, getMyGroups } from "@/lib/groups";
import { AppShell } from "@/components/app-shell";
import { GroupCapacityNotice } from "@/components/group-capacity";

export default async function GroupLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, { groups, userId }] = await Promise.all([getGroup(groupId), getMyGroups()]);
  const capacity = group.roles.includes("ADMIN") ? await getGroupCapacity(groupId) : null;
  return <AppShell group={group} groups={groups} userId={userId}>
    {group.roles.includes("ADMIN") && <GroupCapacityNotice groupId={group.id} capacity={capacity} />}
    {children}
  </AppShell>;
}
