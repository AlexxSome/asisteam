import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { notFound } from "next/navigation";
import { billingSummarySchema, formatClp, INVOICE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { BillingPanel } from "./billing-panel";
import { ActionLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(new Date(value));
export default async function BillingPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const raw = (await searchParams).page;
  const page = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) notFound();
  const client = await createClient();
  const result = await client.rpc("get_group_billing", { p_group_id: groupId, p_page: page });
  if (result.error?.message === "group_not_found" || result.error?.message === "admin_required") notFound();
  const parsed = billingSummarySchema.safeParse(result.data);
  if (result.error || !parsed.success) return <Alert>No pudimos cargar la suscripción. Recarga la página.</Alert>;
  const billing = parsed.data;
  const subscription = billing.subscription;
  return <><PageHeader title="Suscripción del club">
    <p>{billing.active_athletes.toLocaleString("es-CL")} deportistas activos · {billing.athlete_limit === null ? "Capacidad histórica conservada (500 integrantes en total)" : `${billing.athlete_limit.toLocaleString("es-CL")} cupos habilitados`}</p>
    <p><Badge>{subscription ? SUBSCRIPTION_STATUS_LABELS[subscription.status] : "Sin suscripción"}</Badge></p>
    {subscription?.next_payment_at && <p>Próximo cobro previsto: {date(subscription.next_payment_at)}</p>}
    {subscription && !subscription.activated_at && <p>Los cupos del nuevo plan se habilitarán después del primer pago aprobado.</p>}
    {billing.athlete_limit === 0 && <p>Suscribe un plan para activar deportistas. Puedes configurar el club y gestionar su suscripción.</p>}
    {billing.overdue_amount_clp > 0 && <Alert tone="warning">Monto vencido: {formatClp(billing.overdue_amount_clp)} CLP. Tu acceso e historial se conservan.</Alert>}
  </PageHeader>
  <nav aria-label="Continuar en el grupo" className="flex flex-wrap gap-3">
    <ActionLink href={`/groups/${groupId}`} variant="secondary">Volver al inicio del grupo</ActionLink>
    <ActionLink href={`/groups/${groupId}/settings`} variant="secondary">Continuar configuración</ActionLink>
  </nav>
  <BillingPanel groupId={groupId} billing={billing} />
  <section className="space-y-3" aria-label="Historial de cobros"><h2 className="text-xl font-semibold">Historial de cobros</h2>
    <p className="text-sm">Los estados se consultan a Mercado Pago. Un cobro pendiente se muestra vencido desde el día siguiente a su fecha prevista, en horario de Chile.</p>
    {billing.invoices.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Cobros mensuales del club a Asisteam</caption><thead><tr><th className="p-2">Plan</th><th className="p-2">Fecha prevista</th><th className="p-2">Monto CLP</th><th className="p-2">Estado</th><th className="p-2">Pago</th></tr></thead>
      <tbody>{billing.invoices.map(invoice => <tr key={invoice.id} className="border-t"><td className="p-2">{invoice.plan_name}</td><td className="p-2">{date(invoice.due_at)}</td><td className="p-2">{formatClp(invoice.amount_clp)}</td><td className="p-2"><Badge>{INVOICE_STATUS_LABELS[invoice.status]}</Badge></td><td className="p-2">{invoice.paid_at ? date(invoice.paid_at) : "—"}</td></tr>)}</tbody></table></div> : <EmptyState>Aún no hay cobros en esta página.</EmptyState>}
    <Pagination label="Páginas de cobros" page={page} totalPages={Math.max(page, Math.ceil(billing.total_invoices / 50))}
      previousHref={page > 1 ? `?page=${page - 1}` : undefined}
      nextHref={page * 50 < billing.total_invoices ? `?page=${page + 1}` : undefined} />
  </section></>;
}
