"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { membershipApprovalBlock, MEMBERSHIP_REVIEW_ERROR_MESSAGES, type PendingMembership } from "@asisteam/core";
import { reviewMembership } from "./actions";

export function MembershipReview({ groupId, member }: { groupId: string; member: PendingMembership }) {
  const router = useRouter();
  const reasonId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<"approve" | "reject">();
  const block = membershipApprovalBlock(member);
  async function decide(decision: "approve" | "reject") {
    setPending(true); setError(undefined);
    try {
      const response = await reviewMembership({ group_id: groupId, membership_id: member.membership_id, decision });
      if ("error" in response) setError(response.error.message);
      else { setResult(decision); router.refresh(); }
    } catch { setError(MEMBERSHIP_REVIEW_ERROR_MESSAGES.unavailable); }
    finally { setPending(false); }
  }
  return <article aria-label={member.full_name} className="space-y-3 rounded-lg border p-4">
    <h2 className="break-words text-lg font-semibold">{member.full_name}</h2>
    <p>{member.is_minor ? "Menor de edad" : "Mayor de edad"}</p>
    {member.is_minor && <p>Apoderado: {member.guardian_linked ? "vinculado" : "sin vínculo activo"}</p>}
    {result ? <p role="status">{result === "approve"
      ? "Incorporación aprobada. El deportista ya aparece en asistencia."
      : "Incorporación rechazada. La membresía queda inactiva y conserva su historial."}</p> : <>
      {block && <p id={reasonId} className="text-sm">{block}</p>}
      {member.is_minor && !member.guardian_linked && <Link className="block underline" href={`/groups/${groupId}/guardians`}>Vincular apoderado</Link>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
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
