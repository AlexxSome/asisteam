import Link from "next/link";
import { notFound } from "next/navigation";
import { INVITATION_STATUS_LABELS, MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { InvitationFeedback, InvitationForm, ResendInvitationButton } from "./invitation-form";

export const metadata = { title: "Invitar por email" };
const PAGE_SIZE = 50;
const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" });

export default async function NewInvitationPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const query = await searchParams;
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  const supabase = await createClient();
  // Proyección ADMIN, RLS por grupo: ni digest ni datos del perfil invitado.
  const { data, error, count } = await supabase.from("invitations")
    .select("id, email, role, status, expires_at, created_at", { count: "exact" })
    .eq("group_id", groupId).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("No pudimos cargar las invitaciones. Vuelve a intentarlo.");
  return <>
    <h1 className="text-2xl font-semibold">Invitar por email</h1>
    <InvitationFeedback>
    <InvitationForm groupId={groupId} />
    <section aria-labelledby="invitations-heading" className="space-y-4 border-t pt-6">
      <h2 id="invitations-heading" className="text-xl font-semibold">Invitaciones del grupo</h2>
      <p className="text-sm text-muted-foreground">Reenviar invalida el enlace anterior y crea uno nuevo por 7 días. Horarios de Chile.</p>
      {!data?.length ? <p>No hay invitaciones en esta página.</p> : <ul className="space-y-3">
        {data.map(invitation => {
          const status = invitation.status === "PENDING" && new Date(invitation.expires_at).getTime() <= Date.now() ? "EXPIRED" : invitation.status;
          return <li key={invitation.id} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-all font-medium">{invitation.email ?? "Destinatario vinculado"}</p>
              <p>{MEMBERSHIP_ROLE_LABELS[invitation.role as "ATHLETE" | "GUARDIAN"]} · {INVITATION_STATUS_LABELS[status]}</p>
              <p className="text-sm text-muted-foreground">Vence: <time dateTime={invitation.expires_at}>{dateFormat.format(new Date(invitation.expires_at))}</time></p>
            </div>
            {invitation.status === "PENDING" && <ResendInvitationButton groupId={groupId} invitationId={invitation.id} />}
          </li>;
        })}
      </ul>}
      <nav aria-label="Páginas de invitaciones" className="flex gap-4 text-sm underline">
        {page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}
        {(count ?? 0) > page * PAGE_SIZE && <Link href={`?page=${page + 1}`}>Siguiente</Link>}
      </nav>
    </section>
    </InvitationFeedback>
  </>;
}
