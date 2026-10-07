import { invitationOperation } from "@/lib/invitations";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { notFound } from "next/navigation";
import { INVITATION_STATUS_LABELS, MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { InvitationFeedback, InvitationForm, ResendInvitationButton } from "./invitation-form";

export const metadata = { title: "Invitaciones del grupo" };
const PAGE_SIZE = 10;
const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" });

export default async function NewInvitationPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const query = await searchParams;
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  const history = query.view === "history" || query.page !== undefined;
  const supabase = await createClient();
  // Proyección ADMIN, RLS por grupo: ni digest ni datos del perfil invitado.
  const result = await invitationOperation(() => supabase.from("invitations")
    .select("id, email, role, status, expires_at, created_at", { count: "exact" })
    .eq("group_id", groupId).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).then(value => ({data:value.error?null:{data:value.data,total:value.count??0},error:value.error})), api => api.listInvitations({params:{groupId},query:{page}}));
  const {data: rows,error} = result;
  const data=rows?.data,count=rows?.total;
  if (error) throw new Error("No pudimos cargar las invitaciones. Vuelve a intentarlo.");
  return <>
    <PageHeader title="Invitaciones del grupo" description="Invita por email o revisa el estado de las invitaciones enviadas." />
    <nav aria-label="Vistas de invitaciones" className="flex flex-wrap gap-3">
      <ActionLink href="?view=new" variant={history ? "secondary" : "primary"} aria-current={!history ? "page" : undefined}>Nueva invitación</ActionLink>
      <ActionLink href="?view=history" variant={history ? "primary" : "secondary"} aria-current={history ? "page" : undefined}>Historial ({count ?? 0})</ActionLink>
    </nav>
    <InvitationFeedback key={history ? "history" : "new"}>
    {!history ? <section className="space-y-4 rounded-lg border p-4" aria-labelledby="new-invitation-heading">
      <h2 id="new-invitation-heading" className="text-h2">Invitar por email</h2>
      <InvitationForm groupId={groupId} />
    </section> : <section aria-labelledby="invitations-heading" className="space-y-4">
      <h2 id="invitations-heading" className="text-xl font-semibold">Historial de invitaciones</h2>
      <p className="text-sm text-muted-foreground">Reenviar invalida el enlace anterior y crea uno nuevo por 7 días. Horarios de Chile.</p>
      {!data?.length ? <EmptyState title={page > 1 ? "No hay invitaciones en esta página" : "Aún no has enviado invitaciones"}
        action={page > 1 ? <ActionLink href="?view=history&page=1" variant="secondary">Volver a la primera página</ActionLink>
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
            {invitation.status === "PENDING" && <ResendInvitationButton groupId={groupId} invitationId={invitation.id} />}
          </li>;
        })}
      </ul>}
      <Pagination label="Páginas de invitaciones" page={page} totalPages={Math.ceil((count ?? 0) / PAGE_SIZE)}
        previousHref={page > 1 ? `?view=history&page=${page - 1}` : undefined}
        nextHref={(count ?? 0) > page * PAGE_SIZE ? `?view=history&page=${page + 1}` : undefined} />
    </section>}
    </InvitationFeedback>
  </>;
}
