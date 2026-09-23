import { reportAttendanceTone, reportPercentage, type GroupStats } from "@asisteam/core";

export function StatsTable({ report }: { report: GroupStats }) {
  const cell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
  const metrics = (row: GroupStats["totals"] | GroupStats["members"][number]) => <>
    <td className={cell}>{row.convened}</td><td className={cell}>{row.present}</td><td className={cell}>{row.late}</td>
    <td className={cell}>{row.absent}</td><td className={cell}>{row.excused}</td>
    <td className={`${cell} font-semibold ${reportAttendanceTone(row.attendance_pct)}`}>{reportPercentage(row.attendance_pct)}</td>
    <td className={cell}>{reportPercentage(row.late_rate)}</td>
  </>;
  return <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Estadísticas agregadas" tabIndex={0}>
    <table className="w-full text-sm">
      <caption className="p-3 text-left">Temporada · página {report.page}. Totales de todos los deportistas activos del grupo.</caption>
      <thead className="bg-muted"><tr><th scope="col" className="px-3 py-3 text-left">Deportista</th>
        {["Convocadas", "Presentes", "Atrasos", "Ausentes", "Justificados", "Asistencia", "Tasa de atrasos"].map((label) => <th key={label} scope="col" className={cell}>{label}</th>)}
      </tr></thead>
      <tbody>{report.members.map((member) => <tr key={member.membership_id} className="border-t">
        <th scope="row" className="min-w-40 px-3 py-3 text-left font-medium">
          {member.avatar_url && <img src={member.avatar_url} alt="" width={32} height={32} className="mr-2 inline-block size-8 rounded-full object-cover" />}
          {member.full_name}
        </th>{metrics(member)}
      </tr>)}</tbody>
      <tfoot className="border-t bg-muted font-medium"><tr><th scope="row" className="px-3 py-3 text-left">Totales del grupo</th>{metrics(report.totals)}</tr></tfoot>
    </table>
  </div>;
}
