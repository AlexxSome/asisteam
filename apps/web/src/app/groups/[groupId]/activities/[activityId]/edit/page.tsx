import Link from "next/link";
import { activityDateTimeInput, activityRecurrenceSummary } from "@asisteam/core";
import { activityReturnLink, activityReturnQuery, type ActivityReturnParams } from "@/lib/group-routing";
import { getActivity, getActivityTypes } from "@/lib/activities";
import { getGroup } from "@/lib/groups";
import { ActivityForm } from "../../new/activity-form";

export const metadata = { title: "Editar actividad" };

export default async function EditActivityPage({ params, searchParams }: { params: Promise<{ groupId: string; activityId: string }>; searchParams?: Promise<ActivityReturnParams> }) {
  const { groupId, activityId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) return <p role="alert">Solo un administrador del grupo puede gestionar actividades.</p>;
  const [activity, types] = await Promise.all([getActivity(groupId, activityId), getActivityTypes(groupId)]);
  const query = await searchParams;
  const detailQuery = activityReturnQuery(query);
  const returnHref = `/groups/${groupId}/activities/${activityId}${detailQuery}`;
  if (activity.activity_type_id && !types.some((type) => type.id === activity.activity_type_id)) {
    types.push({ id: activity.activity_type_id, name: activity.activity_type_name ?? "Tipo desactivado", group_id: activity.is_system_type ? null : groupId, color: activity.activity_type_color, is_active: false });
  }
  return <>
    <Link href={returnHref} className="inline-flex min-h-11 items-center underline">Volver a la actividad</Link>
    <h1 className="text-2xl font-semibold">Editar actividad</h1>
    <ActivityForm groupId={groupId} types={types} returnHref={returnHref} detailQuery={detailQuery} agendaHref={activityReturnLink(groupId, query).href}
      activity={{ id: activityId, recurring: !!activity.recurrence_rule, recurrenceSummary: activityRecurrenceSummary(activity.recurrence_rule), values: {
      title: activity.title ?? "", activity_type_id: activity.activity_type_id ?? "", description: activity.description ?? "", location: activity.location ?? "",
      starts_at: activityDateTimeInput(activity.starts_at!), ends_at: activityDateTimeInput(activity.ends_at!),
    } }} />
  </>;
}
