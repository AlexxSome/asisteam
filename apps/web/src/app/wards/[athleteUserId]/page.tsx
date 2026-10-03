import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getWardActivities, parseActivitySearch, type ActivitySearchParams } from "@/lib/activities";

export const metadata = { title: "Perfil deportivo del pupilo" };
export const dynamic = "force-dynamic";

export default async function WardPage({ params, searchParams }: {
  params: Promise<{ athleteUserId: string }>;
  searchParams: Promise<ActivitySearchParams>;
}) {
  const { page, period } = parseActivitySearch(await searchParams);
  const { ward, activities, hasNext } = await getWardActivities((await params).athleteUserId, page, period);
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
      <nav aria-label="Período de actividades del pupilo" className="flex flex-wrap gap-5 underline">
        <Link href={`${wardPath}?period=upcoming#agenda`} prefetch={false} className="inline-block min-h-11 py-2" aria-current={period === "upcoming" ? "page" : undefined}>Próximas</Link>
        <Link href={`${wardPath}?period=past#agenda`} prefetch={false} className="inline-block min-h-11 py-2" aria-current={period === "past" ? "page" : undefined}>Pasadas</Link>
      </nav>
      <p className="text-sm text-muted-foreground">Horarios de Chile · America/Santiago</p>
      {activities.length === 0 ? <EmptyState title={!hasActiveGroups ? "Agenda pendiente de activación" : page > 1 ? "No hay actividades en esta página" : "Sin actividades en este período"}
        action={<ActionLink variant="secondary" href={!hasActiveGroups ? "/wards" : page > 1 ? `${wardPath}?period=${period}#agenda` : `${wardPath}?period=${period === "upcoming" ? "past" : "upcoming"}#agenda`}>
          {!hasActiveGroups ? "Volver a mis pupilos" : page > 1 ? "Volver a la primera página" : period === "upcoming" ? "Ver actividades pasadas" : "Ver próximas actividades"}
        </ActionLink>}>
        {!hasActiveGroups ? "Su agenda estará disponible cuando tenga una membresía activa en un grupo."
          : `No hay actividades ${period === "upcoming" ? "próximas" : "pasadas"} en esta página.`}
      </EmptyState> : <ul className="space-y-3">
        {activities.map((activity) => <li key={activity.id} className="space-y-2 rounded-lg border p-4">
          <p className="break-words text-sm text-muted-foreground">{activity.group_name}</p>
          <Link href={`/groups/${activity.group_id}/activities/${activity.id}?from=wards&ward=${ward.athlete_user_id}&period=${period}&page=${page}`} prefetch={false} className="inline-block min-h-11 break-words py-2 text-lg font-semibold underline">{activity.title}</Link>
          <p className="flex items-center gap-2"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
          <p>{activity.starts_at && formatActivityDateTime(activity.starts_at)} → {activity.ends_at && formatActivityDateTime(activity.ends_at)}</p>
          <p className="break-words text-muted-foreground">{activity.location || "Lugar por confirmar"}</p>
        </li>)}
      </ul>}
      <nav aria-label="Páginas de actividades del pupilo" className="flex gap-5 underline">
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
        {group.membership_status === "ACTIVE" && <Link href={`/groups/${group.group_id}/wards/${ward.athlete_user_id}/history`} prefetch={false} className="inline-block min-h-11 py-2 underline">Ver historial de asistencia</Link>}
      </li>)}</ul>
    </section>
  </div></AppShell>;
}
