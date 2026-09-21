import Link from "next/link";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { getGroup, getMyGroups } from "@/lib/groups";
import { GroupSelector } from "../group-selector";

export default async function GroupLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, { groups, userId }] = await Promise.all([getGroup(groupId), getMyGroups()]);
  // GUARDIAN puro navega por pupilo (APO-03); no usa dropdown de grupo.
  const guardianOnly = groups.every((item) => item.roles.every((role) => role === "GUARDIAN"));
  return <div className="mx-auto max-w-5xl p-4">
    <header className="space-y-4 border-b pb-5">
      <div className="flex items-center justify-between gap-4"><Link href="/groups" className="font-semibold">Asisteam</Link><Link href="/profile" className="text-sm underline">Mi perfil</Link></div>
      <GroupSelector groups={groups} activeId={group.id} userId={userId} guardianOnly={guardianOnly} />
      <div className="flex items-center gap-3">
        {group.logo_url && <img src={group.logo_url} alt="" width={40} height={40} referrerPolicy="no-referrer" className="size-10 rounded object-cover" />}
        <div><p className="font-semibold">{group.name}</p><p className="text-sm text-muted-foreground">{group.roles.map((role) => MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</p></div>
      </div>
      <nav aria-label="Navegación del grupo" className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
        <Link href={`/groups/${group.id}`}>Inicio</Link>
        <Link href={`/groups/${group.id}/activities`}>Actividades</Link>
        {group.roles.includes("ADMIN") && <Link href={`/groups/${group.id}/settings`}>Configuración del grupo</Link>}
        {group.roles.includes("ATHLETE") && <Link href={`/groups/${group.id}#my-attendance`}>Mi asistencia</Link>}
        {group.roles.includes("GUARDIAN") && <Link href={`/groups/${group.id}#my-wards`}>Mis pupilos</Link>}
        {guardianOnly && <Link href="/groups">Mis grupos</Link>}
      </nav>
    </header>
    <main className="space-y-6 py-6">{children}</main>
  </div>;
}
