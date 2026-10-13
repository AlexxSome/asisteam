import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { ManagedMemberForm } from "../components/managed-member-form";
import { PageHeader } from "../components/ui/page-header";
import { Page, ActionLink } from "../ui";
export const loader=({request,params}:LoaderFunctionArgs)=>groupData(request,params.groupId,true);
export function Component(){const group=useLoaderData<typeof loader>();return <Page className="max-w-2xl px-0 py-0 md:px-0"><title>Crear cuenta gestionada · Asisteam</title><PageHeader title="Crear cuenta gestionada" description={<>Registra un deportista en {group.name} sin credenciales de acceso. Su email es opcional.</>}/><section className="rounded-lg border border-border bg-surface p-4 md:p-6" aria-label="Alta de deportista"><ManagedMemberForm key={group.id} groupId={group.id}/></section><ActionLink href={`/groups/${group.id}/members`}>Volver a integrantes</ActionLink></Page>;}
