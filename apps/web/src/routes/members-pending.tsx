import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { Page, ActionLink } from "../ui";
import { PageHeader } from "../components/ui/page-header";
import { EmptyState } from "../components/ui/empty-state";
import { Pagination } from "../components/pagination";
import { MembershipReview } from "../components/membership-review";
import { httpSchemas } from "@asisteam/core/browser";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true), query=new URL(request.url).searchParams;
 const parsed=httpSchemas.OnboardingQuery.safeParse({group_id:group.id,membership_id:query.get("membership")??undefined,page:query.get("page")?Number(query.get("page")):1});
 if(!parsed.success)throw new Response(null,{status:404});
 try{return {group,page:parsed.data.page,membership:parsed.data.membership_id,data:(await browserApi(request.signal).listMembershipOnboarding({query:parsed.data})).data};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,page,membership,data}=useLoaderData<typeof loader>();
 const total=data?.[0]?.total_count??0;
 const href=(next:number)=>`?${new URLSearchParams({page:String(next),...(membership?{membership}:{})})}`;
 return <Page className="max-w-7xl px-0 py-0 md:px-0"><title>Aprobaciones · Asisteam</title>
   <PageHeader title="Aprobaciones" description={<>Revisa las incorporaciones pendientes de {group.name}. Los menores requieren apoderado vinculado y consentimiento vigente.</>}/>
   <aside className="rounded-lg border border-border bg-info-subtle p-4 text-small">Cada ficha muestra qué falta y quién actúa. El ingreso por código requiere confirmación del administrador; en el alta gestionada, la autorización del alta y el consentimiento del apoderado son pasos separados. Los cupos se comprueban al activar.</aside>
   {!data?.length && <EmptyState title={page>1 ? "No hay incorporaciones en esta página" : membership ? "Incorporación no disponible" : "No hay incorporaciones pendientes"}
     action={<ActionLink href={page>1 ? href(1) : `/groups/${group.id}/members`} variant="secondary">{page>1 ? "Volver a la primera página" : "Volver a integrantes"}</ActionLink>}>
     {page>1 ? "Vuelve al inicio conservando la incorporación seleccionada." : "Puedes consultar la nómina y revisar los roles de cada integrante."}
   </EmptyState>}
   <div className="grid min-w-0 gap-4 xl:grid-cols-2">{data?.map(member=><MembershipReview key={member.membership_id} groupId={group.id} member={member}/>)}</div>
   {!!data?.length && <Pagination label="Páginas de aprobaciones" page={page} totalPages={Math.max(1,Math.ceil(total/50))} previousHref={page>1?href(page-1):undefined} nextHref={total>page*50?href(page+1):undefined}/>}
   <div className="flex flex-wrap gap-2">{membership && <ActionLink href={`/groups/${group.id}/members/pending`}>Ver todas las incorporaciones pendientes</ActionLink>}
     <ActionLink href={`/groups/${group.id}/members`}>Volver a integrantes</ActionLink></div>
 </Page>;
}
