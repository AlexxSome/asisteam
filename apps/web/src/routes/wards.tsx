import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { MembershipProgress } from "../components/membership-review";
import { EmptyState } from "../../src/components/ui/empty-state";
import { Page,ActionLink } from "../ui";
import { PrivateAvatar } from "../components/private-avatar";
import { wardsData } from "../ward-data";
import { formatActivityDateTime,activityDateTimeInput,reportPercentage,reportAttendanceTone,type AttendanceHistory } from "@asisteam/core/browser";
function homeActivityLabel(activity:{starts_at:string;ends_at:string},now:string){if(Date.parse(activity.starts_at)<=Date.parse(now)&&Date.parse(activity.ends_at)>=Date.parse(now))return "En curso";const today=activityDateTimeInput(activity.starts_at).slice(0,10)===activityDateTimeInput(now).slice(0,10);return Date.parse(activity.ends_at)<Date.parse(now)?today?"Anterior de hoy":"Anterior":today?"Hoy":"Próxima";}
function AttendanceSummary({history}:{history:Pick<AttendanceHistory,"period"|"totals">}){return <div><p>Asistencia del mes: <strong className={{neutral:"text-neutral",success:"text-success",warning:"text-warning",error:"text-error"}[reportAttendanceTone(history.totals.attendance_pct)]}>{reportPercentage(history.totals.attendance_pct)}</strong></p><p className="text-small">Período: {history.period.from} al {history.period.to} · America/Santiago</p>{history.totals.attendance_pct===null&&<p>Sin convocatorias evaluables en este período.</p>}</div>;}
export const loader=({request}:LoaderFunctionArgs)=>wardsData(request);
export function Component(){const {page,wards,hasNext,summaries}=useLoaderData<typeof loader>();
  return <Page><title>Mis pupilos · Asisteam</title><div className="mx-auto max-w-3xl space-y-6">
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
          {ward.avatar_url && <PrivateAvatar path={ward.avatar_url} alt="" />}
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
              {attendance?.history ? <AttendanceSummary history={attendance.history} /> : null}
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
  </div></Page>;
}
