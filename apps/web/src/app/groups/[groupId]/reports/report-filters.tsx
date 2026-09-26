import { REPORT_PERIOD_LABELS, activityTypeLabel, type ReportFilter, type AttendancePeriodFilter } from "@asisteam/core";

export function ReportFilters({ groupId, filter, types, personal = false }: {
  groupId: string; filter: AttendancePeriodFilter & Partial<Pick<ReportFilter, "sort" | "include_inactive">>; personal?: boolean;
  types: { id: string; name: string; group_id: string | null; is_active: boolean | null }[];
}) {
  const input = "mt-1 w-full rounded-md border bg-background p-2";
  const action = `/groups/${groupId}/${personal ? "me/history" : "reports"}`;
  return <form action={action} method="get" className="space-y-4 rounded-lg border p-4">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label>Período<select name="period" defaultValue={filter.period} className={input}>
        {Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Desde / fecha de referencia<input type="date" name="from" defaultValue={filter.from} className={input} aria-describedby="date-help" /></label>
      <label>Hasta (rango personalizado)<input type="date" name="to" defaultValue={filter.to} className={input} aria-describedby="date-help" /></label>
      {!personal && <label>Ordenar por<select name="sort" defaultValue={filter.sort} className={input}>
        <option value="attendance">Asistencia (mayor a menor)</option><option value="name">Nombre (A–Z)</option>
      </select></label>}
    </div>
    <p id="date-help" className="text-sm text-muted-foreground">Semana: lunes a domingo. Mes: mes calendario de la fecha indicada (hoy si la dejas vacía). Para rango personalizado, completa ambas fechas; se incluyen ambos días. Temporada: todo el historial desde la creación del grupo. Zona horaria: America/Santiago.</p>
    <fieldset><legend className="font-medium">Tipos de actividad</legend>
      <p className="mb-2 text-sm text-muted-foreground">Sin selección se incluyen todos. Puedes combinar varios tipos.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{types.map((type) => <label key={type.id} className="flex min-h-11 items-center gap-2">
        <input type="checkbox" name="activity_type_id" value={type.id} defaultChecked={filter.activity_type_ids.includes(type.id)} />
        {activityTypeLabel(type.name, type.group_id === null)}{type.is_active === false && " (inactivo)"}
      </label>)}</div>
    </fieldset>
    {!personal && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="include_inactive" value="true" defaultChecked={filter.include_inactive} />Incluir deportistas inactivos</label>}
    <div className="flex flex-wrap items-center gap-4">
      <button type="submit" className="rounded-md bg-primary px-4 py-3 text-primary-foreground">Aplicar filtros</button>
      <a href={action} className="underline">Restablecer filtros</a>
    </div>
  </form>;
}
