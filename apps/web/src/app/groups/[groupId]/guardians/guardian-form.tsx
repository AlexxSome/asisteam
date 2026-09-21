"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GUARDIANSHIP_ERROR_MESSAGES, guardianshipSchema, type GuardianshipInput } from "@asisteam/core";
import { createGuardianship, type CreateGuardianshipResult } from "./actions";

const fieldClass = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
export function GuardianForm({ groupId, athletes }: { groupId: string; athletes: { user_id: string; full_name: string }[] }) {
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Extract<CreateGuardianshipResult, { guardianshipId: string }>>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GuardianshipInput>({
    resolver: zodResolver(guardianshipSchema), defaultValues: { athlete_user_id: "", full_name: "", email: "", relationship: "" },
  });
  const submit = handleSubmit(async values => {
    setError(undefined);
    try {
      const result = await createGuardianship(groupId, values);
      if ("error" in result) setError(result.error.message);
      else setCreated(result);
    } catch { setError(GUARDIANSHIP_ERROR_MESSAGES.unavailable); }
  });
  if (created) return <section className="space-y-3">
    <p role="status">Apoderado vinculado y agregado al grupo. Las solicitudes pendientes del deportista conservan sus requisitos de consentimiento y aprobación.</p>
    {created.invitation === "sent"
      ? <p>Invitación enviada. El apoderado puede registrarse o acceder con la cuenta del email indicado.</p>
      : <p role="alert">El vínculo quedó guardado, pero no se confirmó el envío del correo. Revisa las invitaciones para reenviar la pendiente o enviar una nueva con rol Apoderado. No repitas el registro del vínculo.</p>}
    <Link href={`/groups/${groupId}/invitations/new`} className="block underline">Revisar invitaciones</Link>
    <Link href={`/groups/${groupId}`} className="inline-flex min-h-11 items-center underline">Volver al grupo</Link>
  </section>;
  return <form className="max-w-xl space-y-4" onSubmit={submit} noValidate>
    <div className="space-y-2"><label htmlFor="guardian-athlete">Deportista menor de edad</label>
      <select id="guardian-athlete" className={fieldClass} aria-invalid={!!errors.athlete_user_id} aria-describedby="guardian-athlete-error" {...register("athlete_user_id")}>
        <option value="">Selecciona un deportista</option>
        {athletes.map(athlete => <option key={athlete.user_id} value={athlete.user_id}>{athlete.full_name}</option>)}
      </select>
      <p id="guardian-athlete-error" className="text-sm text-destructive">{errors.athlete_user_id?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="guardian-name">Nombre completo del apoderado</label>
      <input id="guardian-name" maxLength={120} autoComplete="off" className={fieldClass} aria-invalid={!!errors.full_name} aria-describedby="guardian-name-help guardian-name-error" {...register("full_name")} />
      <p id="guardian-name-help" className="text-sm text-muted-foreground">Si el email ya tiene cuenta, se conserva su perfil. El nombre se usa para cuentas nuevas.</p>
      <p id="guardian-name-error" className="text-sm text-destructive">{errors.full_name?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="guardian-email">Email del apoderado</label>
      <input id="guardian-email" type="email" maxLength={254} autoComplete="off" className={fieldClass} aria-invalid={!!errors.email} aria-describedby="guardian-email-error" {...register("email")} />
      <p id="guardian-email-error" className="text-sm text-destructive">{errors.email?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="guardian-relationship">Vínculo con el menor</label>
      <input id="guardian-relationship" maxLength={40} placeholder="Madre, padre, tutor…" className={fieldClass} aria-invalid={!!errors.relationship} aria-describedby="guardian-relationship-error" {...register("relationship")} />
      <p id="guardian-relationship-error" className="text-sm text-destructive">{errors.relationship?.message}</p>
    </div>
    <p className="text-sm">Se enviará una invitación al email indicado. El apoderado queda agregado al grupo y a los demás grupos donde el pupilo esté activo.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button disabled={isSubmitting} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{isSubmitting ? "Guardando…" : "Registrar y vincular apoderado"}</button>
  </form>;
}
