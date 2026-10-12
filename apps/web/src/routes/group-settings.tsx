import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { groupData } from "../group-data";
import { GroupForm } from "../components/group-form";
import { Page } from "../ui";
export async function loader({request,params}:LoaderFunctionArgs){return groupData(request,params.groupId,true);}
export function Component(){const group=useLoaderData<typeof loader>();return <Page><title>Configuración del grupo · Asisteam</title><h1>Configuración del grupo</h1>{group.access === "admin" && <GroupForm groupId={group.id} initialValues={{name:group.name,sport:group.sport??"",description:group.description??"",logo_url:group.logo_url??""}} inviteCode={group.invite_code}/>}</Page>;}
