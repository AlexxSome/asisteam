import Link from "next/link";
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
  return <>
    <Link href={`/groups/${groupId}/activities/${activityId}`} className="underline">Volver a la actividad</Link>
    <h1 className="break-words text-2xl font-semibold">Asistencia con QR · {activity.title}</h1>
    <p>Inicio: {activity.starts_at && formatActivityDateTime(activity.starts_at)} (Chile).</p>
    {"error" in result ? <p role="alert">{result.error.message}</p> : <QrDisplay groupId={groupId} activityId={activityId} initialSettings={result.settings} />}
  </>;
}
