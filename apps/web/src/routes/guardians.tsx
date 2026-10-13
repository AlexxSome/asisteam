import { Form,useLoaderData,type LoaderFunctionArgs } from "react-router";
import { httpSchemas } from "@asisteam/core/browser";
import { groupData } from "../group-data";
import { browserApi,sessionError } from "../api";
import { GuardianForm } from "../components/guardian-form";
import { Page,ActionLink,Button,Field,Input } from "../ui";
import { PageHeader } from "../components/ui/page-header";
import { EmptyState } from "../components/ui/empty-state";
import { Pagination } from "../components/pagination";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true),query=new URL(request.url).searchParams;
 const filter=httpSchemas.EligibleAthletesQuery.safeParse({search:query.get("q")??"",page:query.get("page")?Number(query.get("page")):1});
 if(!filter.success)throw new Response(null,{status:404});
 try{
  const api=browserApi(request.signal),membership=query.get("membership");
  if(membership!==null){
   const parsed=httpSchemas.OnboardingQuery.safeParse({group_id:group.id,membership_id:membership});if(!parsed.success)throw new Response(null,{status:404});
   const member=(await api.listMembershipOnboarding({query:parsed.data})).data[0];if(!member?.is_minor)throw new Response(null,{status:404});
   return {group,...filter.data,member,athletes:[{user_id:member.athlete_user_id,full_name:member.full_name}],total:1};
  }
  const {data}=await api.listGuardianshipAthletes({params:{groupId:group.id},query:filter.data});return {group,...filter.data,member:null,athletes:data,total:data[0]?.total_count??0};
 }catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,search,page,athletes,total,member}=useLoaderData<typeof loader>();
 const pageUrl=(value:number)=>`?${new URLSearchParams({q:search,page:String(value)})}`;
 const returnHref=member?`/groups/${group.id}/members/pending?membership=${member.membership_id}`:`/groups/${group.id}/members`;
 return <Page className="max-w-2xl px-0 py-0 md:px-0"><title>Registrar apoderado · Asisteam</title>
   <PageHeader title={member?`Vincular apoderado de ${member.full_name}`:"Registrar y vincular apoderado"} description={<>Vincula un apoderado nuevo o existente a un deportista menor de edad de {group.name}. El apoderado otorga su propio consentimiento.</>}/>
   {!member && <Form method="get" className="flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"><div className="min-w-0 flex-1"><Field id="athlete-search" label="Buscar deportista por nombre"><Input name="q" defaultValue={search} maxLength={120}/></Field></div><Button variant="secondary">Buscar</Button></Form>}
   {athletes.length?<section className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6" aria-label="Vínculo con apoderado"><GuardianForm key={`${group.id}:${search}:${page}:${member?.membership_id??""}`} groupId={group.id} athletes={athletes} selectedAthleteId={member?.athlete_user_id}/></section>
     :<EmptyState title={page>1?"No hay deportistas en esta página":search?"Sin resultados para esta búsqueda":"No hay menores disponibles para vincular"} action={<ActionLink href={page>1?pageUrl(1):`/groups/${group.id}/guardians`} variant="secondary">{page>1?"Volver a la primera página":"Restablecer búsqueda"}</ActionLink>}>Solo se ofrecen deportistas menores activos o pendientes del grupo. El vínculo y el consentimiento se revisan por separado.</EmptyState>}
   {!member && athletes.length>0 && <Pagination label="Páginas de deportistas" page={page} totalPages={Math.max(1,Math.ceil(total/50))} previousHref={page>1?pageUrl(page-1):undefined} nextHref={total>page*50?pageUrl(page+1):undefined}/>}
   <ActionLink href={returnHref}>{member?"Volver al estado de incorporación":"Volver a integrantes"}</ActionLink>
 </Page>;
}
