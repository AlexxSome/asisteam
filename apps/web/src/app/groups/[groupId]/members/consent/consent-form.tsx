"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MANAGED_CONSENT_TERMS_VERSION } from "@asisteam/core";
import { consentManagedMember } from "./actions";

export function ManagedConsentForm({ membershipId, fullName, relationship }: { membershipId: string; fullName: string; relationship: string }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  return <form className="space-y-4 rounded-md border p-5" onSubmit={async event => {
    event.preventDefault(); setPending(true); setError(undefined);
    try {
      const result = await consentManagedMember({ membership_id: membershipId, accepted });
      if ("error" in result) setError(result.error.message);
      else { setDone(true); router.refresh(); }
    } catch { setError("No pudimos confirmar el consentimiento. Vuelve a intentarlo."); }
    finally { setPending(false); }
  }}>
    <h2 className="text-lg font-semibold">{fullName}</h2>
    <p>Vínculo registrado: {relationship}</p>
    {done ? <p role="status">Consentimiento registrado. Tu pupilo ya está activo en el grupo.</p> : <>
      <p>Autorizas a Asisteam a tratar el nombre, fecha de nacimiento e historial de asistencia de tu pupilo para gestionar su participación en el grupo. La cuenta permanece gestionada, sin credenciales propias. Esta autorización no habilita fotos ni la activación de una cuenta con contraseña.</p>
      <p className="text-sm text-muted-foreground">Versión del consentimiento: {MANAGED_CONSENT_TERMS_VERSION}. Puedes solicitar la revocación a soporte.</p>
      <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        Confirmo que soy apoderado de {fullName} y autorizo el tratamiento de sus datos para este fin.
      </label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <button disabled={!accepted || pending} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
        {pending ? "Guardando…" : "Consentir y activar al deportista"}
      </button>
    </>}
  </form>;
}
