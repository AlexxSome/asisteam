import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { RouterLink as Link } from "../navigation";
import { Page } from "../ui";
import { MembershipReview } from "../components/membership-review";
import { httpSchemas } from "@asisteam/core/browser";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true), query=new URL(request.url).searchParams;
 const parsed=httpSchemas.OnboardingQuery.safeParse({group_id:group.id,membership_id:query.get("membership")??undefined,page:query.get("page")?Number(query.get("page")):1});
 if(!parsed.success)throw new Response(null,{status:404});
 try{return {group,page:parsed.data.page,membership:parsed.data.membership_id,data:(await browserApi(request.signal).listMembershipOnboarding({query:parsed.data})).data};}catch(error){return sessionError(error,request);}
}
export function Component(){const {group,page,membership,data}=useLoaderData<typeof loader>();
    return <Page><title>Aprobaciones · Asisteam</title>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Aprobaciones</h1>
      <p>Revisa las incorporaciones pendientes de {group.name}. Los menores requieren apoderado vinculado y consentimiento vigente.</p></header>
    {!data?.length && <p>No hay incorporaciones pendientes en esta página.</p>}
    {data?.map(member => <MembershipReview key={member.membership_id} groupId={group.id} member={member}/>)}
    <nav aria-label="Páginas de aprobaciones" className="flex gap-4 underline">
      {page > 1 && <Link href={`?${new URLSearchParams({page:String(page-1),...(membership?{membership}:{})})}`}>Anterior</Link>}
      {(data?.[0]?.total_count ?? 0) > page * 50 && <Link href={`?${new URLSearchParams({page:String(page+1),...(membership?{membership}:{})})}`}>Siguiente</Link>}
    </nav>
    {membership && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/members/pending`}>Ver todas las incorporaciones pendientes</Link>}
    <Link className="underline" href={`/groups/${group.id}/members`}>Volver a integrantes</Link>
  </Page>;
}
