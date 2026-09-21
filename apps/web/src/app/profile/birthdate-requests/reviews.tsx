"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewBirthdate, type ProfileResult } from "../actions";

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
    {reviews.map((row) => <article key={`${row.request_id}-${row.group_id}`} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">{row.full_name} · {row.group_name}</h2>
      <p>Fecha actual: {date(row.old_birthdate)}<br />Fecha solicitada: {date(row.requested_birthdate)}</p>
      {row.approved ? <p>Tu grupo ya confirmó. Esperando a los demás grupos.</p> : <Button disabled={busy} onClick={() => review(row, true)}>Confirmar corrección para este grupo</Button>}
      <Button className="ml-2" variant="outline" disabled={busy} onClick={() => review(row, false)}>Rechazar solicitud</Button>
    </article>)}
    {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
  </div>;
}
