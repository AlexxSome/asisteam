"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACCOUNT_STATUS_LABELS, MEMBERSHIP_ROLE_LABELS, MEMBERSHIP_STATUS_LABELS, MEMBER_MANAGEMENT_ERRORS, managedMemberEditSchema, type GroupMember, type ManagedMemberEdit } from "@asisteam/core";
import { changeMemberStatus, requestManagedActivation, updateManagedMember } from "./actions";

export function MemberManagement({ groupId, member }: { groupId: string; member: GroupMember }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [birthdatePending, setBirthdatePending] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ManagedMemberEdit>({
    resolver: zodResolver(managedMemberEditSchema),
    defaultValues: { full_name: member.full_name, email: member.email ?? "", phone: member.phone, birthdate: member.birthdate ?? "" },
  });
  useEffect(() => {
    reset({ full_name: member.full_name, email: member.email ?? "", phone: member.phone, birthdate: member.birthdate ?? "" });
  }, [member.full_name, member.email, member.phone, member.birthdate, reset]);
  async function changeStatus() {
    setSaving(true); setError(undefined); setMessage(undefined);
    try {
      const result = await changeMemberStatus({ group_id: groupId, membership_id: member.membership_id,
        action: member.status === "ACTIVE" ? "deactivate" : "reactivate" });
      if ("error" in result) setError(result.error.message);
      else { setMessage(member.status === "ACTIVE" ? "Integrante desactivado. Su historial se conserva." : "Integrante reactivado. Su historial se conserva."); setConfirming(false); router.refresh(); }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  }
  const saveProfile = handleSubmit(async profile => {
    setSaving(true); setError(undefined); setMessage(undefined); setBirthdatePending(false);
    try {
      const result = await updateManagedMember({ group_id: groupId, membership_id: member.membership_id, profile });
      if ("error" in result) setError(result.error.message);
      else {
        setBirthdatePending(!!result.birthdatePending);
        setMessage(result.birthdatePending ? "Datos guardados. La fecha conserva su valor anterior hasta la confirmación de un administrador de cada grupo." : "Perfil actualizado en todos sus grupos.");
        setEditing(false); router.refresh();
      }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  });
  const prefix = `member-${member.membership_id}`;
  async function activateAccount() {
    setError(undefined); setMessage(undefined);
    if (!member.email) {
      setEditing(true); setError(MEMBER_MANAGEMENT_ERRORS.managed_email_required); return;
    }
    setSaving(true);
    try {
      const result = await requestManagedActivation({ group_id: groupId, membership_id: member.membership_id });
      if ("error" in result) setError(result.error.message);
      else {
        setMessage(result.consentPending
          ? "Solicitud registrada. El apoderado debe autorizarla en Consentimientos de mis pupilos; después se enviará el enlace para crear contraseña."
          : "Invitación de activación enviada. La cuenta seguirá gestionada hasta que el deportista cree su contraseña y acepte las condiciones.");
        router.refresh();
      }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  }
  const fieldClass = "min-h-11 w-full rounded border bg-background px-3 py-2";
  return <section aria-label={member.full_name} className="space-y-3 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">{member.full_name}</h2>
    <p>{MEMBERSHIP_ROLE_LABELS[member.role]} · {MEMBERSHIP_STATUS_LABELS[member.status]} · {ACCOUNT_STATUS_LABELS[member.account_status]}</p>
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <div><dt>Email</dt><dd className="break-all">{member.email ?? "Sin email"}</dd></div>
      <div><dt>Teléfono</dt><dd>{member.phone ?? "Sin teléfono"}</dd></div>
      <div><dt>Fecha de nacimiento</dt><dd>{member.birthdate ?? "Sin fecha"}</dd></div>
    </dl>
    {!editing && <div className="flex flex-wrap gap-3">
      {member.account_status === "MANAGED" ? <button disabled={saving || confirming} className="min-h-11 rounded border px-4" onClick={() => setEditing(true)}>Editar perfil</button> : <p>El perfil lo edita su titular.</p>}
      {member.account_status === "MANAGED" && member.role === "ATHLETE" && <button disabled={saving || confirming} className="min-h-11 rounded border px-4" onClick={activateAccount}>Activar cuenta propia</button>}
      {member.status === "ACTIVE" && !confirming && <button disabled={saving} className="min-h-11 rounded border px-4" onClick={() => setConfirming(true)}>Desactivar</button>}
      {member.status === "INACTIVE" && <button disabled={saving} className="min-h-11 rounded border px-4" onClick={changeStatus}>Reactivar</button>}
    </div>}
    {confirming && <div className="space-y-3 rounded border p-3">
      <p>¿Desactivar a {member.full_name} en este rol? Dejará de estar activo en el grupo. Su historial se conserva.</p>
      <div className="flex gap-3"><button disabled={saving} className="min-h-11 rounded bg-destructive px-4 text-white" onClick={changeStatus}>Confirmar desactivación</button><button disabled={saving} className="min-h-11 rounded border px-4" onClick={() => setConfirming(false)}>Cancelar</button></div>
    </div>}
    {editing && <form onSubmit={saveProfile} className="max-w-xl space-y-3" noValidate>
      <p className="text-sm">El perfil se comparte en todos sus grupos. Las correcciones que cambian a mayor de edad requieren la confirmación de cada grupo.</p>
      {([['full_name', 'Nombre completo', 'text'], ['email', 'Email (opcional)', 'email'], ['phone', 'Teléfono (opcional)', 'tel'], ['birthdate', 'Fecha de nacimiento', 'date']] as const).map(([field, label, type]) => <div key={field}>
        <label htmlFor={`${prefix}-${field}`}>{label}</label>
        <input id={`${prefix}-${field}`} type={type} className={fieldClass} disabled={saving}
          aria-invalid={!!errors[field]} aria-describedby={`${prefix}-${field}-error`}
          {...register(field, field === "phone" ? { setValueAs: (value: string) => value?.trim() || null } : {})} />
        <p id={`${prefix}-${field}-error`} className="text-sm text-destructive">{errors[field]?.message}</p>
      </div>)}
      <div className="flex gap-3"><button disabled={saving} className="min-h-11 rounded bg-primary px-4 text-primary-foreground">Guardar perfil</button><button type="button" disabled={saving} className="min-h-11 rounded border px-4" onClick={() => setEditing(false)}>Cancelar</button></div>
    </form>}
    {saving && <p role="status">Guardando…</p>}
    {message && <p role="status">{message}</p>}
    {birthdatePending && <Link className="underline" href="/profile/birthdate-requests">Revisar correcciones de fecha</Link>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
