import { reportAttendanceTone, reportPercentage, type GroupAttendanceReport } from "@asisteam/core";

export function ReportTable({ report }: { report: GroupAttendanceReport }) {
  const cell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
  const metrics = (row: GroupAttendanceReport["totals"] | GroupAttendanceReport["by_athlete"][number]) => <>
    <td className={cell}>{row.convened}</td><td className={cell}>{row.present}</td><td className={cell}>{row.late}</td>
    <td className={cell}>{row.absent}</td><td className={cell}>{row.excused}</td>
    <td className={`${cell} font-semibold ${reportAttendanceTone(row.attendance_pct)}`}>{reportPercentage(row.attendance_pct)}</td>
    <td className={cell}>{reportPercentage(row.late_rate)}</td>
  </>;
  return <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Resumen por deportista" tabIndex={0}>
    <table className="w-full text-sm">
      <caption className="p-3 text-left">Asistencia por deportista · página {report.page}. Los totales incluyen todos los deportistas del filtro.</caption>
      <thead className="bg-muted"><tr><th scope="col" className="px-3 py-3 text-left">Deportista</th>
        {["Convocadas", "Presentes", "Atrasos", "Ausentes", "Justificados", "Asistencia", "Tasa de atrasos"].map((label) => <th key={label} scope="col" className={cell}>{label}</th>)}
      </tr></thead>
      <tbody>{report.by_athlete.map((row) => <tr key={row.membership_id} className="border-t">
        <th scope="row" className="min-w-40 px-3 py-3 text-left font-medium">{row.full_name}{row.membership_status === "INACTIVE" && <span className="ml-2 text-xs text-muted-foreground">Inactivo</span>}</th>
        {metrics(row)}
      </tr>)}</tbody>
      <tfoot className="border-t bg-muted font-medium"><tr><th scope="row" className="px-3 py-3 text-left">Totales del grupo</th>{metrics(report.totals)}</tr></tfoot>
    </table>
  </div>;
}
