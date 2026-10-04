"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CapacityError } from "@/components/group-capacity";
import { ACCOUNT_STATUS_LABELS, membershipApprovalBlock, membershipOnboardingSteps, MEMBERSHIP_REVIEW_ERROR_MESSAGES, type PendingMembership } from "@asisteam/core";
import { reviewMembership } from "./actions";

export function MembershipReview({ groupId, member }: { groupId: string; member: PendingMembership }) {
  const router = useRouter();
  const reasonId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [result, setResult] = useState<"approve" | "reject">();
  const block = membershipApprovalBlock(member) ?? (member.capacity_block ? "El administrador debe resolver la capacidad antes de aprobar." : null);
  async function decide(decision: "approve" | "reject") {
    setPending(true); setError(undefined); setErrorCode(undefined);
    try {
      const response = await reviewMembership({ group_id: groupId, membership_id: member.membership_id, decision });
      if ("error" in response) { setError(response.error.message); setErrorCode(response.error.code); }
      else { setResult(decision); router.refresh(); }
    } catch { setError(MEMBERSHIP_REVIEW_ERROR_MESSAGES.unavailable); }
    finally { setPending(false); }
  }
  return <article id={`membership-${member.membership_id}`} aria-label={member.full_name} className="space-y-3 rounded-lg border p-4">
    <h2 className="break-words text-lg font-semibold">{member.full_name}</h2>
    <p>{member.is_minor ? "Menor de edad" : "Mayor de edad"}</p>
    <MembershipProgress groupId={groupId} member={member} audience="admin" />
    {member.membership_status === "ACTIVE" ? <p role="status">Incorporación completada. La membresía ya está activa.</p> : result ? <p role="status">{result === "approve"
      ? "Incorporación aprobada. El deportista ya aparece en asistencia."
      : "Incorporación rechazada. La membresía queda inactiva y conserva su historial."}</p> : <>
      {block && <p id={reasonId} className="text-sm">{block}</p>}
      {error && <CapacityError error={{ code: errorCode, message: error }} groupId={groupId} />}
      <div className="flex flex-wrap gap-3" aria-busy={pending}>
        <button type="button" disabled={pending || !!block} aria-describedby={block ? reasonId : undefined}
          onClick={() => decide("approve")} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Aprobar</button>
        <button type="button" disabled={pending} onClick={() => decide("reject")}
          className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50">Rechazar</button>
      </div>
      {pending && <p role="status">Guardando decisión…</p>}
    </>}
  </article>;
}

export function MembershipProgress({ groupId, member, audience }: {
  groupId: string; member: PendingMembership; audience: "admin" | "guardian" | "athlete";
}) {
  const pending = member.membership_status !== "ACTIVE";
  return <div className="min-w-0 space-y-3 text-sm">
    <dl className="space-y-2">{membershipOnboardingSteps(member).map(step => <div key={step.label}>
      <dt className="font-medium">{step.label}</dt><dd className="break-words text-muted-foreground">{step.detail}</dd>
    </div>)}</dl>
    {member.account_status && <p><strong>{ACCOUNT_STATUS_LABELS[member.account_status as keyof typeof ACCOUNT_STATUS_LABELS]}:</strong> {member.account_status === "MANAGED" ? "sin credenciales propias para iniciar sesión. Tener una membresía activa permite registrar asistencia." : member.account_status === "INVITED" ? "pendiente de completar el registro mediante su invitación." : "el deportista tiene su propio acceso; la participación depende de su membresía."}</p>}
    {pending && audience === "athlete" && <p>Tu solicitud ya está guardada. No necesitas volver a ingresar el código. El administrador coordina el vínculo y la aprobación; tu apoderado otorga el consentimiento.</p>}
    {pending && audience === "admin" && member.is_minor && !member.guardian_linked && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}/guardians?membership=${member.membership_id}`}>Vincular apoderado</Link>}
    {pending && audience === "admin" && member.guardian_linked && (member.requires_managed_consent || !member.guardian_ready) && <div>
      <p>El apoderado debe entrar a Mis pupilos y revisar el tratamiento de datos en este grupo. Si no recibió el correo, revisa o reenvía su invitación; el alta ya está guardada.</p>
      <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}/invitations/new`}>Revisar invitaciones del apoderado</Link>
    </div>}
    {member.capacity_block && audience === "admin" && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}/${member.capacity_block === "subscription_athlete_limit" ? "billing" : "members"}`}>Resolver capacidad</Link>}
    {audience === "guardian" && member.can_consent && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}/members/consent?athlete=${member.athlete_user_id}`}>Revisar consentimiento de {member.full_name}</Link>}
    {audience === "guardian" && pending && !member.can_consent && <p>{member.requires_managed_consent ? "El apoderado designado debe otorgar el consentimiento. Pide al administrador que coordine ese paso." : "El administrador debe revisar la aprobación y los cupos."} No repitas el alta del menor.</p>}
  </div>;
}

export function PendingJoinRequests({ memberships }: { memberships: (PendingMembership & { group_id: string; group_name: string })[] }) {
  if (!memberships.length) return null;
  return <section className="w-full max-w-3xl space-y-4 text-left" aria-label="Mis solicitudes guardadas">
    <h2 className="text-xl font-semibold">Mis solicitudes guardadas</h2>
    {memberships.map(member => <article key={member.membership_id} className="min-w-0 space-y-3 rounded-lg border p-4">
      <h3 className="break-words text-lg font-semibold">{member.group_name}</h3>
      <MembershipProgress groupId={member.group_id} member={member} audience="athlete" />
    </article>)}
  </section>;
}
