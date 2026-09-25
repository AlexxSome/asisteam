import Link from "next/link";
import { redirect } from "next/navigation";
import { MEMBERSHIP_ROLE_LABELS, activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getMyGroups } from "@/lib/groups";
import { getMyActivities, parseActivitySearch, type ActivitySearchParams } from "@/lib/activities";

export const metadata = { title: "Mis grupos" };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<ActivitySearchParams> }) {
  const { groups } = await getMyGroups();
  if (!groups.length) redirect("/welcome");
  const { page, period } = parseActivitySearch(await searchParams);
  const { activities, hasNext } = await getMyActivities(page, period);
  return <main className="mx-auto max-w-3xl space-y-6 p-4 py-10">
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
      <h2 id="agenda-title" className="text-xl font-semibold">Mi agenda</h2>
      <p className="text-sm text-muted-foreground">Actividades de todos tus grupos · Horarios de Chile · America/Santiago</p>
      <nav aria-label="Período de mi agenda" className="flex gap-5 underline">
        <Link href="/groups?period=upcoming#agenda" aria-current={period === "upcoming" ? "page" : undefined}>Próximas</Link>
        <Link href="/groups?period=past#agenda" aria-current={period === "past" ? "page" : undefined}>Pasadas</Link>
      </nav>
      {activities.length === 0 ? <p>No hay actividades {period === "upcoming" ? "próximas" : "pasadas"} en esta página.</p> : <ul className="space-y-3">
        {activities.map((activity) => <li key={activity.id} className="space-y-2 rounded-lg border p-4">
          <Link href={`/groups/${activity.group_id}`} className="break-words text-sm underline">{activity.group_name}</Link>
          <Link href={`/groups/${activity.group_id}/activities/${activity.id}`} className="block break-words text-lg font-semibold underline">{activity.title}</Link>
          <p className="flex items-center gap-2"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
          <p>{activity.starts_at && formatActivityDateTime(activity.starts_at)} → {activity.ends_at && formatActivityDateTime(activity.ends_at)}</p>
          {activity.location && <p className="break-words text-muted-foreground">{activity.location}</p>}
        </li>)}
      </ul>}
      <nav aria-label="Páginas de mi agenda" className="flex gap-5 underline">
        {page > 1 && <Link href={`/groups?period=${period}&page=${page - 1}#agenda`}>Anterior</Link>}
        {hasNext && <Link href={`/groups?period=${period}&page=${page + 1}#agenda`}>Siguiente</Link>}
      </nav>
    </section>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
      <Link href="/groups/new">Crear un grupo</Link><Link href="/join">Unirme con código</Link><Link href="/profile">Mi perfil</Link>
    </nav>
  </main>;
}
