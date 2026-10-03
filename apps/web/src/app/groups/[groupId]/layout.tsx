import { getGroup, getMyGroups } from "@/lib/groups";
import { AppShell } from "@/components/app-shell";

export default async function GroupLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, { groups, userId }] = await Promise.all([getGroup(groupId), getMyGroups()]);
  return <AppShell group={group} groups={groups} userId={userId}>{children}</AppShell>;
}
