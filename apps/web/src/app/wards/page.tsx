import { MembershipProgress } from "@/app/groups/[groupId]/members/pending/membership-review";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { getGuardianTasks, getMyWards, parseWardsPage } from "@/lib/wards";
import { getWardHomeActivities, homeActivityLabel } from "@/lib/activities";
import { getWardAttendanceHistory } from "@/lib/attendance-history";
import { AttendanceSummary } from "@/components/attendance-history";
import { attendancePeriodFilterSchema, formatActivityDateTime } from "@asisteam/core";

export const metadata = { title: "Mis pupilos" };
export const dynamic = "force-dynamic";

export default async function WardsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = parseWardsPage((await searchParams).page);
  const { wards, hasNext } = await getMyWards(page, 10);
  const summaries = new Map(await Promise.all(wards.map(async ward => {
    const nextActivity = await getWardHomeActivities(ward.athlete_user_id);
    const groups = await Promise.all(ward.groups.slice(0, 3).map(async group => {
      if (!group.group_id) return { group, attendance: null, tasks: null };
      const active = group.membership_status === "ACTIVE";
      const [attendance, tasks] = await Promise.all([
        active ? getWardAttendanceHistory(group.group_id, ward.athlete_user_id, attendancePeriodFilterSchema.parse({ period: "month" }), 1) : null,
        getGuardianTasks(group.group_id, ward.athlete_user_id),
      ]);
      return { group, attendance, tasks };
    }));
    return [ward.athlete_user_id, { groups, agenda: nextActivity }] as const;
  })));
  return <AppShell wards><div className="mx-auto max-w-3xl space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Mis pupilos</h1>
      <p className="text-muted-foreground">Próximas actividades y asistencia del mes, separadas por pupilo y grupo.</p>
    </header>
    {wards.length === 0 ? <EmptyState title={page > 1 ? "No hay pupilos en esta página" : "Aún no tienes pupilos vinculados"}
      action={<ActionLink href={page > 1 ? "/wards" : "/groups"} variant="secondary">{page > 1 ? "Volver a la primera página" : "Volver a mis grupos"}</ActionLink>}>
      {page === 1 ? "Aún no tienes deportistas a tu cargo; pide al administrador del grupo que te vincule." : "No hay más pupilos en esta página."}
    </EmptyState> : <ul className="space-y-6">
      {wards.map((ward) => <li key={ward.athlete_user_id} className="space-y-3 rounded-lg border p-5">
        <Link href={`/wards/${ward.athlete_user_id}`} prefetch={false} className="flex min-h-11 items-center gap-3 underline underline-offset-4">
          {ward.avatar_url && <img src={ward.avatar_url} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />}
          <h2 className="break-words text-lg font-semibold">{ward.full_name}</h2>
        </Link>
        <p className="text-sm text-muted-foreground">{ward.age} años</p>
        <Link href={`/wards/${ward.athlete_user_id}#agenda`} prefetch={false} className="inline-block min-h-11 py-2 underline">Ver actividades</Link>
        {(() => {
          const agenda = summaries.get(ward.athlete_user_id)?.agenda;
          const next = agenda?.next;
          const activityGroup = ward.groups.find(group => group.group_id === next?.group_id);
          return next && agenda ? <div className="space-y-1 rounded-md bg-muted p-3">
            <p className="text-sm font-medium">{homeActivityLabel(next, agenda.now)} · {activityGroup?.name} · America/Santiago</p>
            <Link href={`/groups/${next.group_id}/activities/${next.id}?from=wards&ward=${ward.athlete_user_id}&period=upcoming&page=1`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold underline">{next.title}</Link>
            {next.starts_at && <p className="text-sm"><time dateTime={next.starts_at}>{formatActivityDateTime(next.starts_at)}</time></p>}
            <p className="break-words text-sm">{next.location || "Lugar por confirmar"}</p>
          </div> : <p className="text-sm text-muted-foreground">{ward.groups.every(group => group.membership_status !== "ACTIVE") ? "Su agenda estará disponible cuando tenga una membresía activa." : agenda?.previous ? "No hay próximas actividades en sus grupos." : "Aún no hay actividades en sus grupos."}</p>;
        })()}
        <ul className="divide-y" aria-label={`Grupos de ${ward.full_name}`}>
          {summaries.get(ward.athlete_user_id)?.groups.map(({ group, attendance, tasks }) => <li key={group.group_id} className="space-y-3 py-4">
            <h3 className="break-words font-semibold">{group.name}</h3>
            {group.membership_status !== "ACTIVE" ? <p className="text-sm text-muted-foreground">Pendiente de activación. Su agenda y asistencia estarán disponibles cuando tenga una membresía activa.</p> : <>
              {attendance?.history ? <AttendanceSummary history={attendance.history} /> : attendance?.error && <p role="alert">{attendance.error}</p>}
              <Link href={`/groups/${group.group_id}/wards/${ward.athlete_user_id}/history?period=month`} prefetch={false} className="inline-flex min-h-11 items-center text-sm underline">Ver historial de {ward.full_name} en {group.name}</Link>
            </>}
            {tasks?.memberships[0] && <MembershipProgress groupId={group.group_id!} member={tasks.memberships[0]} audience="guardian" />}
            {tasks && (tasks.consents > 0 || tasks.activations > 0) && <div className="rounded-md bg-muted p-3 text-sm">
              <p>Para {ward.full_name} en este grupo · Tratamiento de datos pendiente: {tasks.consents} · Solicitudes de activación de cuenta: {tasks.activations}.</p>
              <Link href={`/groups/${group.group_id}/members/consent?athlete=${ward.athlete_user_id}`} className="inline-flex min-h-11 items-center underline">Revisar consentimientos y activaciones</Link>
            </div>}
          </li>)}
        </ul>
        {ward.groups.length > 3 && <p className="text-sm text-muted-foreground">Se muestran 3 de {ward.groups.length} grupos. <Link href={`/wards/${ward.athlete_user_id}`} prefetch={false} className="inline-flex min-h-11 items-center underline">Ver todos sus grupos</Link></p>}
        {ward.days_until_majority !== null && ward.days_until_majority <= 30 && <p className="rounded-md bg-muted p-3 text-sm">
          En {ward.days_until_majority} {ward.days_until_majority === 1 ? "día" : "días"} tu pupilo administrará su propia cuenta.
        </p>}
      </li>)}
    </ul>}
    <nav aria-label="Páginas de mis pupilos" className="flex gap-5 underline">
      {page > 1 && <Link href={`/wards?page=${page - 1}`} prefetch={false}>Anterior</Link>}
      {hasNext && <Link href={`/wards?page=${page + 1}`} prefetch={false}>Siguiente</Link>}
    </nav>
    <p className="text-sm text-muted-foreground">Al cumplir 18 años, el deportista deja de aparecer entre tus pupilos y recibes un aviso por correo.</p>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
      <Link href="/groups">Mis grupos</Link><Link href="/profile">Mi perfil</Link>
    </nav>
  </div></AppShell>;
}
