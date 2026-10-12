import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { ManagedMemberForm } from "../components/managed-member-form";
import { Page } from "../ui";
export const loader=({request,params}:LoaderFunctionArgs)=>groupData(request,params.groupId,true);
export function Component(){const group=useLoaderData<typeof loader>();return <Page><title>Crear cuenta gestionada · Asisteam</title><header className="space-y-2"><h1 className="text-2xl font-semibold">Crear cuenta gestionada</h1><p>Registra un deportista en {group.name} sin credenciales de acceso. Su email es opcional.</p></header><ManagedMemberForm key={group.id} groupId={group.id}/></Page>;}
