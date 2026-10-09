// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getGroup } from "@legacy/lib/groups";
import { GroupForm } from "@/app/groups/new/group-form";

export const metadata = { title: "Configuración del grupo" };

export default async function GroupSettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) forbidden();
  return <>
    <PageHeader title="Datos y código del grupo" description="Edita la identidad del grupo y administra el enlace para incorporar deportistas." />
    <GroupForm groupId={group.id} inviteCode={group.invite_code} initialValues={{
      name: group.name, sport: group.sport ?? "", description: group.description ?? "", logo_url: group.logo_url ?? "",
    }} />
  </>;
}
