"use client";

import { useId, useState } from "react";
import { REPORT_PERIOD_LABELS, activityTypeLabel, type ReportFilter, type AttendancePeriodFilter } from "@asisteam/core";

export function ReportFilters({ groupId, filter, types, personal = false, athleteUserId }: {
  groupId: string; filter: AttendancePeriodFilter & Partial<Pick<ReportFilter, "sort" | "include_inactive">>; personal?: boolean;
  types: { id: string; name: string; group_id: string | null; is_active: boolean | null }[]; athleteUserId?: string;
}) {
  const [period, setPeriod] = useState(filter.period);
  const helpId = useId();
  const input = "mt-1 min-h-control w-full min-w-0 rounded-md border border-input bg-surface p-2 text-body";
  const action = `/groups/${groupId}/${athleteUserId ? `wards/${athleteUserId}/history` : personal ? "me/history" : "reports"}`;
  const activeCount = filter.activity_type_ids.length + Number(Boolean(!personal && filter.include_inactive))
    + Number(!personal && filter.sort === "name") + Number(["week", "month"].includes(filter.period) && Boolean(filter.from));
  const selectedTypes = filter.activity_type_ids.map((id) => {
    const type = types.find((item) => item.id === id);
    return type ? `${activityTypeLabel(type.name, type.group_id === null)}${type.is_active === false ? " (inactivo)" : ""}` : "Tipo no disponible";
  });
  const appliedPeriod = filter.period === "custom" ? `${filter.from} al ${filter.to}`
    : filter.period === "season" ? "Temporada completa"
    : `${REPORT_PERIOD_LABELS[filter.period]}${filter.from ? ` de referencia ${filter.from}` : " actual"}`;
  return <form action={action} method="get" aria-label="Filtros de asistencia" className="space-y-3 rounded-lg border border-border bg-surface p-4">
    <p className="break-words text-small text-muted-foreground"><span className="font-medium">Filtros aplicados: </span>{[
      appliedPeriod, selectedTypes.length ? selectedTypes.join(", ") : "Todos los tipos",
      ...(personal ? [] : [filter.include_inactive ? "Activos e inactivos" : "Solo activos", filter.sort === "name" ? "Nombre (A–Z)" : "Mayor asistencia primero"]),
    ].join(" · ")}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 basis-48">Período<select name="period" value={period} onChange={(event) => setPeriod(event.target.value as AttendancePeriodFilter["period"])} className={input}>
        {Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {period === "custom" && <div className="grid w-full gap-3 sm:grid-cols-2">
        <label>Desde<input type="date" name="from" defaultValue={filter.from} required className={input} aria-describedby={helpId} /></label>
        <label>Hasta<input type="date" name="to" defaultValue={filter.to} required className={input} aria-describedby={helpId} /></label>
        <p id={helpId} className="text-small text-muted-foreground sm:col-span-2">Se incluyen ambos días, en hora de Chile.</p>
      </div>}
      <button type="submit" className="min-h-control rounded-md bg-primary px-4 py-3 text-primary-foreground">Aplicar filtros</button>
      <a href={action} className="inline-flex min-h-control items-center underline">Restablecer filtros</a>
    </div>
    <details className="border-t border-border pt-2">
      <summary className="min-h-control cursor-pointer py-3 font-medium">Más filtros ({activeCount} activos)</summary>
      <div className="space-y-4 pb-2 pt-1">
        <div className="grid gap-3 sm:grid-cols-2">
          {(period === "week" || period === "month") && <label>Fecha de referencia (opcional)
            <input type="date" name="from" defaultValue={filter.from} className={input} aria-describedby={helpId} />
            <span id={helpId} className="mt-1 block text-small text-muted-foreground">{period === "week" ? "Semana de lunes a domingo" : "Mes calendario"} de esa fecha; hoy si está vacía. Hora de Chile.</span>
          </label>}
          {!personal && <label>Ordenar por<select name="sort" defaultValue={filter.sort} className={input}>
            <option value="attendance">Asistencia (mayor a menor)</option><option value="name">Nombre (A–Z)</option>
          </select></label>}
        </div>
        <fieldset><legend className="font-medium">Tipos de actividad</legend>
          <p className="text-small text-muted-foreground">Sin selección se incluyen todos. Puedes combinar varios tipos.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">{types.map((type) => <label key={type.id} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="activity_type_id" value={type.id} defaultChecked={filter.activity_type_ids.includes(type.id)} />
            {activityTypeLabel(type.name, type.group_id === null)}{type.is_active === false && " (inactivo)"}
          </label>)}</div>
        </fieldset>
        {!personal && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="include_inactive" value="true" defaultChecked={filter.include_inactive} />Incluir deportistas inactivos</label>}
      </div>
    </details>
  </form>;
}
