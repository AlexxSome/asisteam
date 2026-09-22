import Link from "next/link";
import { forbidden } from "next/navigation";
import { activityTypeLabel } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { ActivityTypeForm } from "./activity-type-form";

export const metadata = { title: "Tipos de actividad" };

export default async function ActivityTypesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) forbidden();
  const types = await getActivityTypes(group.id, true);
  const customTypes = types.filter((type) => type.group_id === group.id);
  return <>
    <Link href={`/groups/${groupId}/activities`} className="underline">Volver a actividades</Link>
    <h1 className="text-2xl font-semibold">Tipos de actividad</h1>
    <p>Define los tipos de tu grupo. Al desactivar uno, deja de ofrecerse para actividades nuevas; las actividades y su historial se conservan.</p>
    <section className="max-w-xl space-y-4 rounded-lg border p-4" aria-labelledby="new-type-heading">
      <h2 id="new-type-heading" className="text-lg font-semibold">Crear tipo personalizado</h2>
      <ActivityTypeForm groupId={group.id} />
    </section>
    <section className="space-y-4" aria-labelledby="custom-types-heading">
      <h2 id="custom-types-heading" className="text-lg font-semibold">Tipos del grupo</h2>
      {!customTypes.length ? <p>Aún no has creado tipos personalizados.</p> : <ul className="grid gap-4 sm:grid-cols-2">
        {customTypes.map((type) => <li key={type.id} className="min-w-0 space-y-3 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 break-words font-semibold"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type.color ?? undefined }} />{type.name}</h3>
          <p className="text-sm text-muted-foreground">{type.is_active ? "Activo" : "Desactivado"}</p>
          <ActivityTypeForm groupId={group.id} activityType={{ id: type.id, name: type.name, color: type.color ?? "#6B7280", is_active: !!type.is_active }} />
        </li>)}
      </ul>}
    </section>
    <section className="space-y-3" aria-labelledby="system-types-heading">
      <h2 id="system-types-heading" className="text-lg font-semibold">Tipos de sistema</h2>
      <p className="text-sm text-muted-foreground">Son comunes a todos los grupos y no se pueden editar ni desactivar.</p>
      <ul className="grid gap-3 sm:grid-cols-2">{types.filter((type) => type.group_id === null).map((type) => <li key={type.id} className="flex items-center gap-2 rounded-lg border p-4">
        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type.color ?? undefined }} />{activityTypeLabel(type.name, true)}
      </li>)}</ul>
    </section>
  </>;
}
