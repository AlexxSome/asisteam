import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { RouterLink as Link } from "../navigation";
import { Page } from "../ui";
import { MembershipProgress } from "../components/membership-review";
import { AccountActivationConsent,ManagedConsentForm,ConsentFeedback } from "../components/consent-form";
import { httpSchemas } from "@asisteam/core/browser";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),query=new URL(request.url).searchParams;
 if(!group.roles.includes("GUARDIAN"))throw new Response(null,{status:403});
 const parsed=httpSchemas.OnboardingQuery.safeParse({group_id:group.id,as_guardian:true,athlete_user_id:query.get("athlete")??undefined,page:query.get("page")?Number(query.get("page")):1});
 if(!parsed.success)throw new Response(null,{status:404});
 const {page,athlete_user_id:athlete}=parsed.data;
 try{
 const api=browserApi(request.signal);
 const [onboarding,activation]=await Promise.all([api.listMembershipOnboarding({query:{...parsed.data,page:athlete?1:page}}),api.listManagedActivations({params:{groupId:group.id},query:{page,athlete_user_id:athlete}})]);
 if(athlete && !onboarding.data.length)throw new Response(null,{status:404});
 return {group,page,query:{athlete},data:onboarding.data,activations:activation.data};
 }catch(error){return sessionError(error,request);}
}
export function Component(){const {group,page,query,data,activations}=useLoaderData<typeof loader>();
    return <Page><title>Consentimientos de mis pupilos · Asisteam</title>
    <h1 className="text-2xl font-semibold">Consentimientos de mis pupilos</h1>
    <h2 className="text-xl font-semibold">Participación en {group.name}{query.athlete && data[0] ? ` · ${data[0].full_name}` : ""}</h2>
    <p>El consentimiento de datos, la membresía activa, el acceso con contraseña y la autorización de imagen son decisiones diferentes.</p>
    <ConsentFeedback key={`${group.id}:${query.athlete??""}:${page}`}>
    {!data.some(ward => ward.can_consent) && <p>No tienes consentimientos de datos pendientes en esta página.</p>}
    {data.map(ward => <section key={ward.membership_id} className="space-y-3">
      {ward.can_consent ? <ManagedConsentForm membershipId={ward.membership_id} billingGroupId={group.access === "admin" ? group.id : undefined} fullName={ward.full_name} relationship={ward.relationship ?? ""} managedEnrollment={ward.requires_managed_consent}/>
                : <><h3 className="text-lg font-semibold">{ward.full_name}</h3><MembershipProgress groupId={group.id} member={ward} audience="guardian"/></>}
    </section>)}
    <h2 className="text-xl font-semibold">Activación de cuentas propias</h2>
    {!activations?.length && <p>No tienes solicitudes de activación en esta página.</p>}
    {activations?.map(ward => <AccountActivationConsent key={ward.request_id} requestId={ward.request_id} fullName={ward.full_name} relationship={ward.relationship} approved={ward.status === "APPROVED"}/>)}
    </ConsentFeedback>
    <nav aria-label="Páginas de consentimientos" className="flex gap-4 underline">
      {page > 1 && <Link href={`?${new URLSearchParams({ page: String(page - 1), ...(query.athlete ? { athlete: query.athlete } : {}) })}`}>Anterior</Link>}
      {Math.max(data?.[0]?.total_count ?? 0, activations?.[0]?.total_count ?? 0) > page * 50 && <Link href={`?${new URLSearchParams({ page: String(page + 1), ...(query.athlete ? { athlete: query.athlete } : {}) })}`}>Siguiente</Link>}
    </nav>
    <p className="text-sm">La autorización de imagen se revisa por separado en <Link className="underline" href="/profile">Mi perfil</Link>.</p>
    <Link className="inline-flex min-h-11 items-center underline" href={query.athlete ? `/wards/${query.athlete}` : "/wards"}>Volver a mis pupilos</Link>
  </Page>;
}
