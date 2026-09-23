import Link from "next/link";
import { forbidden } from "next/navigation";
import { attendanceMetrics, groupSettingsSchema, type GroupStats } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getGroupStats } from "@/lib/reports";
import { StatsTable } from "../../reports/stats-table";
import { VisibilityForm } from "./visibility-form";

export const metadata = { title: "Visibilidad de estadísticas" };

export default async function GroupVisibilityPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) forbidden();
  const settings = groupSettingsSchema.parse(group.settings);
  const { report } = await getGroupStats(group.id, 1, 3);
  if (!report) forbidden();
  const example = report.totals.convened === 0;
  const metric = attendanceMetrics({ present: 6, late: 1, absent: 2, excused: 1 });
  const preview: GroupStats = example ? {
    group_id: group.id, page: 1, page_size: 3, totals: { ...metric, athletes: 1 },
    members: [{ ...metric, membership_id: "33000000-0000-4000-8000-000000000001", full_name: "Deportista de ejemplo", avatar_url: null }],
  } : report;
  return <>
    <h1 className="text-2xl font-semibold">Visibilidad de estadísticas</h1>
    <VisibilityForm groupId={group.id} initialSettings={settings} />
    {group.settings_updated_at && <p className="text-sm text-muted-foreground">Último cambio: {group.settings_updated_by_name}, {new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago",
    }).format(new Date(group.settings_updated_at))} (hora de Chile).</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Vista previa para deportistas</h2>
      <p>{example ? "Datos de ejemplo: el grupo aún no tiene asistencia registrada." : "Así se verá la tabla con la opción activada. Vista previa de hasta tres deportistas."}</p>
      <StatsTable report={preview} />
    </section>
    <Link href={`/groups/${group.id}/settings`} className="underline">Volver a configuración</Link>
  </>;
}
