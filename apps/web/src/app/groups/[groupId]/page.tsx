import Link from "next/link";
import { getGroup } from "@/lib/groups";

export const metadata = { title: "Inicio del grupo" };

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  return <>
    <header><h1 className="text-2xl font-semibold">{group.name}</h1>
      {group.sport && <p className="mt-2 text-muted-foreground">{group.sport}</p>}
      {group.description && <p className="mt-3 whitespace-pre-wrap">{group.description}</p>}</header>
    {group.roles.includes("ADMIN") && <section className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Administración del grupo</h2>
      <Link href={`/groups/${group.id}/settings`} className="underline">Ver configuración y código de invitación</Link>
    </section>}
    {group.roles.includes("ATHLETE") && <section id="my-attendance" className="space-y-2 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Mi asistencia</h2>
      <p className="text-muted-foreground">Tu asistencia e historial corresponden a este grupo.</p>
    </section>}
    {group.roles.includes("GUARDIAN") && <section id="my-wards" className="space-y-2 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Mis pupilos</h2>
      <p className="text-muted-foreground">Tu acceso como apoderado corresponde a tus pupilos vigentes de este grupo.</p>
    </section>}
  </>;
}
