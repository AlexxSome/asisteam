import Link from "next/link";
import { activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivities, parseActivitySearch, type ActivitySearchParams } from "@/lib/activities";

export const metadata = { title: "Actividades" };

export default async function ActivitiesPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<ActivitySearchParams>;
}) {
  const { groupId } = await params;
  const { page, period } = parseActivitySearch(await searchParams);
  const [group, { activities, hasNext }] = await Promise.all([getGroup(groupId), getActivities(groupId, page, period)]);
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">Actividades</h1>
      {group.roles.includes("ADMIN") && <div className="flex flex-wrap items-center gap-4">
        <Link href={`/groups/${groupId}/activity-types`} className="underline">Tipos de actividad</Link>
        <Link href={`/groups/${groupId}/activities/new`} className="rounded-md bg-primary px-4 py-3 text-primary-foreground">Crear actividad</Link>
      </div>}
    </div>
    <nav aria-label="Período de actividades" className="flex flex-wrap gap-5 underline">
      <Link href={`/groups/${groupId}/activities?period=upcoming`} aria-current={period === "upcoming" ? "page" : undefined}>Próximas</Link>
      <Link href={`/groups/${groupId}/activities?period=past`} aria-current={period === "past" ? "page" : undefined}>Pasadas</Link>
      <Link href="/groups#agenda">Mi agenda de todos los grupos</Link>
    </nav>
    <p className="text-sm text-muted-foreground">Horarios de Chile · America/Santiago</p>
    {activities.length === 0 ? <p>Aún no hay actividades en esta página.</p> : <ul className="space-y-3">
      {activities.map((activity) => <li key={activity.id} className="space-y-2 rounded-lg border p-4">
        <Link href={`/groups/${groupId}/activities/${activity.id}`} className="break-words text-lg font-semibold underline">{activity.title}</Link>
        <p className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
        <p>{activity.starts_at && formatActivityDateTime(activity.starts_at)} → {activity.ends_at && formatActivityDateTime(activity.ends_at)}</p>
        {activity.location && <p className="break-words text-muted-foreground">{activity.location}</p>}
      </li>)}
    </ul>}
    <nav aria-label="Páginas de actividades" className="flex gap-5">
      {page > 1 && <Link href={`/groups/${groupId}/activities?period=${period}&page=${page - 1}`} className="underline">Anterior</Link>}
      {hasNext && <Link href={`/groups/${groupId}/activities?period=${period}&page=${page + 1}`} className="underline">Siguiente</Link>}
    </nav>
  </>;
}
