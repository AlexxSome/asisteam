"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClp, type BillingSummary, type SubscriptionRequest } from "@asisteam/core";
import { manageSubscription } from "./actions";

export function BillingPanel({ groupId, billing }: { groupId: string; billing: BillingSummary }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const current = billing.subscription;
  const open = current && !["CANCELLED", "FAILED"].includes(current.status);
  async function run(input: SubscriptionRequest) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setFeedback("");
    try {
      const result = await manageSubscription(input);
      if ("error" in result) setError(result.error.message);
      else if (result.checkout_url) window.location.assign(result.checkout_url);
      else { setFeedback("Estado actualizado desde Mercado Pago."); router.refresh(); }
    } catch { setError("No pudimos confirmar la operación. Actualiza el estado antes de volver a intentarlo."); }
    finally { busyRef.current = false; setBusy(false); setConfirmCancel(false); }
  }
  return <section className="space-y-4" aria-label="Planes de Asisteam" aria-busy={busy}>
    <p>Suscripción mensual del club a Asisteam. Todos los planes incluyen las mismas funciones. Administradores, entrenadores y apoderados no consumen cupos de deportistas.</p>
    <p className="text-sm">El primer pago confirmado habilita los cupos. La morosidad y la cancelación conservan el acceso y el historial. Al reducir el plan, los integrantes existentes permanecen; se bloquean nuevas altas si superas el límite.</p>
    <label className="block space-y-1"><span>Correo de la cuenta de Mercado Pago</span><input aria-label="Correo de la cuenta de Mercado Pago" type="email" autoComplete="email" maxLength={254} value={email} disabled={busy}
      onChange={event => setEmail(event.target.value)} className="min-h-11 w-full rounded-md border bg-background px-3" /></label>
    <div className="grid gap-3 md:grid-cols-3">{billing.plans.map(plan => {
      const continueCheckout = open && current.plan_code === plan.code && ["CREATING", "PENDING"].includes(current.status);
      const disabled = busy || !email.trim() || (!!open && !continueCheckout);
      return <form key={plan.code} onSubmit={event => { event.preventDefault(); void run({ action: "checkout", group_id: groupId, plan_code: plan.code, payer_email: email }); }} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{plan.name}</h2><p className="text-xl font-semibold">{formatClp(plan.amount_clp)} CLP/mes</p>
        <p>Hasta {plan.athlete_limit.toLocaleString("es-CL")} deportistas activos.</p>
        <button type="submit" disabled={disabled} className="min-h-11 w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{continueCheckout ? "Continuar en Mercado Pago" : `Suscribir ${plan.name}`}</button>
      </form>;
    })}</div>
    <p className="text-sm text-muted-foreground">Confirmarás el cobro recurrente mensual en Mercado Pago. Asisteam no recibe los datos de tu tarjeta. El regreso desde el checkout no confirma un pago.</p>
    {current && <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void run({ action: "sync", group_id: groupId })} className="min-h-11 rounded-md border px-4 disabled:opacity-50">Actualizar estado de pago</button>
      {open && <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="min-h-11 rounded-md border px-4 disabled:opacity-50">Cancelar renovación</button>}</div>}
    {open && <p className="text-sm">Para cambiar de plan, cancela primero la renovación actual y luego suscribe el nuevo. El nuevo plan inicia un cobro mensual; no hay prorrateo automático.</p>}
    {confirmCancel && <div role="alertdialog" aria-label="Cancelar renovación" className="space-y-3 rounded-md border p-4"><p>¿Cancelar los próximos cobros? Los pagos y deudas existentes permanecen en el historial.</p>
      <button type="button" disabled={busy} onClick={() => void run({ action: "cancel", group_id: groupId })} className="min-h-11 rounded-md border px-4">Confirmar cancelación</button>
      <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className="min-h-11 px-4 underline">Volver</button></div>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{error}</p>}
    <p role="status">{busy ? "Consultando Mercado Pago…" : feedback}</p>
  </section>;
}
