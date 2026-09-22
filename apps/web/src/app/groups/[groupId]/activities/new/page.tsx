import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { ActivityForm } from "./activity-form";

export const metadata = { title: "Crear actividad" };

export default async function NewActivityPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) return <p role="alert">Solo un administrador del grupo puede crear actividades.</p>;
  const types = await getActivityTypes(groupId);
  return <>
    <Link href={`/groups/${groupId}/activities`} className="underline">Volver a actividades</Link>
    <h1 className="text-2xl font-semibold">Crear actividad</h1>
    <Link href={`/groups/${groupId}/activity-types`} className="inline-block underline">Gestionar tipos de actividad</Link>
    <ActivityForm groupId={groupId} types={types} />
  </>;
}
