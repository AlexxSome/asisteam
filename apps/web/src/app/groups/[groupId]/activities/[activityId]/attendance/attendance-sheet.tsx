"use client";

import { useEffect, useRef, useState } from "react";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, attendanceCounts,
  type AttendanceChanges, type AttendanceInput, type AttendanceRosterRow, type AttendanceStatus } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { attendanceStatusClasses } from "@/lib/attendance-presentation";
import { clearAttendance, saveAttendance, updateAttendance } from "./actions";

function AthleteRow({ row, busy, canEditNotes, onStatus, onNote }: {
  row: AttendanceRosterRow; busy: boolean; canEditNotes: boolean;
  onStatus: (status: AttendanceStatus) => void; onNote: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const [dirty, setDirty] = useState(false);
  // Keep a draft through optimistic updates and rollback; sync confirmed server values.
  useEffect(() => { if (!dirty) setNote(row.note ?? ""); }, [row.note, dirty]);
  return <li className="space-y-3 rounded-lg border border-border bg-surface p-3" aria-busy={busy}>
    <div className="flex items-center gap-3">
      {row.avatar_url && <img src={row.avatar_url} alt="" width={40} height={40} referrerPolicy="no-referrer" className="size-10 rounded-full object-cover" />}
      <div className="min-w-0"><p className="break-words font-semibold">{row.full_name}</p>
        <p className="text-small text-muted-foreground">{busy ? "Guardando…" : row.status ? ATTENDANCE_STATUS_LABELS[row.status] : "Sin marcar"}</p>
      </div>
    </div>
    <div role="group" aria-label={`Asistencia de ${row.full_name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ATTENDANCE_STATUSES.map((status) => <Button variant="secondary" key={status} type="button" aria-pressed={row.status === status}
        disabled={busy} onClick={() => onStatus(status)}
        className={`flex min-h-control items-center justify-center gap-1 rounded-md border px-2 py-2 text-label disabled:opacity-60 ${attendanceStatusClasses[status]} ${row.status === status ? "ring-2 ring-current font-bold" : ""}`}>
        <span aria-hidden="true" className="inline-block w-3 shrink-0">{row.status === status ? "✓" : ""}</span>
        {ATTENDANCE_STATUS_LABELS[status]}
      </Button>)}
    </div>
    {canEditNotes && <details><summary className="min-h-11 cursor-pointer py-2 text-small underline">Nota{row.note ? " (registrada)" : " (opcional)"}</summary>
      {row.status ? <form onSubmit={(event) => { event.preventDefault(); void onNote(note).then(saved => { if (saved) setDirty(false); }); }} className="space-y-2">
        <Field id={`note-${row.membership_id}`} label={`Nota de ${row.full_name}`} help={`${note.length}/500 caracteres`}>
          <Textarea value={note} onChange={(event) => { setNote(event.target.value); setDirty(true); }} maxLength={500} rows={3} disabled={busy} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={note === (row.note ?? "")}>Guardar nota</Button>
      </form> : <p className="text-small text-muted-foreground">Marca un estado antes de añadir una nota.</p>}
    </details>}
  </li>;
}

export function AttendanceSheet({ groupId, activityId, initialRows, canEditNotes = true }: {
  groupId: string; activityId: string; initialRows: AttendanceRosterRow[]; canEditNotes?: boolean;
}) {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(initialRows);
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState(new Set<string>());
  const bulkRef = useRef(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const counts = attendanceCounts(rows);

  function patch(updates: Pick<AttendanceRosterRow, "membership_id" | "status" | "note">[]) {
    const byId = new Map(updates.map((item) => [item.membership_id, item]));
    rowsRef.current = rowsRef.current.map((row) => ({ ...row, ...byId.get(row.membership_id) }));
    setRows(rowsRef.current);
  }

  async function persist(records: AttendanceInput[], onlyUnmarked = false, clear = false, changes?: AttendanceChanges) {
    const ids = records.map((record) => record.membership_id);
    if ((bulkRef.current && !onlyUnmarked) || ids.some((id) => busyRef.current.has(id))) return false;
    const previous = rowsRef.current.filter((row) => ids.includes(row.membership_id));
    ids.forEach((id) => busyRef.current.add(id));
    setBusy(new Set(busyRef.current));
    setError(null); setFeedback("");
    patch(previous.map((row) => {
      const input = records.find((record) => record.membership_id === row.membership_id)!;
      return { membership_id: row.membership_id, status: clear ? null : input.status,
        note: clear ? null : input.note === undefined ? row.note : input.note };
    }));
    try {
      const result = clear
        ? await clearAttendance(groupId, activityId, ids[0]!)
        : changes ? await updateAttendance(groupId, activityId, ids[0]!, changes)
        : await saveAttendance(groupId, activityId, records, onlyUnmarked);
      if ("error" in result) {
        patch(previous); setError(result.error.message); return false;
      } else {
        if ("records" in result) patch(result.records.map((record) => ({ ...record, note: record.note ?? null })));
        setFeedback(clear ? "Registro desmarcado." : "Asistencia guardada.");
        return true;
      }
    } catch {
      patch(previous);
      setError(navigator.onLine === false ? "Sin conexión: el cambio no se guardó." : "No pudimos confirmar el guardado. Recarga la asistencia antes de reintentar.");
      return false;
    } finally {
      ids.forEach((id) => busyRef.current.delete(id));
      setBusy(new Set(busyRef.current));
    }
  }

  async function markAllPresent() {
    if (bulkRef.current || busyRef.current.size) return;
    bulkRef.current = true; setBulkBusy(true);
    const unmarked = rowsRef.current.filter((row) => !row.status).map((row) => ({ membership_id: row.membership_id, status: "PRESENT" as const }));
    let completed = 0;
    try {
      for (let offset = 0; offset < unmarked.length; offset += 500) {
        const batch = unmarked.slice(offset, offset + 500);
        if (!await persist(batch, true)) {
          setFeedback(`Se confirmaron ${completed} registros. Los lotes anteriores se conservan; quedan deportistas sin marcar.`);
          return;
        }
        completed += batch.length;
      }
    } finally { bulkRef.current = false; setBulkBusy(false); setConfirmAll(false); }
  }

  const visibleRows = rows.filter((row) => row.full_name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  return <section className="space-y-4" aria-label="Registro de asistencia">
    <p className="text-small" aria-live="polite">Presentes {counts.PRESENT} · Atrasados {counts.LATE} · Ausentes {counts.ABSENT} · Justificados {counts.EXCUSED} · Sin marcar {counts.unmarked}</p>
    <Field id="athlete-search" label="Buscar deportista">
      <Input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    </Field>
    <Button type="button" variant="secondary" onClick={() => setConfirmAll(true)} loading={bulkBusy}
      disabled={busy.size > 0 || counts.unmarked === 0}>Marcar todos como Presente</Button>
    <InlineConfirmation open={confirmAll} title="Confirmar presentes" busy={bulkBusy} disabled={busy.size > 0}
      onConfirm={() => void markAllPresent()} onCancel={() => setConfirmAll(false)} fallbackFocusRef={feedbackRef}>
      Se marcarán como presentes los {counts.unmarked} deportistas sin registro. Las marcas existentes se conservan.
    </InlineConfirmation>
    {error && <Alert>{error}</Alert>}
    <p ref={feedbackRef} tabIndex={-1} role="status" className="text-small text-muted-foreground">{bulkBusy || busy.size ? "Guardando cambios…" : feedback}</p>
    <p className="text-small text-muted-foreground">Cada toque guarda el cambio. {canEditNotes ? "Repite el estado seleccionado para volver a “sin marcar”." : "Puedes corregir estados. Las notas y volver a sin marcar están reservados al administrador."}</p>
    <ul className="space-y-3">{visibleRows.slice((page - 1) * 50, page * 50).map((row) => <AthleteRow key={row.membership_id} row={row} busy={bulkBusy || busy.has(row.membership_id)} canEditNotes={canEditNotes}
      onStatus={(status) => void persist([{ membership_id: row.membership_id, status }], false, canEditNotes && row.status === status, row.status ? { status } : undefined)}
      onNote={async (note) => row.status ? persist([{ membership_id: row.membership_id, status: row.status, note }], false, false, { note }) : false} />)}</ul>
    {visibleRows.length > 50 && <Pagination label="Páginas de deportistas" page={page}
      totalPages={Math.ceil(visibleRows.length / 50)} onPageChange={setPage} />}
    {visibleRows.length === 0 && <EmptyState title="Sin resultados para esta búsqueda" action={<Button type="button" variant="secondary" onClick={() => { setQuery(""); setPage(1); document.getElementById("athlete-search")?.focus(); }}>Limpiar búsqueda</Button>}>
      No se encontraron deportistas con ese nombre. Prueba con otro nombre o limpia la búsqueda.
    </EmptyState>}
  </section>;
}
