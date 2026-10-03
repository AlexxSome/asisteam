"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClp, type BillingSummary, type SubscriptionRequest } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { manageSubscription } from "./actions";

export function BillingPanel({ groupId, billing }: { groupId: string; billing: BillingSummary }) {
  const router = useRouter();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
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
    setActiveAction(input.action === "checkout" ? input.plan_code : input.action);
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
    <Field id="payer-email" label="Correo de la cuenta de Mercado Pago">
      <Input type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
    </Field>
    <div className="grid gap-3 md:grid-cols-3">{billing.plans.map(plan => {
      const continueCheckout = open && current.plan_code === plan.code && ["CREATING", "PENDING"].includes(current.status);
      const disabled = busy || !email.trim() || (!!open && !continueCheckout);
      return <form key={plan.code} onSubmit={event => { event.preventDefault(); void run({ action: "checkout", group_id: groupId, plan_code: plan.code, payer_email: email }); }} className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{plan.name}</h2><p className="text-xl font-semibold">{formatClp(plan.amount_clp)} CLP/mes</p>
        <p>Hasta {plan.athlete_limit.toLocaleString("es-CL")} deportistas activos.</p>
        <Button type="submit" disabled={disabled} loading={busy && activeAction === plan.code} className="w-full">{continueCheckout ? "Continuar en Mercado Pago" : `Suscribir ${plan.name}`}</Button>
      </form>;
    })}</div>
    <p className="text-sm text-muted-foreground">Confirmarás el cobro recurrente mensual en Mercado Pago. Asisteam no recibe los datos de tu tarjeta. El regreso desde el checkout no confirma un pago.</p>
    {current && <div className="flex flex-wrap gap-3">
      <Button type="button" variant="secondary" disabled={busy} loading={busy && activeAction === "sync"}
        onClick={() => void run({ action: "sync", group_id: groupId })}>Actualizar estado de pago</Button>
      {open && <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancelar renovación</Button>}
    </div>}
    {open && <p className="text-sm">Para cambiar de plan, cancela primero la renovación actual y luego suscribe el nuevo. El nuevo plan inicia un cobro mensual; no hay prorrateo automático.</p>}
    <InlineConfirmation open={confirmCancel} title="Cancelar renovación" confirmLabel="Confirmar cancelación" cancelLabel="Volver"
      destructive busy={busy} onConfirm={() => void run({ action: "cancel", group_id: groupId })}
      onCancel={() => setConfirmCancel(false)} fallbackFocusRef={feedbackRef}>
      ¿Cancelar los próximos cobros? Los pagos y deudas existentes permanecen en el historial.
    </InlineConfirmation>
    {error && <Alert>{error}</Alert>}
    <p ref={feedbackRef} tabIndex={-1} role="status" className="text-small text-muted-foreground">{busy ? "Consultando Mercado Pago…" : feedback}</p>
  </section>;
}
