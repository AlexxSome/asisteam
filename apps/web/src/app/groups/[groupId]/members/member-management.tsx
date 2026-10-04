"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { CapacityError } from "@/components/group-capacity";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACCOUNT_STATUS_LABELS, MEMBERSHIP_ROLE_LABELS, MEMBERSHIP_STATUS_LABELS, MEMBER_MANAGEMENT_ERRORS, managedMemberEditSchema, type GroupMember, type ManagedMemberEdit } from "@asisteam/core";
import { assignMemberCoach, changeMemberStatus, requestManagedActivation, updateManagedMember } from "./actions";

export function MemberManagement({ groupId, member }: { groupId: string; member: GroupMember }) {
  const router = useRouter();
  const detailRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [birthdatePending, setBirthdatePending] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ManagedMemberEdit>({
    resolver: zodResolver(managedMemberEditSchema),
    defaultValues: { full_name: member.full_name, email: member.email ?? "", phone: member.phone, birthdate: member.birthdate ?? "" },
  });
  useEffect(() => {
    if (!editing) reset({ full_name: member.full_name, email: member.email ?? "", phone: member.phone, birthdate: member.birthdate ?? "" });
  }, [member.full_name, member.email, member.phone, member.birthdate, editing, reset]);
  useEffect(() => { if (editing) formRef.current?.querySelector("input")?.focus(); }, [editing]);
  // Drafts stay in memory. Only navigation that would lose an actual edit asks.
  useEffect(() => {
    if (!editing || !isDirty) return;
    const prompt = "Hay cambios sin guardar. ¿Quieres descartarlos y salir?";
    const currentUrl = window.location.href;
    const currentState = window.history.state;
    let leaving = false;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!leaving) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href);
      const here = new URL(window.location.href);
      if (next.origin === here.origin && next.pathname === here.pathname && next.search === here.search) return;
      if (!window.confirm(prompt)) { event.preventDefault(); event.stopImmediatePropagation(); }
      else leaving = true;
    };
    const submit = (event: SubmitEvent) => {
      if (event.target === formRef.current || event.defaultPrevented) return;
      if (!window.confirm(prompt)) { event.preventDefault(); event.stopImmediatePropagation(); }
      else leaving = true;
    };
    const popstate = (event: PopStateEvent) => {
      if (window.location.href === currentUrl) return;
      if (!window.confirm(prompt)) {
        // Run before the router handles popstate so the draft remains mounted.
        event.stopImmediatePropagation();
        window.history.pushState(currentState, "", currentUrl);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("popstate", popstate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("popstate", popstate, true);
    };
  }, [editing, isDirty]);
  function cancelEditing() {
    if (isDirty && !window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos?")) return false;
    reset(); setEditing(false); detailRef.current?.focus(); return true;
  }
  function openEditor() { setExpanded(true); setEditing(true); }
  function closeMenu() {
    menuRef.current?.querySelector("summary")?.focus();
    setMenuOpen(false); if (menuRef.current) menuRef.current.open = false;
  }
  async function changeStatus() {
    setSaving(true); setError(undefined); setErrorCode(undefined); setMessage(undefined);
    try {
      const result = await changeMemberStatus({ group_id: groupId, membership_id: member.membership_id,
        action: member.status === "ACTIVE" ? "deactivate" : "reactivate" });
      if ("error" in result) { setError(result.error.message); setErrorCode(result.error.code); }
      else { setMessage(member.status === "ACTIVE" ? "Integrante desactivado. Su historial se conserva." : "Integrante reactivado. Su historial se conserva."); setConfirming(false); router.refresh(); }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  }
  async function assignCoach() {
    setSaving(true); setError(undefined); setErrorCode(undefined); setMessage(undefined);
    try {
      const result = await assignMemberCoach({ group_id: groupId, membership_id: member.membership_id });
      if ("error" in result) { setError(result.error.message); setErrorCode(result.error.code); }
      else { setMessage("Rol Entrenador asignado. Sus otros roles e historial se conservan."); router.refresh(); }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  }
  const saveProfile = handleSubmit(async profile => {
    setSaving(true); setError(undefined); setErrorCode(undefined); setMessage(undefined); setBirthdatePending(false);
    try {
      const result = await updateManagedMember({ group_id: groupId, membership_id: member.membership_id, profile });
      if ("error" in result) { setError(result.error.message); setErrorCode(result.error.code); }
      else {
        setBirthdatePending(!!result.birthdatePending);
        setMessage(result.birthdatePending ? "Datos guardados. La fecha conserva su valor anterior hasta la confirmación de un administrador de cada grupo." : "Perfil actualizado en todos sus grupos.");
        reset(profile); setEditing(false); router.refresh();
      }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  });
  const prefix = `member-${member.membership_id}`;
  async function activateAccount() {
    setError(undefined); setErrorCode(undefined); setMessage(undefined);
    if (!member.email) {
      openEditor(); setError(MEMBER_MANAGEMENT_ERRORS.managed_email_required); return;
    }
    setSaving(true);
    try {
      const result = await requestManagedActivation({ group_id: groupId, membership_id: member.membership_id });
      if ("error" in result) { setError(result.error.message); setErrorCode(result.error.code); }
      else {
        setMessage(result.consentPending
          ? "Solicitud registrada. El apoderado debe autorizarla en Consentimientos de mis pupilos; después se enviará el enlace para crear contraseña."
          : "Invitación de activación enviada. La cuenta seguirá gestionada hasta que el deportista cree su contraseña y acepte las condiciones.");
        router.refresh();
      }
    } catch { setError(MEMBER_MANAGEMENT_ERRORS.unavailable); }
    finally { setSaving(false); }
  }
  const otherRoles = member.person_roles.filter(item => item.role !== member.role);
  const roleLabel = MEMBERSHIP_ROLE_LABELS[member.role];
  return <section aria-label={`${member.full_name}, ${roleLabel}`} className="min-w-0 border-b border-border bg-surface last:border-b-0">
    <div className="grid min-w-0 gap-2 p-3 lg:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] lg:items-center">
      <div className="min-w-0">
        <h2 className="font-semibold [overflow-wrap:anywhere]">{member.full_name}</h2>
        <p className="text-caption text-muted-foreground">{ACCOUNT_STATUS_LABELS[member.account_status]}</p>
        {otherRoles.length > 0 && <p className="text-caption text-muted-foreground [overflow-wrap:anywhere]">Otros roles de esta persona: {otherRoles.map(item => `${MEMBERSHIP_ROLE_LABELS[item.role]} (${MEMBERSHIP_STATUS_LABELS[item.status]})`).join(", ")}</p>}
      </div>
      <p className="text-small"><span className="sr-only">Rol: </span>{roleLabel}</p>
      <p className="text-small"><span className="sr-only">Estado: </span>{MEMBERSHIP_STATUS_LABELS[member.status]}{member.is_last_admin && <span className="block font-medium">Último administrador</span>}</p>
      <div className="flex flex-wrap items-center gap-1">
        <Button ref={detailRef} type="button" variant="tertiary" disabled={saving} aria-expanded={expanded}
          aria-controls={`${prefix}-detail`} onClick={() => {
            if (expanded && editing && !cancelEditing()) return;
            setExpanded(!expanded);
          }}>{expanded ? "Cerrar detalle" : "Ver detalle"}<span className="sr-only"> de {member.full_name}, {roleLabel}</span></Button>
        {!editing && <details ref={menuRef} className="relative" onToggle={event => setMenuOpen(event.currentTarget.open)} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeMenu(); menuRef.current?.querySelector("summary")?.focus(); }
        }}>
          <summary aria-label={`Acciones de ${member.full_name}, ${roleLabel}`} className="min-h-11 cursor-pointer content-center rounded px-3 text-small font-medium focus-visible:outline-2 focus-visible:outline-focus">Acciones</summary>
          {menuOpen && <div className="absolute right-0 z-10 mt-1 w-60 max-w-[calc(100vw-3rem)] space-y-2 rounded-lg border border-border bg-surface p-3 shadow-overlay">
            <p className="text-caption text-muted-foreground">Acciones para el rol {roleLabel}</p>
            {member.account_status === "MANAGED" && <Button type="button" variant="secondary" className="w-full" disabled={saving || confirming}
              onClick={() => { closeMenu(); openEditor(); }}>Editar perfil</Button>}
            {member.account_status === "MANAGED" && member.role === "ATHLETE" && <Button type="button" variant="secondary" className="w-full" disabled={saving || confirming}
              onClick={() => { closeMenu(); void activateAccount(); }}>Activar cuenta propia</Button>}
            {member.status === "ACTIVE" && member.role !== "COACH" && <Button type="button" variant="secondary" className="w-full" disabled={saving || confirming}
              onClick={() => { closeMenu(); void assignCoach(); }}>Asignar rol Entrenador</Button>}
            {member.status === "ACTIVE" && <Button type="button" variant="tertiary" className="w-full text-destructive" disabled={saving || confirming || member.is_last_admin} aria-describedby={member.is_last_admin ? `${prefix}-last-admin` : undefined}
              onClick={() => { closeMenu(); setConfirming(true); }}>Desactivar este rol</Button>}
            {member.status === "INACTIVE" && <Button type="button" variant="secondary" className="w-full" disabled={saving}
              onClick={() => { closeMenu(); void changeStatus(); }}>Reactivar este rol</Button>}
            {member.is_last_admin && <p id={`${prefix}-last-admin`} className="text-small">Debe haber otro administrador activo antes de desactivar este rol. Su historial se conserva.</p>}
          </div>}
        </details>}
      </div>
    </div>
    <div id={`${prefix}-detail`} hidden={!expanded} className="space-y-3 border-t border-border p-4">
      <dl className="grid gap-3 text-small sm:grid-cols-3">
        <div className="min-w-0"><dt className="text-muted-foreground">Email</dt><dd className="[overflow-wrap:anywhere]">{member.email ?? "Sin email"}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Teléfono</dt><dd className="[overflow-wrap:anywhere]">{member.phone ?? "Sin teléfono"}</dd></div>
        <div><dt className="text-muted-foreground">Fecha de nacimiento</dt><dd>{member.birthdate ?? "Sin fecha"}</dd></div>
      </dl>
      {member.role === "COACH" && <p className="text-small">Puede tomar y corregir asistencia y ver reportes. No administra el grupo ni accede a notas privadas.</p>}
      {!editing && (member.account_status === "MANAGED"
        ? <Button type="button" variant="secondary" disabled={saving || confirming} onClick={openEditor}>Editar perfil</Button>
        : <p className="text-small text-muted-foreground">El perfil lo edita su titular.</p>)}
      {editing && <form ref={formRef} onSubmit={saveProfile} className="max-w-xl space-y-3" noValidate>
        <p className="text-small">El perfil se comparte en todos sus grupos. Las correcciones que cambian a mayor de edad requieren la confirmación de cada grupo.</p>
        {([['full_name', 'Nombre completo', 'text'], ['email', 'Email (opcional)', 'email'], ['phone', 'Teléfono (opcional)', 'tel'], ['birthdate', 'Fecha de nacimiento', 'date']] as const).map(([field, label, type]) => <Field key={field}
          id={`${prefix}-${field}`} label={label} error={errors[field]?.message}>
          <Input type={type} disabled={saving} {...register(field, field === "phone" ? { setValueAs: (value: string) => value?.trim() || null } : {})} />
        </Field>)}
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={saving}>Guardar perfil</Button><Button type="button" variant="secondary" disabled={saving} onClick={cancelEditing}>Cancelar</Button></div>
      </form>}
    </div>
    <div className={confirming || saving || message || error ? "space-y-3 px-3 pb-3" : ""}>
      <InlineConfirmation open={confirming} title={`Desactivar rol ${roleLabel}`} confirmLabel="Confirmar desactivación" destructive busy={saving}
        onConfirm={() => void changeStatus()} onCancel={() => setConfirming(false)} fallbackFocusRef={detailRef}>
        {member.full_name} dejará de estar activo en este rol. Su historial y los registros anteriores se conservan; sus otros roles no cambian.
      </InlineConfirmation>
      {saving && <p role="status">Guardando…</p>}
      {message && <p role="status">{message}</p>}
      {birthdatePending && <Link className="underline" href="/profile/birthdate-requests">Revisar correcciones de fecha</Link>}
      {error && <CapacityError error={{ code: errorCode, message: error }} groupId={groupId} />}
    </div>
  </section>;
}
