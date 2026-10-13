import { formatActivityDay } from "@asisteam/core/browser";

/** The visual date and its accessible name always use the same Chile timezone. */
export function ActivityDateMark({ startsAt }: { startsAt: string | null }) {
  if (!startsAt) return <span className="flex w-14 shrink-0 items-center rounded-md bg-muted p-2 text-caption">Fecha por confirmar</span>;
  const date = new Date(startsAt);
  const options = { timeZone: "America/Santiago" };
  return <time dateTime={startsAt} aria-label={formatActivityDay(startsAt)} className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md border bg-muted p-2 tabular-nums">
    <span className="text-caption uppercase">{new Intl.DateTimeFormat("es-CL", { ...options, month: "short" }).format(date)}</span>
    <span className="text-h2">{new Intl.DateTimeFormat("es-CL", { ...options, day: "2-digit" }).format(date)}</span>
  </time>;
}
