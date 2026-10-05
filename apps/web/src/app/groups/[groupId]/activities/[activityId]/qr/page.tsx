import { ActionLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { notFound } from "next/navigation";
import { formatActivityDateTime } from "@asisteam/core";
import { getActivity } from "@/lib/activities";
import { getGroup } from "@/lib/groups";
import { loadQrSettings } from "@/app/check-in/actions";
import { QrDisplay } from "./qr-display";

export const metadata = { title: "Asistencia con QR", robots: { index: false, follow: false } };

export default async function ActivityQrPage({ params }: { params: Promise<{ groupId: string; activityId: string }> }) {
  const { groupId, activityId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const [activity, result] = await Promise.all([getActivity(groupId, activityId), loadQrSettings(groupId)]);
  return <div className="space-y-4">
    <ActionLink href={`/groups/${groupId}/activities/${activityId}`} className="px-0">Volver a la actividad</ActionLink>
    <header className="space-y-1">
      <p className="text-caption font-medium text-muted-foreground">Asistencia con QR</p>
      <h1 className="break-words text-xl font-semibold">{activity.title}</h1>
      <p className="text-small">Inicio: {activity.starts_at && formatActivityDateTime(activity.starts_at)} (Chile).</p>
    </header>
    {"error" in result ? <Alert>{result.error.message} Vuelve a la actividad para abrir el QR nuevamente.</Alert> : <QrDisplay groupId={groupId} activityId={activityId} initialSettings={result.settings} />}
  </div>;
}
