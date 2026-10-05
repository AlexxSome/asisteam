import type { GroupStats } from "@asisteam/core";
import { AttendanceMetricCells, AttendanceTableHead, ReportTableRegion, reportNameCell } from "./report-table";

export function StatsTable({ report }: { report: GroupStats }) {
  return <ReportTableRegion label="Estadísticas agregadas">
    <table className="w-full text-small">
      <caption className="p-3 text-left">Temporada · página {report.page}. Totales de todos los deportistas activos del grupo. Asistencia total ponderada por convocatorias evaluables.</caption>
      <AttendanceTableHead />
      <tbody>{report.members.map((member) => <tr key={member.membership_id} className="border-t border-border">
        <th scope="row" className={`${reportNameCell} bg-surface font-medium`}>
          {member.avatar_url && <img src={member.avatar_url} alt="" width={32} height={32} className="mr-2 inline-block size-8 rounded-full object-cover" />}
          {member.full_name}
        </th><AttendanceMetricCells metrics={member} />
      </tr>)}</tbody>
      <tfoot className="border-t border-border bg-muted font-medium"><tr><th scope="row" className={`${reportNameCell} bg-muted`}>Totales del grupo<span className="block text-caption font-normal">Asistencia ponderada</span></th><AttendanceMetricCells metrics={report.totals} /></tr></tfoot>
    </table>
  </ReportTableRegion>;
}
