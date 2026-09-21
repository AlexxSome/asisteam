"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isMinor, MANAGED_MEMBER_ERROR_MESSAGES, managedMemberSchema, type ManagedMemberInput } from "@asisteam/core";
import { createManagedMember, type CreateManagedMemberResult } from "./actions";

const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";
export function ManagedMemberForm({ groupId }: { groupId: string }) {
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Extract<CreateManagedMemberResult, { member: unknown }>>();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ManagedMemberInput>({
    resolver: zodResolver(managedMemberSchema), shouldUnregister: true,
    defaultValues: { full_name: "", birthdate: "", email: "" },
  });
  const minor = isMinor(watch("birthdate"));
  const submit = handleSubmit(async values => {
    setError(undefined);
    try {
      const result = await createManagedMember(groupId, values);
      if ("error" in result) setError(result.error.message);
      else setCreated(result);
    } catch { setError(MANAGED_MEMBER_ERROR_MESSAGES.unavailable); }
  });
  if (created) return <section className="space-y-4">
    <p role="status">{created.member.membership_status === "ACTIVE"
      ? "Cuenta gestionada creada. El deportista ya aparece en la toma de asistencia."
      : "Perfil del menor guardado, pendiente del consentimiento de su apoderado. Aparecerá en asistencia cuando el apoderado lo otorgue."}</p>
    {created.guardianInvitation === "sent" && <p>Invitación enviada al apoderado. Tras aceptarla, debe abrir «Consentimientos de mis pupilos» en el grupo.</p>}
    {created.guardianInvitation === "retry_required" && <p role="alert">El perfil quedó guardado, pero no se confirmó el envío al apoderado. Revisa las invitaciones y reenvía la pendiente o envía una nueva con rol Apoderado al email indicado. No repitas el alta.</p>}
    {created.member.membership_status === "PENDING" && <Link className="block underline" href={`/groups/${groupId}/invitations/new`}>Revisar invitaciones del apoderado</Link>}
    <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}`}>Volver al grupo</Link>
  </section>;
  return <form onSubmit={submit} className="max-w-xl space-y-4" noValidate>
    <div className="space-y-2"><label htmlFor="managed-name">Nombre completo</label>
      <input id="managed-name" autoComplete="off" maxLength={120} className={fieldClass}
        aria-invalid={!!errors.full_name} aria-describedby="managed-name-error" {...register("full_name")} />
      <p id="managed-name-error" className="text-sm text-destructive">{errors.full_name?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="managed-birthdate">Fecha de nacimiento</label>
      <input id="managed-birthdate" type="date" className={fieldClass}
        aria-invalid={!!errors.birthdate} aria-describedby="managed-birthdate-error" {...register("birthdate")} />
      <p id="managed-birthdate-error" className="text-sm text-destructive">{errors.birthdate?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="managed-email">Email (opcional)</label>
      <input id="managed-email" type="email" autoComplete="off" maxLength={254} className={fieldClass}
        aria-invalid={!!errors.email} aria-describedby="managed-email-error" {...register("email")} />
      <p id="managed-email-error" className="text-sm text-destructive">{errors.email?.message}</p>
    </div>
    {minor && <fieldset className="space-y-4 rounded-md border p-4">
      <legend className="px-1 font-semibold">Apoderado del menor</legend>
      <p className="text-sm">El menor queda pendiente hasta que su apoderado acepte la invitación y autorice el tratamiento de sus datos.</p>
      <div className="space-y-2"><label htmlFor="guardian-name">Nombre completo del apoderado</label>
        <input id="guardian-name" className={fieldClass} maxLength={120} aria-invalid={!!errors.guardian?.full_name}
          aria-describedby="guardian-name-error" {...register("guardian.full_name")} />
        <p id="guardian-name-error" className="text-sm text-destructive">{errors.guardian?.full_name?.message}</p>
      </div>
      <div className="space-y-2"><label htmlFor="guardian-email">Email del apoderado</label>
        <input id="guardian-email" type="email" className={fieldClass} maxLength={254} aria-invalid={!!errors.guardian?.email}
          aria-describedby="guardian-email-error" {...register("guardian.email")} />
        <p id="guardian-email-error" className="text-sm text-destructive">{errors.guardian?.email?.message}</p>
      </div>
      <div className="space-y-2"><label htmlFor="guardian-relationship">Vínculo con el menor</label>
        <input id="guardian-relationship" className={fieldClass} maxLength={40} placeholder="Madre, padre, tutor…"
          aria-invalid={!!errors.guardian?.relationship} aria-describedby="guardian-relationship-error" {...register("guardian.relationship")} />
        <p id="guardian-relationship-error" className="text-sm text-destructive">{errors.guardian?.relationship?.message}</p>
      </div>
      <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0" aria-invalid={!!errors.guardian?.authorized} aria-describedby="guardian-authorization-error" {...register("guardian.authorized")} />
        Declaro contar con autorización del apoderado para registrar al menor. El apoderado debe ratificarla en su cuenta.
      </label>
      <p id="guardian-authorization-error" className="text-sm text-destructive">{errors.guardian?.authorized?.message ?? errors.guardian?.message}</p>
    </fieldset>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button disabled={isSubmitting} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
      {isSubmitting ? "Guardando…" : "Crear cuenta gestionada"}
    </button>
  </form>;
}
