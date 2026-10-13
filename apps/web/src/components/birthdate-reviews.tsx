// WEB-05: preserves the existing presentation with Router/HTTP adapters.
import { useState } from "react";
import { useRouter } from "../navigation";
import { Button } from "../ui";
import { reviewBirthdate, type ProfileResult } from "../mutations";

export type BirthdateReview = { request_id: string; group_id: string; group_name: string; full_name: string; old_birthdate: string; requested_birthdate: string; approved: boolean };
export function BirthdateReviews({ reviews }: { reviews: BirthdateReview[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [result, setResult] = useState<ProfileResult | null>(null);
  async function review(row: BirthdateReview, approve: boolean) {
    setBusy(true); setResult(null);
    try { setResult(await reviewBirthdate(row.request_id, row.group_id, approve)); router.refresh(); }
    catch { setResult({ ok: false, message: "No pudimos guardar la decisión. Inténtalo nuevamente." }); }
    finally { setBusy(false); }
  }
  const date = (value: string) => value.split("-").reverse().join("/");
  return <div className="space-y-4">
    {reviews.length === 0 && <p>No hay solicitudes pendientes de otros integrantes en los grupos que administras.</p>}
    {reviews.map((row) => <article key={`${row.request_id}-${row.group_id}`} className="space-y-3 rounded-lg border border-border bg-surface p-4 md:p-6">
      <h2 className="text-h2 [overflow-wrap:anywhere]">{row.full_name} · {row.group_name}</h2>
      <p>Fecha actual: {date(row.old_birthdate)}<br />Fecha solicitada: {date(row.requested_birthdate)}</p>
      <div className="flex flex-wrap gap-3">
        {row.approved ? <p>Tu grupo ya confirmó. Esperando a los demás grupos.</p> : <Button disabled={busy} onClick={() => review(row, true)}>Confirmar corrección para este grupo</Button>}
        <Button variant="outline" disabled={busy} onClick={() => review(row, false)}>Rechazar solicitud</Button>
      </div>
    </article>)}
    {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
  </div>;
}
