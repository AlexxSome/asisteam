import { RouterLink as Link } from "../navigation";
import { activityDateTimeInput, activityTypeLabel, formatActivityDay, formatActivityTime } from "@asisteam/core/browser";
import { ActionLink } from "../ui";
import { ActivityDateMark } from "./activity-date-mark";
type ActivityPeriod="upcoming"|"past";

type AgendaActivity = {
  id: string | null; group_id: string | null; title: string | null;
  starts_at: string | null; ends_at: string | null; location: string | null;
  activity_type_name: string | null; activity_type_color: string | null; is_system_type: boolean | null;
  group_name?: string | null;
};

export function ActivityPeriodLinks({ path, period, label, anchor = "" }: {
  path: string; period: ActivityPeriod; label: string; anchor?: string;
}) {
  return <nav aria-label={label} className="flex flex-wrap gap-2">
    {(["upcoming", "past"] as const).map(value => <Link key={value}
      href={`${path}?period=${value}${anchor}`} prefetch={false} aria-current={period === value ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${period === value ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface underline underline-offset-4"}`}>
      {value === "upcoming" ? "Próximas" : "Pasadas"}
    </Link>)}
  </nav>;
}

/** Presentation only: preserve the authorized query's order and pagination. */
export function ActivityAgenda({ activities, period, page, context, canTakeAttendance = false }: {
  activities: AgendaActivity[]; period: ActivityPeriod; page: number;
  context: { from: "group" | "agenda" } | { from: "wards"; wardId: string };
  canTakeAttendance?: boolean;
}) {
  const days = new Map<string, AgendaActivity[]>();
  for (const activity of activities) {
    const day = activity.starts_at ? activityDateTimeInput(activity.starts_at).slice(0, 10) : "pending";
    days.set(day, [...(days.get(day) ?? []), activity]);
  }
  return <div className="space-y-6">{Array.from(days, ([day, rows]) => <section key={day} className="space-y-3" aria-label={day === "pending" ? "Fecha por confirmar" : formatActivityDay(rows[0]!.starts_at!)}>
    <h3 className="border-b pb-2 text-lg font-semibold first-letter:uppercase">{rows[0]!.starts_at ? formatActivityDay(rows[0]!.starts_at) : "Fecha por confirmar"}</h3>
    <ul className="space-y-3">{rows.map(activity => {
      const nextDay = activity.starts_at && activity.ends_at && activityDateTimeInput(activity.starts_at).slice(0, 10) !== activityDateTimeInput(activity.ends_at).slice(0, 10);
      const query = `from=${context.from}${context.from === "wards" ? `&ward=${context.wardId}` : ""}&period=${period}&page=${page}`;
      const detail = `/groups/${activity.group_id}/activities/${activity.id}?${query}`;
      return <li key={activity.id} className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-surface p-3 md:grid-cols-[56px_minmax(0,1fr)_auto]">
        <ActivityDateMark startsAt={activity.starts_at}/>
        <div className="min-w-0 space-y-2">
          {context.from !== "group" && <p className="break-words text-sm text-muted-foreground">{activity.group_name}</p>}
          <Link href={detail} prefetch={false}
            className="block min-h-11 [overflow-wrap:anywhere] py-2 text-h3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{activity.title}<span className="sr-only"> · Ver detalle</span></Link>
          <p className="text-small tabular-nums"><time dateTime={activity.starts_at ?? undefined}>{activity.starts_at ? formatActivityTime(activity.starts_at) : "Horario por confirmar"}</time>
            {activity.ends_at && <> – <time dateTime={activity.ends_at}>{formatActivityTime(activity.ends_at)}</time>{nextDay && <> · {formatActivityDay(activity.ends_at)}</>}</>} · Chile</p>
          <p className="flex items-start gap-2 break-words text-sm"><span aria-hidden className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
          <p className="[overflow-wrap:anywhere] text-small text-muted-foreground">{activity.location || "Lugar por confirmar"}</p>
        </div>
        <ActionLink className="col-start-2 justify-self-start md:col-start-3" variant={canTakeAttendance ? "primary" : "secondary"}
          href={canTakeAttendance ? `/groups/${activity.group_id}/activities/${activity.id}/attendance?${query}` : detail}
          aria-label={`${canTakeAttendance ? "Tomar asistencia" : "Ver actividad"} · ${activity.title}`}>
          {canTakeAttendance ? "Tomar asistencia" : "Ver actividad"}
        </ActionLink>
      </li>;
    })}</ul>
  </section>)}</div>;
}
