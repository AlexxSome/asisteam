import { Form,useLoaderData,type LoaderFunctionArgs } from "react-router";
import { httpSchemas } from "@asisteam/core/browser";
import { groupData } from "../group-data";
import { browserApi,sessionError } from "../api";
import { GuardianForm } from "../components/guardian-form";
import { RouterLink as Link } from "../navigation";
import { Page,Button,Field,Input } from "../ui";
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
export function Component(){const {group,search,page,athletes,total,member}=useLoaderData<typeof loader>();
 const pageUrl=(value:number)=>`?${new URLSearchParams({q:search,page:String(value)})}`;
 return <Page><title>Registrar apoderado · Asisteam</title><header className="space-y-2"><h1 className="text-2xl font-semibold">{member?`Vincular apoderado de ${member.full_name}`:"Registrar y vincular apoderado"}</h1><p>Vincula un apoderado nuevo o existente a un deportista menor de edad de {group.name}. El apoderado otorga su propio consentimiento.</p></header>
 {!member && <Form method="get" className="flex max-w-xl flex-wrap items-end gap-2"><Field id="athlete-search" label="Buscar deportista por nombre"><Input name="q" defaultValue={search} maxLength={120}/></Field><Button variant="secondary">Buscar</Button></Form>}
 {athletes.length?<GuardianForm key={`${group.id}:${search}:${page}:${member?.membership_id??""}`} groupId={group.id} athletes={athletes} selectedAthleteId={member?.athlete_user_id}/>:<p>No hay deportistas menores activos o pendientes que coincidan en esta página.</p>}
 {!member && <nav aria-label="Páginas de deportistas" className="flex gap-4 underline">{page>1&&<Link href={pageUrl(page-1)}>Anterior</Link>}{total>page*50&&<Link href={pageUrl(page+1)}>Siguiente</Link>}</nav>}
 {member&&<Link className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/members/pending?membership=${member.membership_id}`}>Volver al estado de incorporación</Link>}
 </Page>;
}
