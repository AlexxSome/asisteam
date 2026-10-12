import { redirect,useLoaderData,type LoaderFunctionArgs } from "react-router";
import { browserApi,requireSession,sessionError } from "../api";
import { Page,ActionLink } from "../ui";
export async function loader({request}:LoaderFunctionArgs){
 await requireSession(request);
 try{
  const groups=(await browserApi(request.signal).listMyGroups({query:{page:1,page_size:100}})).data.filter(group=>group.roles.includes("ATHLETE"));
  if(groups.length===1)throw redirect(`/groups/${groups[0]!.id}/me/history`);
  return {groups};
 }catch(error){return sessionError(error,request);}
}
export function Component(){const {groups}=useLoaderData<typeof loader>();return <Page><h1 className="text-2xl font-semibold">Mi asistencia</h1>{groups.length?<><p>Elige un grupo para consultar tu historial.</p><ul className="space-y-3">{groups.map(group=><li key={group.id}><ActionLink href={`/groups/${group.id}/me/history`} className="block rounded-lg border p-4 underline">{group.name}</ActionLink></li>)}</ul></>:<p>Aún no tienes una membresía activa como deportista.</p>}<ActionLink href="/groups">Volver a mis grupos</ActionLink></Page>;}
