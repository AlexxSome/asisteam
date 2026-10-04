import { ActivityAgenda, ActivityPeriodLinks } from "@/components/activity-agenda";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { getActivities, parseActivitySearch, type ActivitySearchParams } from "@/lib/activities";

export const metadata = { title: "Actividades" };

export default async function ActivitiesPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<ActivitySearchParams>;
}) {
  const { groupId } = await params;
  const { page, period } = parseActivitySearch(await searchParams);
  // Resolve access and invalid query responses before opening a streaming boundary.
  const group = await getGroup(groupId);
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">Actividades</h1>
      {group.roles.includes("ADMIN") && <div className="flex flex-wrap items-center gap-4">
        <Link href={`/groups/${groupId}/activity-types`} className="underline">Tipos de actividad</Link>
        <Link href={`/groups/${groupId}/activities/new?from=group&period=${period}&page=${page}`} className="rounded-md bg-primary px-4 py-3 text-primary-foreground">Crear actividad</Link>
      </div>}
    </div>
    <ActivityPeriodLinks path={`/groups/${groupId}/activities`} period={period} label="Período de actividades" />
    <Link href="/groups#agenda" className="inline-flex min-h-11 items-center underline">Mi agenda de todos los grupos</Link>
    <p className="text-sm text-muted-foreground">Horarios de Chile · America/Santiago</p>
    <div className="min-h-80">
    <Suspense key={`${groupId}:${period}:${page}`} fallback={<LoadingState label="Cargando actividades…" />}>
    {getActivities(groupId, page, period).then(({ activities, hasNext }) => <>
    {activities.length === 0 ? <EmptyState
      title={page > 1 ? "No hay actividades en esta página" : period === "upcoming" ? "No hay próximas actividades" : "No hay actividades pasadas"}
      action={page > 1 ? <ActionLink href={`/groups/${groupId}/activities?period=${period}`} variant="secondary">Volver a la primera página</ActionLink>
        : <>{group.roles.includes("ADMIN") && <ActionLink href={`/groups/${groupId}/activities/new?from=group&period=${period}&page=${page}`} variant="primary">Crear actividad</ActionLink>}
          <ActionLink href={`/groups/${groupId}/activities?period=${period === "upcoming" ? "past" : "upcoming"}`} variant="secondary">{period === "upcoming" ? "Ver actividades pasadas" : "Ver próximas actividades"}</ActionLink></>}>
      {page > 1 ? "Vuelve al inicio de la lista conservando el período seleccionado."
        : period === "upcoming" ? "Las actividades programadas del grupo aparecerán aquí." : "Las actividades ya realizadas aparecerán aquí. Puedes consultar las próximas actividades."}
    </EmptyState> : <ActivityAgenda activities={activities} page={page} period={period} context={{ from: "group" }} />}
    <nav aria-label="Páginas de actividades" className="mt-4 flex flex-wrap gap-3">
      {page > 1 && <Link href={`/groups/${groupId}/activities?period=${period}&page=${page - 1}`} className="inline-flex min-h-11 items-center px-3 underline">Anterior</Link>}
      {hasNext && <Link href={`/groups/${groupId}/activities?period=${period}&page=${page + 1}`} className="inline-flex min-h-11 items-center px-3 underline">Siguiente</Link>}
    </nav>
  </>)}
    </Suspense>
    </div>
  </>;
}
