"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatClp, subscriptionRequestSchema, type BillingSummary, type SubscriptionRequest } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { manageSubscription } from "./actions";

export function BillingPanel({ groupId, billing }: { groupId: string; billing: BillingSummary }) {
  const router = useRouter();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [activeAction, setActiveAction] = useState<SubscriptionRequest["action"] | null>(null);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<"checkout" | "cancel" | null>(null);
  const current = billing.subscription;
  const open = current !== null && !["CANCELLED", "FAILED"].includes(current.status);
  const resumable = open && ["CREATING", "PENDING"].includes(current.status);
  const [selectedCode, setSelectedCode] = useState<string | null>(resumable ? current.plan_code : null);
  const selectedPlan = billing.plans.find(plan => plan.code === selectedCode);
  const selectedAllowed = !!selectedPlan && (!open || (resumable && selectedPlan.code === current.plan_code));
  const busy = processing || refreshing || redirecting;
  const checkoutInput = selectedPlan ? subscriptionRequestSchema.safeParse({ action: "checkout", group_id: groupId,
    plan_code: selectedPlan.code, payer_email: email }) : null;
  const checkoutReason = busy ? "Hay una operación en curso. Espera a que termine."
    : verificationRequired ? "Actualiza el estado de pago antes de volver a continuar."
    : !selectedAllowed ? "Cancela la renovación del contrato en curso antes de elegir otro plan."
    : !checkoutInput?.success ? "Ingresa un correo válido de Mercado Pago para continuar." : null;
  const selectedAmount = resumable && selectedPlan?.code === current.plan_code ? current.amount_clp : selectedPlan?.amount_clp;

  useEffect(() => {
    function resume(event: PageTransitionEvent) {
      if (event.persisted && redirecting) {
        setRedirecting(false);
        setVerificationRequired(true);
      }
    }
    // Browser Back may restore the checkout's disabled state from the page cache.
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, [redirecting]);

  async function run(input: SubscriptionRequest) {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setActiveAction(input.action); setProcessing(true); setError(null); setFeedback("");
    try {
      const result = await manageSubscription(input);
      if ("error" in result) {
        if (input.action === "sync" && result.error.code === "subscription_not_found") {
          setVerificationRequired(false);
          setFeedback("No hay una suscripción para actualizar. Puedes revisar el plan e iniciar el checkout.");
        } else setError(result.error.message);
        if (input.action === "checkout" && ["checkout_uncertain", "billing_unavailable"].includes(result.error.code)) {
          setVerificationRequired(true);
        }
        // A failed response may still have reserved a contract; read its real state.
        startRefresh(() => router.refresh());
      } else if (result.checkout_url) {
        setRedirecting(true);
        window.location.assign(result.checkout_url);
      } else {
        setVerificationRequired(false);
        setFeedback(input.action === "cancel"
          ? "Renovación cancelada. Los cupos habilitados, el acceso y el historial se conservan. Las deudas existentes no se eliminan."
          : "Estado consultado en Mercado Pago. Revisa el estado del contrato y de cada cobro; actualizar no equivale a un pago aprobado.");
        startRefresh(() => router.refresh());
      }
    } catch {
      setRedirecting(false);
      if (input.action === "checkout") setVerificationRequired(true);
      setError("No pudimos confirmar la operación. Actualiza el estado de pago antes de volver a intentarlo.");
    } finally {
      busyRef.current = false; setProcessing(false); setConfirmation(null);
    }
  }

  return <section className="space-y-6" aria-label="Planes de Asisteam" aria-busy={busy}>
    <section className="space-y-3" aria-label="Estado del pago y renovación">
      <Alert tone="info">
        <p className="font-semibold">{verificationRequired || (open && !current.activated_at) ? "Pago pendiente de verificación" : "Verificación de pagos"}</p>
        <p>Si volviste de Mercado Pago, actualiza el estado. El regreso desde el checkout no confirma un pago ni habilita cupos.</p>
        {open && !current.activated_at && <p>El primer pago aprobado por el proveedor habilitará los cupos del plan.</p>}
      </Alert>
      {(current || verificationRequired) && <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={busy} loading={busy && activeAction === "sync"}
            aria-describedby="billing-management-help" onClick={() => void run({ action: "sync", group_id: groupId })}>Actualizar estado de pago</Button>
          {open && <Button type="button" variant="secondary" disabled={busy} aria-describedby="billing-cancel-help billing-management-help"
            onClick={() => setConfirmation("cancel")}>Cancelar renovación</Button>}
        </div>
        <p id="billing-management-help" className="text-small text-muted-foreground">{busy ? "Hay una operación en curso. Espera a que termine." : "Actualizar consulta al proveedor; no inicia un cobro."}</p>
        {open && <p id="billing-cancel-help" className="text-small">Cancelar detiene los próximos cobros; no paga ni elimina deudas existentes. Para cambiar de plan, cancela primero la renovación y suscribe el nuevo plan, con un nuevo ciclo mensual y sin prorrateo automático.</p>}
      </div>}
      <InlineConfirmation open={confirmation === "cancel"} title="Cancelar renovación" confirmLabel="Confirmar cancelación" cancelLabel="Volver"
        destructive busy={busy} onConfirm={() => void run({ action: "cancel", group_id: groupId })}
        onCancel={() => setConfirmation(null)} fallbackFocusRef={feedbackRef}>
        ¿Cancelar los próximos cobros? Los cupos habilitados y el acceso se conservan. Los pagos y deudas existentes permanecen en el historial; esta acción no paga una deuda.
      </InlineConfirmation>
      {error && <Alert>{error}</Alert>}
      <p ref={feedbackRef} tabIndex={-1} role="status" className="text-small text-muted-foreground">
        {redirecting ? "Abriendo el checkout seguro de Mercado Pago…" : busy ? "Consultando Mercado Pago y actualizando el estado…" : feedback}
      </p>
    </section>

    <section className="space-y-3" aria-labelledby="billing-plans-title">
      <h2 id="billing-plans-title" className="text-h2">1. Elige un plan</h2>
      <p>Suscripción mensual del club a Asisteam. Todos los planes incluyen las mismas funciones. Administradores, entrenadores y apoderados no consumen cupos de deportistas.</p>
      <div className="grid gap-3 lg:grid-cols-3">{billing.plans.map(plan => {
        const isCurrent = current?.plan_code === plan.code;
        const canSelect = !open || (resumable && isCurrent);
        const selected = selectedCode === plan.code;
        const reason = busy ? "Hay una operación en curso. Espera a que termine."
          : verificationRequired ? "Actualiza el estado de pago antes de continuar."
          : !canSelect ? isCurrent ? "Este plan tiene un contrato en curso. Gestiona su renovación arriba." : "Cancela primero la renovación del contrato en curso."
          : resumable && isCurrent ? "Continúa el checkout del contrato existente. No se crea una segunda suscripción."
          : "Selecciona este plan para revisar el correo y el resumen antes del checkout.";
        return <article key={plan.code} className={`flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${selected ? "border-primary bg-secondary" : "border-border bg-surface"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h3">{plan.name}</h3>
            {isCurrent && <Badge>{open ? "Contrato actual" : "Último contrato"}</Badge>}
          </div>
          <p className="text-xl font-semibold">{formatClp(plan.amount_clp)} {plan.currency}/mes</p>
          <p>Hasta {plan.athlete_limit.toLocaleString("es-CL")} deportistas activos.</p>
          <div className="mt-auto space-y-2">
            <Button type="button" variant={selected ? "primary" : "secondary"} disabled={busy || verificationRequired || !canSelect}
              aria-pressed={selected} aria-describedby={`plan-${plan.code}-help`} className="w-full"
              onClick={() => { setSelectedCode(plan.code); setConfirmation(null); setEmailTouched(false); }}>
              {selected ? `${plan.name} seleccionado` : `Seleccionar ${plan.name}`}
            </Button>
            <p id={`plan-${plan.code}-help`} className="text-small text-muted-foreground">{reason}</p>
          </div>
        </article>;
      })}</div>
    </section>

    {selectedPlan && selectedAllowed && <form className="space-y-4 rounded-lg border border-border bg-surface p-4" aria-labelledby="billing-checkout-title"
      onSubmit={event => {
        event.preventDefault();
        if (checkoutReason || !checkoutInput?.success || busyRef.current) return;
        setConfirmation("checkout");
      }}>
      <h2 id="billing-checkout-title" className="text-h2">2. Revisa y continúa</h2>
      <Field id="payer-email" label="Correo de la cuenta de Mercado Pago"
        help={resumable ? "Ingresa el correo para continuar. Retomar un contrato conserva la cuenta con la que se creó en Mercado Pago." : "Usa el correo de la cuenta con la que autorizarás la suscripción."}
        error={emailTouched && !checkoutInput?.success ? "Ingresa un correo válido de Mercado Pago." : undefined}>
        <Input ref={emailRef} type="email" required autoComplete="email" maxLength={254} value={email} disabled={busy}
          onBlur={() => setEmailTouched(true)} onChange={event => { setEmail(event.target.value); setConfirmation(null); }} />
      </Field>
      <div className="space-y-2 rounded-md bg-background p-3" aria-label="Resumen de la suscripción">
        <p className="font-semibold">{selectedPlan.name} · {formatClp(selectedAmount!)} {selectedPlan.currency}/mes</p>
        <p>{resumable ? "Continuarás el contrato existente con su importe contratado." : `Hasta ${selectedPlan.athlete_limit.toLocaleString("es-CL")} deportistas activos después del primer pago aprobado.`}</p>
        <p className="text-small">Cobro recurrente mensual. Sin prorrateo automático. La morosidad y la cancelación conservan el acceso, los cupos habilitados y el historial. Al reducir el plan, los integrantes existentes permanecen; se bloquean nuevas altas si superas el límite.</p>
      </div>
      <Button type="submit" disabled={!!checkoutReason || confirmation === "checkout"} loading={busy && activeAction === "checkout"}
        aria-describedby="checkout-help">Revisar y continuar</Button>
      <p id="checkout-help" className="text-small text-muted-foreground">{checkoutReason ?? (confirmation === "checkout" ? "Revisa la confirmación antes de abrir Mercado Pago." : "Revisa el plan y el correo. Confirmarás el cobro recurrente en Mercado Pago; Asisteam no recibe los datos de tu tarjeta.")}</p>
      <InlineConfirmation open={confirmation === "checkout"} title="Continuar a Mercado Pago" confirmLabel="Ir a Mercado Pago" cancelLabel="Volver al resumen"
        busy={busy} disabled={!!checkoutReason} onCancel={() => setConfirmation(null)} fallbackFocusRef={emailRef}
        onConfirm={() => { if (!checkoutReason && checkoutInput?.success) void run(checkoutInput.data); }}>
        {selectedPlan.name} por {formatClp(selectedAmount!)} {selectedPlan.currency} al mes. {resumable ? "Retomarás el contrato existente con su cuenta de Mercado Pago." : `Autorizarás una suscripción mensual con la cuenta ${email.trim()}.`} Solo un pago aprobado habilita los cupos.
      </InlineConfirmation>
    </form>}
  </section>;
}
