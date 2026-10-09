// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { ActivityAgenda, ActivityPeriodLinks } from "@/components/activity-agenda";
import { getGuardianTasks } from "@legacy/lib/wards";
import { MembershipProgress } from "@/app/groups/[groupId]/members/pending/membership-review";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import { AppShell } from "@legacy/components/app-shell";
import Link from "next/link";
import { getWardActivities, parseActivitySearch, type ActivitySearchParams } from "@legacy/lib/activities";

export const metadata = { title: "Perfil deportivo del pupilo" };
export const dynamic = "force-dynamic";

export default async function WardPage({ params, searchParams }: {
  params: Promise<{ athleteUserId: string }>;
  searchParams: Promise<ActivitySearchParams>;
}) {
  const { page, period } = parseActivitySearch(await searchParams);
  const { ward, activities, hasNext } = await getWardActivities((await params).athleteUserId, page, period);
  const tasks = new Map(await Promise.all(ward.groups.map(async group =>
    [group.group_id, group.group_id ? await getGuardianTasks(group.group_id, ward.athlete_user_id) : null] as const)));
  const wardPath = `/wards/${ward.athlete_user_id}`;
  const hasActiveGroups = ward.groups.some((group) => group.membership_status === "ACTIVE");
  return <AppShell wards><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/wards" prefetch={false} className="inline-block min-h-11 py-2 underline">Cambiar de pupilo · Mis pupilos</Link>
    <header className="flex items-center gap-4">
      {ward.avatar_url && <img src={ward.avatar_url} alt="" width={72} height={72} className="size-18 rounded-full object-cover" />}
      <div><p className="text-sm text-muted-foreground">Perfil deportivo</p>
        <h1 className="break-words text-2xl font-semibold">{ward.full_name}</h1>
        <p className="mt-2 text-muted-foreground">{ward.age} años</p>
      </div>
    </header>
    <section id="agenda" aria-labelledby="ward-agenda" className="space-y-4">
      <h2 id="ward-agenda" className="text-xl font-semibold">Actividades de {ward.full_name}</h2>
      <ActivityPeriodLinks path={wardPath} period={period} label="Período de actividades del pupilo" anchor="#agenda" />
      <p className="text-sm text-muted-foreground">Horarios de Chile · America/Santiago</p>
      {activities.length === 0 ? <EmptyState title={!hasActiveGroups ? "Agenda pendiente de activación" : page > 1 ? "No hay actividades en esta página" : "Sin actividades en este período"}
        action={<ActionLink variant="secondary" href={!hasActiveGroups ? "/wards" : page > 1 ? `${wardPath}?period=${period}#agenda` : `${wardPath}?period=${period === "upcoming" ? "past" : "upcoming"}#agenda`}>
          {!hasActiveGroups ? "Volver a mis pupilos" : page > 1 ? "Volver a la primera página" : period === "upcoming" ? "Ver actividades pasadas" : "Ver próximas actividades"}
        </ActionLink>}>
        {!hasActiveGroups ? "Su agenda estará disponible cuando tenga una membresía activa en un grupo."
          : `No hay actividades ${period === "upcoming" ? "próximas" : "pasadas"} en esta página.`}
      </EmptyState> : <ActivityAgenda activities={activities} page={page} period={period} context={{ from: "wards", wardId: ward.athlete_user_id! }} />}
      <nav aria-label="Páginas de actividades del pupilo" className="flex flex-wrap gap-3 underline">
        {page > 1 && <Link href={`${wardPath}?period=${period}&page=${page - 1}#agenda`} prefetch={false} className="inline-block min-h-11 py-2">Anterior</Link>}
        {hasNext && <Link href={`${wardPath}?period=${period}&page=${page + 1}#agenda`} prefetch={false} className="inline-block min-h-11 py-2">Siguiente</Link>}
      </nav>
    </section>
    <section aria-labelledby="ward-groups" className="space-y-4">
      <h2 id="ward-groups" className="text-xl font-semibold">Sus grupos</h2>
      <ul className="space-y-3">{ward.groups.map((group) => <li key={group.group_id} className="space-y-2 rounded-lg border p-4">
        <Link href={`/groups/${group.group_id}`} prefetch={false} className="block break-words py-2 text-lg font-semibold underline">{group.name}</Link>
        {group.sport && <p>{group.sport}</p>}
        <p className="text-sm text-muted-foreground">{group.membership_status === "PENDING" ? "Pendiente de activación" : "Membresía activa"}</p>
        {tasks.get(group.group_id)?.memberships[0] && <MembershipProgress groupId={group.group_id!} member={tasks.get(group.group_id)!.memberships[0]!} audience="guardian" />}
        {!!tasks.get(group.group_id)?.activations && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${group.group_id}/members/consent?athlete=${ward.athlete_user_id}`}>Revisar acceso con cuenta propia de {ward.full_name}</Link>}
        {group.membership_status === "ACTIVE" && <Link href={`/groups/${group.group_id}/wards/${ward.athlete_user_id}/history`} prefetch={false} className="inline-block min-h-11 py-2 underline">Ver historial de asistencia</Link>}
      </li>)}</ul>
    </section>
  </div></AppShell>;
}
