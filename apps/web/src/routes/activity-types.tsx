import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page, ActionLink } from "../ui";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { activityTypeLabel, canManageAttendance, activityDateTimeInput, activityRecurrenceSummary, formatActivityDateTime } from "@asisteam/core/browser";
import { activityReturnLink, activityReturnQuery } from "../../src/lib/group-routing";
import { queryObject, allTypes, activityData } from "../activity-data";
import { ActivityTypeForm } from "../components/activity-type-form";
import { PageHeader } from "../../src/components/ui/page-header";
export async function loader({request,params}:LoaderFunctionArgs){const group=await groupData(request,params.groupId,true);try{return {group,types:await allTypes(request,group.id,true)};}catch(error){return sessionError(error,request);}}
export function Component(){const {group,types}=useLoaderData<typeof loader>(),groupId=group.id,customTypes=types.filter(type=>type.group_id===group.id);
  return <Page>
    <PageHeader title="Tipos de actividad" description="Organiza las actividades de este grupo con tipos personalizados. Elige Editar para cambiar uno existente.">
      <ActionLink href={`/groups/${groupId}/activities`}>Volver a actividades</ActionLink>
    </PageHeader>
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
  </Page>;
}
