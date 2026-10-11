import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { RouterLink as Link } from "../navigation";
import { Page, ActionLink } from "../ui";
import { EmptyState } from "../../../web/src/components/ui/empty-state";
import { Pagination } from "../components/pagination";
import { INVITATION_STATUS_LABELS,MEMBERSHIP_ROLE_LABELS,httpSchemas } from "@asisteam/core/browser";
import { InvitationFeedback,InvitationForm,ResendInvitationButton } from "../components/invitation-form";
const PAGE_SIZE=10;
const dateFormat=new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Santiago"});
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true),query=new URL(request.url).searchParams;
 const parsed=httpSchemas.InvitationQuery.safeParse({page:query.get("page")?Number(query.get("page")):1});
 if(!parsed.success)throw new Response(null,{status:404});
 try {const result=await browserApi(request.signal).listInvitations({params:{groupId:group.id},query:parsed.data});return {groupId:group.id,page:parsed.data.page,history:query.get("view")==="history"||query.has("page"),data:result.data,count:result.total};}catch(error){return sessionError(error,request);}
}
export function Component(){const {groupId,page,history,data,count}=useLoaderData<typeof loader>();
    return <Page><title>Invitaciones del grupo · Asisteam</title>
    <header className="space-y-2"><h1 className="text-h1">Invitaciones del grupo</h1><p>Invita por email o revisa el estado de las invitaciones enviadas.</p></header>
    <nav aria-label="Vistas de invitaciones" className="flex flex-wrap gap-3">
      <ActionLink href="?view=new" variant={history ? "secondary" : "primary"} aria-current={!history ? "page" : undefined}>Nueva invitación</ActionLink>
      <ActionLink href="?view=history" variant={history ? "primary" : "secondary"} aria-current={history ? "page" : undefined}>Historial ({count ?? 0})</ActionLink>
    </nav>
    <InvitationFeedback key={`${groupId}:${history ? "history" : "new"}`}>
    {!history ? <section className="space-y-4 rounded-lg border p-4" aria-labelledby="new-invitation-heading">
      <h2 id="new-invitation-heading" className="text-h2">Invitar por email</h2>
      <InvitationForm groupId={groupId}/>
    </section> : <section aria-labelledby="invitations-heading" className="space-y-4">
      <h2 id="invitations-heading" className="text-xl font-semibold">Historial de invitaciones</h2>
      <p className="text-sm text-muted-foreground">Reenviar invalida el enlace anterior y crea uno nuevo por 7 días. Horarios de Chile.</p>
      {!data?.length ? <EmptyState title={page > 1 ? "No hay invitaciones en esta página" : "Aún no has enviado invitaciones"} action={page > 1 ? <ActionLink href="?view=history&page=1" variant="secondary">Volver a la primera página</ActionLink>
                    : <ActionLink href="?view=new#invitation-email" variant="secondary">Preparar una invitación</ActionLink>}>
        {page > 1 ? "Vuelve al inicio para consultar las invitaciones del grupo." : "Completa el email y el rol en el formulario para invitar a una persona."}
      </EmptyState> : <ul className="space-y-3">
        {data.map(invitation => {
                    const status = invitation.status === "PENDING" && new Date(invitation.expires_at).getTime() <= Date.now() ? "EXPIRED" : invitation.status;
                    return <li key={invitation.id} className="min-w-0 space-y-3 rounded-md border p-4">
            <div className="min-w-0 space-y-1">
              <p className="break-all font-medium">{invitation.email ?? "Destinatario vinculado"}</p>
              <p>{MEMBERSHIP_ROLE_LABELS[invitation.role as "ATHLETE" | "GUARDIAN"]} · {INVITATION_STATUS_LABELS[status]}</p>
              <p className="text-sm text-muted-foreground">Vence: <time dateTime={invitation.expires_at}>{dateFormat.format(new Date(invitation.expires_at))}</time></p>
            </div>
            {invitation.status === "PENDING" && <ResendInvitationButton groupId={groupId} invitationId={invitation.id}/>}
          </li>;
                })}
      </ul>}
      <Pagination label="Páginas de invitaciones" page={page} totalPages={Math.ceil((count ?? 0) / PAGE_SIZE)} previousHref={page > 1 ? `?view=history&page=${page - 1}` : undefined} nextHref={(count ?? 0) > page * PAGE_SIZE ? `?view=history&page=${page + 1}` : undefined}/>
    </section>}
    </InvitationFeedback>
  </Page>;
}
