// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { getGroup, getGroupCapacity, getMyGroups } from "@legacy/lib/groups";
import { AppShell } from "@legacy/components/app-shell";
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
