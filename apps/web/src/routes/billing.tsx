import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Alert, ActionLink, Page } from "../ui";
import { Badge } from "../../src/components/ui/badge";
import { EmptyState } from "../../src/components/ui/empty-state";
import { PageHeader } from "../../src/components/ui/page-header";
import { Pagination } from "../components/pagination";
import { formatClp, INVOICE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@asisteam/core/browser";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { BillingPanel } from "../components/billing-panel";
import { pageQuery } from "../capability-data";
const date=(value:string)=>new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",dateStyle:"medium"}).format(new Date(value));
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true),page=pageQuery(request,1000000);
 try{return {groupId:group.id,page,billing:await browserApi(request.signal).getGroupBilling({params:{groupId:group.id},query:{page}})};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {groupId,page,billing}=useLoaderData<typeof loader>();
    const subscription = billing.subscription;
    const plan = billing.plans.find(item => item.code === subscription?.plan_code);
    const available = billing.athlete_limit === null ? null : Math.max(0, billing.athlete_limit - billing.active_athletes);
    const excess = billing.athlete_limit === null ? 0 : Math.max(0, billing.active_athletes - billing.athlete_limit);
    const cancelled = subscription?.status === "CANCELLED";
    return <Page className="max-w-7xl p-0 md:p-0"><title>Suscripción del club · Asisteam</title><PageHeader title="Suscripción del club" description="Plan, cupos habilitados y cobros del club a Asisteam." />
  <section className="space-y-3" aria-label="Resumen de la suscripción actual">
    <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="min-w-0 space-y-2 rounded-lg border border-border bg-surface p-4">
        <dt className="text-small text-muted-foreground">{cancelled || subscription?.status === "FAILED" ? "Último contrato" : "Plan actual"}</dt>
        <dd className="text-h2">{plan?.name ?? "Sin suscripción"}</dd>
        {subscription && plan && <dd>{formatClp(subscription.amount_clp)} {plan.currency}/mes</dd>}
        <dd><Badge>{subscription ? SUBSCRIPTION_STATUS_LABELS[subscription.status] : "Sin contrato"}</Badge></dd>
      </div>
      <div className="min-w-0 space-y-2 rounded-lg border border-border bg-surface p-4">
        <dt className="text-small text-muted-foreground">Capacidad del grupo</dt>
        <dd className="text-h2">{billing.active_athletes.toLocaleString("es-CL")} deportistas activos</dd>
        <dd>{available === null ? "Capacidad histórica conservada (500 integrantes en total)" : `${available.toLocaleString("es-CL")} cupos disponibles de ${billing.athlete_limit!.toLocaleString("es-CL")} habilitados`}</dd>
        <dd className="text-small text-muted-foreground">{available === null ? "El límite histórico incluye todos los roles; no equivale a 500 cupos de deportistas libres." : "Los cupos habilitados se conservan aunque la renovación se cancele o existan cobros vencidos."}</dd>
      </div>
      <div className="min-w-0 space-y-2 rounded-lg border border-border bg-surface p-4">
        <dt className="text-small text-muted-foreground">Renovación</dt>
        <dd className="font-semibold">{cancelled ? "Renovación cancelada" : subscription?.status === "PAUSED" ? "Cobros pausados" : subscription?.next_payment_at ? `Próximo cobro previsto: ${date(subscription.next_payment_at)}` : "Sin próximo cobro confirmado"}</dd>
        <dd className="text-small text-muted-foreground">{cancelled ? "No se renovará este contrato. Los pagos y deudas anteriores permanecen en el historial." : "Un cobro previsto o una autorización no equivalen a un pago aprobado. Revisa el historial de cobros."}</dd>
      </div>
    </dl>
    {subscription && !subscription.activated_at && !cancelled && subscription.status !== "FAILED" && <p>Los cupos del nuevo plan se habilitarán después del primer pago aprobado. Hasta entonces se mantiene la capacidad indicada arriba.</p>}
    {billing.athlete_limit === 0 && !subscription && <p>Elige un plan para activar deportistas después del primer pago aprobado. Puedes configurar el club mientras tanto.</p>}
    {excess > 0 && <Alert tone="warning">Hay {excess.toLocaleString("es-CL")} deportistas sobre el límite habilitado. Los integrantes actuales permanecen; las nuevas altas y reactivaciones están bloqueadas.</Alert>}
    {billing.overdue_amount_clp > 0 && <Alert tone="warning">Monto vencido: {formatClp(billing.overdue_amount_clp)} CLP. Tu acceso e historial se conservan. Cancelar la renovación no paga ni elimina esta deuda.</Alert>}
  </section>
  <nav aria-label="Continuar en el grupo" className="flex flex-wrap gap-3">
    <ActionLink href={`/groups/${groupId}`} variant="secondary">Volver al inicio del grupo</ActionLink>
    <ActionLink href={`/groups/${groupId}/settings`} variant="secondary">Continuar configuración</ActionLink>
  </nav>
  <BillingPanel groupId={groupId} billing={billing}/>
  <section className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6" aria-label="Historial de cobros"><h2 className="text-h2">Historial de cobros</h2>
    <p id="billing-history-help" className="text-small text-muted-foreground">Fechas en horario de Chile (America/Santiago). Un cobro pendiente se muestra vencido desde el día siguiente a su fecha prevista. En pantallas pequeñas, desplaza la tabla horizontalmente para ver todas las columnas.</p>
    {billing.invoices.length ? <div role="region" aria-label="Tabla de cobros" aria-describedby="billing-history-help" tabIndex={0} className="overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      <table className="w-full min-w-[600px] text-left text-small tabular-nums [&_th]:py-3 [&_td]:py-3"><caption className="sr-only">Cobros mensuales del club a Asisteam</caption><thead className="bg-neutral-subtle"><tr><th scope="col" className="p-2">Plan</th><th scope="col" className="p-2">Fecha prevista</th><th scope="col" className="p-2">Monto CLP</th><th scope="col" className="p-2">Estado</th><th scope="col" className="p-2">Fecha de pago</th></tr></thead>
      <tbody>{billing.invoices.map(invoice => <tr key={invoice.id} className="border-t"><th scope="row" className="p-2 font-normal">{invoice.plan_name}</th><td className="whitespace-nowrap p-2"><time dateTime={invoice.due_at}>{date(invoice.due_at)}</time></td><td className="whitespace-nowrap p-2">{formatClp(invoice.amount_clp)}</td><td className="p-2"><Badge>{INVOICE_STATUS_LABELS[invoice.status]}</Badge></td><td className="whitespace-nowrap p-2">{invoice.paid_at ? <time dateTime={invoice.paid_at}>{date(invoice.paid_at)}</time> : "Sin pago confirmado"}</td></tr>)}</tbody></table></div> : <EmptyState>{billing.total_invoices === 0 ? "Aún no hay cobros registrados. Volver del checkout no confirma un pago." : "No hay cobros en esta página. Usa la paginación para revisar el historial."}</EmptyState>}
    <Pagination label="Páginas de cobros" page={page} totalPages={Math.max(page, Math.ceil(billing.total_invoices / 50))} previousHref={page > 1 ? `?page=${page - 1}` : undefined} nextHref={page * 50 < billing.total_invoices ? `?page=${page + 1}` : undefined}/>
  </section></Page>;
}
