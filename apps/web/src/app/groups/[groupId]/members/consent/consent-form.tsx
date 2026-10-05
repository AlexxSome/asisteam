"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionLink } from "@/components/ui/button";
import { SUPPORT_EMAIL, SUPPORT_REQUEST_URLS } from "@/lib/support";
import { CapacityError } from "@/components/group-capacity";
import { INVITATION_TERMS_VERSION, MANAGED_CONSENT_TERMS_VERSION } from "@asisteam/core";
import { consentManagedMember, reviewManagedActivation } from "./actions";

export function AccountActivationConsent({ requestId, fullName, relationship, approved }: {
  requestId: string; fullName: string; relationship: string; approved: boolean;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [approvalRecorded, setApprovalRecorded] = useState(false);
  const isApproved = approved || approvalRecorded;
  async function review(approve: boolean) {
    setPending(true); setError(undefined);
    try {
      const result = await reviewManagedActivation({ request_id: requestId, accepted: approve });
      if ("error" in result) {
        if (result.approvalRecorded) setApprovalRecorded(true);
        setError(result.error.message);
      }
      else {
        setDone(approve ? "Consentimiento registrado e invitación enviada. Tu pupilo debe crear su contraseña y aceptar las condiciones para activar su cuenta."
          : "Solicitud rechazada. La cuenta de tu pupilo sigue gestionada.");
        router.refresh();
      }
    } catch { setError("No pudimos confirmar la decisión. Vuelve a intentarlo."); }
    finally { setPending(false); }
  }
  return <section className="space-y-4 rounded-md border p-5" aria-label={`Activación de ${fullName}`}>
    <h3 className="text-lg font-semibold">{fullName}</h3><p>Vínculo registrado: {relationship}</p>
    {done ? <p role="status">{done}</p> : <>
      <p>El administrador solicita que tu pupilo use una cuenta con email y contraseña propios. Al autorizar, se enviará un enlace a su email registrado. Su historial y tu acceso como apoderado se conservan hasta que cumpla 18 años.</p>
      <p className="text-sm text-muted-foreground">Esta autorización es específica para activar la cuenta. Versión: {INVITATION_TERMS_VERSION}.</p>
      {isApproved ? <p>Ya autorizaste la activación. Puedes volver a enviar la invitación si tu pupilo aún no la recibió.</p> :
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0" disabled={pending} checked={accepted} onChange={event => setAccepted(event.target.checked)} />Autorizo que {fullName} active su cuenta con credenciales propias.</label>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={pending || (!accepted && !isApproved)} onClick={() => review(true)} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{pending ? "Procesando…" : isApproved ? "Enviar de nuevo la activación" : "Autorizar y enviar activación"}</button>
        {!isApproved && <button disabled={pending} onClick={() => review(false)} className="min-h-11 rounded-md border px-4 py-2">Rechazar solicitud</button>}
      </div>
    </>}
  </section>;
}

export function ManagedConsentForm({ membershipId, fullName, relationship, billingGroupId, managedEnrollment = true }: { membershipId: string; fullName: string; relationship: string; billingGroupId?: string; managedEnrollment?: boolean }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [done, setDone] = useState<"ACTIVE" | "PENDING">();
  return <form className="space-y-4 rounded-md border p-5" onSubmit={async event => {
    event.preventDefault(); setPending(true); setError(undefined); setErrorCode(undefined);
    try {
      const result = await consentManagedMember({ membership_id: membershipId, accepted });
      if ("error" in result) { setError(result.error.message); setErrorCode(result.error.code); }
      else { setDone(result.membershipStatus); router.refresh(); }
    } catch { setError("No pudimos confirmar el consentimiento. Vuelve a intentarlo."); }
    finally { setPending(false); }
  }}>
    <h2 className="text-lg font-semibold">{fullName}</h2>
    <p>Vínculo registrado: {relationship}</p>
    {done ? <p role="status">{done === "ACTIVE" ? "Consentimiento registrado. Tu pupilo ya está activo en el grupo; su cuenta sigue gestionada." : "Consentimiento registrado. Falta la aprobación del administrador para activar su membresía. No repitas el alta."}</p> : <>
      <p>Autorizas a Asisteam a tratar el nombre, fecha de nacimiento e historial de asistencia de tu pupilo para gestionar su participación en el grupo. {managedEnrollment ? "La cuenta permanece gestionada, sin credenciales propias. La membresía se activa si hay cupo." : "La incorporación por código queda pendiente de aprobación del administrador después de consentir."} Esta autorización no habilita fotos ni la activación de una cuenta con contraseña.</p>
      <p className="text-sm text-muted-foreground">Versión del consentimiento: {MANAGED_CONSENT_TERMS_VERSION}.</p>
      <div className="space-y-2">
        <ActionLink href={SUPPORT_REQUEST_URLS.revocation}>Solicitar revocación a soporte</ActionLink>
        <p className="break-words text-small text-muted-foreground">Se abrirá tu correo para escribir a {SUPPORT_EMAIL}. Debes enviar la solicitud; abrir el enlace no revoca el consentimiento. No incluyas datos sensibles del menor en el primer mensaje.</p>
      </div>
      <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        Confirmo que soy apoderado de {fullName} y autorizo el tratamiento de sus datos para este fin.
      </label>
      {error && <CapacityError error={{ code: errorCode, message: error }} groupId={billingGroupId} />}
      <button disabled={!accepted || pending} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
        {pending ? "Guardando…" : managedEnrollment ? "Consentir y activar membresía" : "Guardar consentimiento de datos"}
      </button>
    </>}
  </form>;
}
