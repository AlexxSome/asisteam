import type { ReactNode } from "react";
import { reportAttendanceClass } from "@/lib/attendance-presentation";
import { reportPercentage, type GroupAttendanceReport } from "@asisteam/core";

const numericCell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
export const reportNameCell = "sticky left-0 z-10 w-36 min-w-36 max-w-36 break-words border-r border-border px-3 py-3 text-left sm:w-48 sm:min-w-48 sm:max-w-48";

/** Rendering primitives only: private and public callers keep their own DTOs. */
export function ReportTableRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2">
    <p className="text-small text-muted-foreground">Más columnas a la derecha → Desliza o usa las flechas al enfocar la tabla.</p>
    <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  </div>;
}

export function AttendanceTableHead() {
  return <thead className="bg-muted"><tr><th scope="col" className={`${reportNameCell} bg-muted`}>Deportista</th>
    {["Asistencia", "Convocadas", "Presentes", "Atrasos", "Ausentes", "Justificados", "Tasa de atrasos"].map((label) => <th key={label} scope="col" className={numericCell}>{label}</th>)}
  </tr></thead>;
}

export function AttendanceMetricCells({ metrics }: {
  metrics: Pick<GroupAttendanceReport["totals"], "convened" | "present" | "late" | "absent" | "excused" | "attendance_pct" | "late_rate">;
}) {
  return <>
    <td className={`${numericCell} font-semibold ${reportAttendanceClass(metrics.attendance_pct)}`}>{reportPercentage(metrics.attendance_pct)}</td>
    <td className={numericCell}>{metrics.convened}</td><td className={numericCell}>{metrics.present}</td><td className={numericCell}>{metrics.late}</td>
    <td className={numericCell}>{metrics.absent}</td><td className={numericCell}>{metrics.excused}</td>
    <td className={numericCell}>{reportPercentage(metrics.late_rate)}</td>
  </>;
}

export function ReportTable({ report }: { report: GroupAttendanceReport }) {
  return <ReportTableRegion label="Resumen por deportista">
    <table className="w-full text-small">
      <caption className="sr-only">Asistencia por deportista · página {report.page}. Los totales incluyen todos los deportistas del filtro. Asistencia total ponderada por convocatorias evaluables.</caption>
      <AttendanceTableHead />
      <tbody>{report.by_athlete.map((row) => <tr key={row.membership_id} className="border-t border-border">
        <th scope="row" className={`${reportNameCell} bg-surface font-medium`}>{row.full_name}{row.membership_status === "INACTIVE" && <span className="block text-caption text-muted-foreground">Inactivo</span>}</th>
        <AttendanceMetricCells metrics={row} />
      </tr>)}</tbody>
      <tfoot className="border-t border-border bg-muted font-medium"><tr><th scope="row" className={`${reportNameCell} bg-muted`}>Totales del grupo<span className="block text-caption font-normal">Asistencia ponderada</span></th><AttendanceMetricCells metrics={report.totals} /></tr></tfoot>
    </table>
  </ReportTableRegion>;
}
