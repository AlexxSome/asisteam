import { forbidden } from "next/navigation";
import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { GroupForm } from "../../new/group-form";

export const metadata = { title: "Configuración del grupo" };

export default async function GroupSettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) forbidden();
  return <>
    <h1 className="text-2xl font-semibold">Configuración del grupo</h1>
    <Link href={`/groups/${group.id}/settings/visibility`} className="block underline">Visibilidad de estadísticas</Link>
    <GroupForm groupId={group.id} inviteCode={group.invite_code} initialValues={{
      name: group.name, sport: group.sport ?? "", description: group.description ?? "", logo_url: group.logo_url ?? "",
    }} />
  </>;
}
