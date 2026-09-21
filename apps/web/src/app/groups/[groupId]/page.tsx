import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { JoinAsAthlete } from "./join-as-athlete";

export const metadata = { title: "Inicio del grupo" };

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  const pending = group.roles.includes("ADMIN")
    ? await (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("list_pending_athletes", { p_group_id: group.id });
      if (error) throw new Error("No pudimos cargar las aprobaciones pendientes. Vuelve a intentarlo.");
      return data ?? [];
    })()
    : [];
  return <>
    <header><h1 className="text-2xl font-semibold">{group.name}</h1>
      {group.sport && <p className="mt-2 text-muted-foreground">{group.sport}</p>}
      {group.description && <p className="mt-3 whitespace-pre-wrap">{group.description}</p>}</header>
    {group.roles.includes("ADMIN") && <section className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Administración del grupo</h2>
      <p>Código de invitación: <span className="font-mono tracking-widest">{group.invite_code}</span></p>
      <Link href={`/groups/${group.id}/settings#invite`} className="block underline">Invitar con código o enlace</Link>
      <Link href={`/groups/${group.id}/activities/new`} className="block underline">Crear actividad</Link>
      <Link href={`/groups/${group.id}/members/new`} className="block underline">Crear cuenta gestionada</Link>
      <Link href={`/groups/${group.id}/guardians`} className="block underline">Registrar y vincular apoderado</Link>
    </section>}
    {group.roles.includes("ADMIN") && <section className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Aprobaciones pendientes</h2>
      {pending.length ? <>
        <ul className="space-y-2">{pending.map((item) => <li key={item.membership_id} className="rounded-md border p-3">
          <span className="font-medium">{item.full_name}</span>
          <span className="ml-2 text-sm text-muted-foreground">{item.is_minor ? "Menor" : "Adulto"}</span>
          {item.is_minor && <p className="text-sm">{item.guardian_ready ? "Apoderado y consentimiento registrados; falta confirmación del administrador." : "Requiere apoderado vinculado y consentimiento vigente."}</p>}
        </li>)}</ul>
        {(pending[0]?.total_count ?? 0) > pending.length && <p className="text-sm text-muted-foreground">Se muestran las primeras 100 solicitudes.</p>}
      </> : <p className="text-muted-foreground">No hay solicitudes pendientes.</p>}
    </section>}
    {group.roles.includes("ADMIN") && !group.roles.includes("ATHLETE") && <JoinAsAthlete groupId={group.id} />}
    {group.roles.includes("ATHLETE") && <section id="my-attendance" className="space-y-2 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Mi asistencia</h2>
      <p className="text-muted-foreground">Tu asistencia e historial corresponden a este grupo.</p>
    </section>}
    {group.roles.includes("GUARDIAN") && <section id="my-wards" className="space-y-2 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Mis pupilos</h2>
      <Link className="block underline" href={`/groups/${group.id}/members/consent`}>Consentimientos de mis pupilos</Link>
      <p className="text-muted-foreground">Tu acceso como apoderado corresponde a tus pupilos vigentes de este grupo.</p>
    </section>}
  </>;
}
