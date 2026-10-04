import { ActionLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getAttendance } from "@/lib/attendance";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata = { title: "Tomar asistencia" };

export default async function AttendancePage({ params }: { params: Promise<{ groupId: string; activityId: string }> }) {
  const { groupId, activityId } = await params;
  const { activity, roster, canEditNotes } = await getAttendance(groupId, activityId);
  return <div className="space-y-3">
    <ActionLink href={`/groups/${groupId}/activities/${activityId}`}>Volver a la actividad</ActionLink>
    <header className="min-w-0 space-y-1">
      <h1 className="text-h2 [overflow-wrap:anywhere]">Tomar asistencia · {activity.title}</h1>
      <p className="text-small text-muted-foreground">{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)} · {activity.starts_at && formatActivityDateTime(activity.starts_at)} (Chile)</p>
    </header>
    {activity.starts_at && new Date(activity.starts_at).getTime() - Date.now() > 2 * 60 * 60 * 1000 &&
      <Alert tone="warning">Esta actividad aún no comienza; puedes registrar asistencia anticipada.</Alert>}
    {roster.length ? <AttendanceSheet key={activityId} groupId={groupId} activityId={activityId} initialRows={roster} canEditNotes={canEditNotes} /> :
      <EmptyState title="Aún no hay deportistas para tomar asistencia" action={canEditNotes
        ? <><ActionLink href={`/groups/${groupId}/members/new`} variant="primary">Agregar deportista</ActionLink><ActionLink href={`/groups/${groupId}/invitations/new`}>Invitar por email</ActionLink><ActionLink href={`/groups/${groupId}/members/pending`}>Revisar pendientes</ActionLink></>
        : <ActionLink href={`/groups/${groupId}/activities/${activityId}`} variant="secondary">Volver a la actividad</ActionLink>}>
        Este grupo aún no tiene deportistas activos. {canEditNotes ? "Agrega o invita deportistas, o revisa las membresías pendientes de activación." : "Pide a un administrador que revise la nómina del grupo."}
      </EmptyState>}
  </div>;
}
