import Link from "next/link";
import { canManageAttendance, activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getActivity } from "@/lib/activities";
import { getGroup } from "@/lib/groups";
import { activityReturnLink, type ActivityReturnParams } from "@/lib/group-routing";

export const metadata = { title: "Detalle de actividad" };

export default async function ActivityPage({ params, searchParams }: {
  params: Promise<{ groupId: string; activityId: string }>;
  searchParams?: Promise<ActivityReturnParams>;
}) {
  const { groupId, activityId } = await params;
  const [activity, group] = await Promise.all([getActivity(groupId, activityId), getGroup(groupId)]);
  // Only fixed destinations: incoming query parameters never become redirect URLs.
  const back = activityReturnLink(groupId, await searchParams);
  return <>
    <Link href={back.href} className="inline-flex min-h-11 items-center underline">{back.label}</Link>
    <h1 className="break-words text-2xl font-semibold">{activity.title}</h1>
    {canManageAttendance(group.roles) && <Link href={`/groups/${groupId}/activities/${activityId}/attendance`} className="inline-block rounded-md bg-primary px-4 py-3 text-primary-foreground">Tomar asistencia</Link>}
    {group.roles.includes("ADMIN") && <Link href={`/groups/${groupId}/activities/${activityId}/edit`} className="inline-block rounded-md border px-4 py-3">Editar o eliminar actividad</Link>}
    {group.roles.includes("ADMIN") && <Link href={`/groups/${groupId}/activities/${activityId}/qr`} className="inline-block rounded-md border px-4 py-3">Mostrar QR de asistencia</Link>}
    {activity.recurrence_rule && <p className="text-sm text-muted-foreground">Esta actividad pertenece a una serie semanal.</p>}
    <p className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
    <dl className="space-y-3">
      <div><dt className="font-medium">Inicio</dt><dd>{activity.starts_at && formatActivityDateTime(activity.starts_at)}</dd></div>
      <div><dt className="font-medium">Término</dt><dd>{activity.ends_at && formatActivityDateTime(activity.ends_at)}</dd></div>
      <div><dt className="font-medium">Zona horaria</dt><dd>Chile · America/Santiago</dd></div>
      {activity.location && <div><dt className="font-medium">Lugar</dt><dd className="break-words">{activity.location}</dd></div>}
    </dl>
    {activity.description && <p className="whitespace-pre-wrap break-words">{activity.description}</p>}
  </>;
}
