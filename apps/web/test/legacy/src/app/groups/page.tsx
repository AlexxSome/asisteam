// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { ActivityAgenda, ActivityPeriodLinks } from "@/components/activity-agenda";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import { AppShell } from "@legacy/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { getMyGroups } from "@legacy/lib/groups";
import { getMyActivities, parseActivitySearch, type ActivitySearchParams } from "@legacy/lib/activities";

export const metadata = { title: "Mis grupos" };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<ActivitySearchParams> }) {
  const { groups } = await getMyGroups();
  if (!groups.length) redirect("/welcome");
  const { page, period } = parseActivitySearch(await searchParams);
  const { activities, hasNext } = await getMyActivities(page, period);
  return <AppShell groups={groups}><div className="mx-auto max-w-3xl space-y-6">
    <header><h1 className="text-2xl font-semibold">Mis grupos</h1>
      <p className="mt-2 text-muted-foreground">Elige el grupo en el que quieres participar.</p></header>
    <ul className="grid gap-4 sm:grid-cols-2">
      {groups.map((group) => <li key={group.id}>
        <Link href={`/groups/${group.id}`} className="block h-full space-y-2 rounded-lg border p-5 hover:bg-muted focus-visible:outline-2">
          <span className="block text-lg font-semibold">{group.name}</span>
          {group.sport && <span className="block text-sm text-muted-foreground">{group.sport}</span>}
          <span className="block text-sm">{group.roles.map((role) => MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</span>
          <span className="block text-xs text-muted-foreground">Membresía activa</span>
        </Link>
      </li>)}
    </ul>
    <section id="agenda" aria-labelledby="agenda-title" className="space-y-4">
      <h2 id="agenda-title" className="text-xl font-semibold">Mi agenda global</h2>
      <p className="text-sm text-muted-foreground">Actividades de todos tus grupos · Horarios de Chile · America/Santiago</p>
      <ActivityPeriodLinks path="/groups" period={period} label="Período de mi agenda" anchor="#agenda" />
      {activities.length === 0 ? <EmptyState title={page > 1 ? "No hay actividades en esta página" : period === "upcoming" ? "No tienes actividades próximas" : "No hay actividades pasadas"}
        action={<ActionLink variant="secondary" href={page > 1 ? `/groups?period=${period}#agenda` : `/groups?period=${period === "upcoming" ? "past" : "upcoming"}#agenda`}>
          {page > 1 ? "Volver a la primera página" : period === "upcoming" ? "Ver actividades pasadas" : "Ver próximas actividades"}
        </ActionLink>}>
        {page > 1 ? "Vuelve al inicio de la agenda conservando el período." : "Aquí aparecerán las actividades de tus grupos para el período seleccionado."}
      </EmptyState> : <ActivityAgenda activities={activities} page={page} period={period} context={{ from: "agenda" }} />}
      <nav aria-label="Páginas de mi agenda" className="flex flex-wrap gap-3">
        {page > 1 && <Link href={`/groups?period=${period}&page=${page - 1}#agenda`} className="inline-flex min-h-11 items-center px-3 underline">Anterior</Link>}
        {hasNext && <Link href={`/groups?period=${period}&page=${page + 1}#agenda`} className="inline-flex min-h-11 items-center px-3 underline">Siguiente</Link>}
      </nav>
    </section>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
      {groups.some((group) => group.roles.includes("GUARDIAN")) && <Link href="/wards" prefetch={false}>Mis pupilos</Link>}
      <Link href="/groups/new">Crear un grupo</Link><Link href="/join">Unirme con código</Link><Link href="/profile">Mi perfil</Link>
    </nav>
  </div></AppShell>;
}
