import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { VisibilityForm } from "../components/visibility-form";
import { Page } from "../ui";
export const loader=({request,params}:LoaderFunctionArgs)=>groupData(request,params.groupId,true);
export function Component(){const group=useLoaderData<typeof loader>();return <Page><title>Visibilidad · Asisteam</title><h1>Visibilidad del grupo</h1>{group.access==="admin" && <><VisibilityForm groupId={group.id} initialSettings={group.settings}/>{group.settings_updated_at && <p className="text-small">Último cambio: {group.settings_updated_at} · {group.settings_updated_by_name}</p>}</>}</Page>;}
