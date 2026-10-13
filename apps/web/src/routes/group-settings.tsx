import { PageHeader } from "../components/ui/page-header";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { GroupForm } from "../components/group-form";
import { Page } from "../ui";
export async function loader({request,params}:LoaderFunctionArgs){return groupData(request,params.groupId,true);}
export function Component(){const group=useLoaderData<typeof loader>();return <Page className="max-w-2xl px-0 py-0 md:px-0"><title>Configuración del grupo · Asisteam</title><PageHeader title="Configuración del grupo" description={`Datos y código de ${group.name}. Guarda los datos para aplicar cambios; regenerar el código requiere confirmación.`}/>{group.access === "admin" && <GroupForm groupId={group.id} initialValues={{name:group.name,sport:group.sport??"",description:group.description??"",logo_url:group.logo_url??""}} inviteCode={group.invite_code}/>}</Page>;}
