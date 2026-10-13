import { PageHeader } from "../components/ui/page-header";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { VisibilityForm } from "../components/visibility-form";
import { Page, ActionLink } from "../ui";
export const loader=({request,params}:LoaderFunctionArgs)=>groupData(request,params.groupId,true);
export function Component(){const group=useLoaderData<typeof loader>();return <Page className="max-w-2xl px-0 py-0 md:px-0"><title>Visibilidad · Asisteam</title><PageHeader title="Visibilidad del grupo" description={`Decide qué estadísticas agregadas pueden consultar los deportistas y apoderados de ${group.name}. Cada opción se guarda de inmediato.`}/>{group.access==="admin" && <><VisibilityForm groupId={group.id} initialSettings={group.settings}/>{group.settings_updated_at && <p className="text-small">Último cambio: {group.settings_updated_at} · {group.settings_updated_by_name}</p>}</>}<ActionLink href={`/groups/${group.id}`}>Volver al inicio del grupo</ActionLink></Page>;}
