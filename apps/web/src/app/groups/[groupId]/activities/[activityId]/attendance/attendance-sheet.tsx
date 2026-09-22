"use client";

import { useEffect, useRef, useState } from "react";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, attendanceCounts,
  type AttendanceChanges, type AttendanceInput, type AttendanceRosterRow, type AttendanceStatus } from "@asisteam/core";
import { clearAttendance, saveAttendance, updateAttendance } from "./actions";

const stateColors: Record<AttendanceStatus, string> = {
  PRESENT: "border-green-600 bg-green-100 text-green-950",
  ABSENT: "border-red-600 bg-red-100 text-red-950",
  LATE: "border-amber-600 bg-amber-100 text-amber-950",
  EXCUSED: "border-gray-500 bg-gray-100 text-gray-950",
};

function AthleteRow({ row, busy, onStatus, onNote }: {
  row: AttendanceRosterRow; busy: boolean;
  onStatus: (status: AttendanceStatus) => void; onNote: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(row.note ?? "");
  useEffect(() => setNote(row.note ?? ""), [row.note]);
  return <li className="space-y-3 rounded-lg border p-3" aria-busy={busy}>
    <div className="flex items-center gap-3">
      {row.avatar_url && <img src={row.avatar_url} alt="" width={40} height={40} referrerPolicy="no-referrer" className="size-10 rounded-full object-cover" />}
      <div className="min-w-0"><p className="break-words font-semibold">{row.full_name}</p>
        <p className="text-sm text-muted-foreground">{busy ? "Guardando…" : row.status ? ATTENDANCE_STATUS_LABELS[row.status] : "Sin marcar"}</p>
      </div>
    </div>
    <div role="group" aria-label={`Asistencia de ${row.full_name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ATTENDANCE_STATUSES.map((status) => <button key={status} type="button" aria-pressed={row.status === status}
        disabled={busy} onClick={() => onStatus(status)}
        className={`min-h-11 rounded-md border px-2 py-2 text-sm disabled:opacity-60 ${stateColors[status]} ${row.status === status ? "ring-2 ring-current font-bold" : "opacity-75"}`}>
        {ATTENDANCE_STATUS_LABELS[status]}
      </button>)}
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 text-sm underline">Nota{row.note ? " (registrada)" : " (opcional)"}</summary>
      {row.status ? <form onSubmit={(event) => { event.preventDefault(); void onNote(note); }} className="space-y-2">
        <label htmlFor={`note-${row.membership_id}`} className="text-sm">Nota de {row.full_name}</label>
        <textarea id={`note-${row.membership_id}`} value={note} onChange={(event) => setNote(event.target.value)}
          maxLength={500} rows={3} disabled={busy} className="w-full rounded-md border bg-background p-2" />
        <p className="text-xs text-muted-foreground">{note.length}/500 caracteres</p>
        <button type="submit" disabled={busy || note === (row.note ?? "")} className="min-h-11 rounded-md border px-3 py-2 disabled:opacity-50">Guardar nota</button>
      </form> : <p className="text-sm text-muted-foreground">Marca un estado antes de añadir una nota.</p>}
    </details>
  </li>;
}

export function AttendanceSheet({ groupId, activityId, initialRows }: {
  groupId: string; activityId: string; initialRows: AttendanceRosterRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(initialRows);
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState(new Set<string>());
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
    if (ids.some((id) => busyRef.current.has(id))) return;
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
        patch(previous); setError(result.error.message);
      } else {
        if ("records" in result) patch(result.records.map((record) => ({ ...record, note: record.note ?? null })));
        setFeedback(clear ? "Registro desmarcado." : "Asistencia guardada.");
      }
    } catch {
      patch(previous);
      setError(navigator.onLine === false ? "Sin conexión: el cambio no se guardó." : "No pudimos confirmar el guardado. Recarga la asistencia antes de reintentar.");
    } finally {
      ids.forEach((id) => busyRef.current.delete(id));
      setBusy(new Set(busyRef.current));
    }
  }

  async function markAllPresent() {
    setConfirmAll(false);
    const unmarked = rowsRef.current.filter((row) => !row.status).map((row) => ({ membership_id: row.membership_id, status: "PRESENT" as const }));
    if (unmarked.length) await persist(unmarked, true);
  }

  const visibleRows = rows.filter((row) => row.full_name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  return <section className="space-y-4" aria-label="Registro de asistencia">
    <p className="text-sm" aria-live="polite">Presentes {counts.PRESENT} · Atrasados {counts.LATE} · Ausentes {counts.ABSENT} · Justificados {counts.EXCUSED} · Sin marcar {counts.unmarked}</p>
    <div className="space-y-2"><label htmlFor="athlete-search" className="text-sm font-medium">Buscar deportista</label>
      <input id="athlete-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-md border bg-background px-3 py-2" />
    </div>
    <button type="button" onClick={() => setConfirmAll(true)} disabled={busy.size > 0 || counts.unmarked === 0}
      className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50">Marcar todos como Presente</button>
    {confirmAll && <div role="alertdialog" aria-label="Confirmar presentes" className="space-y-3 rounded-md border p-4">
      <p>Se marcarán como presentes los {counts.unmarked} deportistas sin registro. Las marcas existentes se conservan.</p>
      <div className="flex gap-3"><button type="button" onClick={() => void markAllPresent()} disabled={busy.size > 0} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground">Confirmar</button>
        <button type="button" onClick={() => setConfirmAll(false)} className="min-h-11 rounded-md border px-4 py-2">Cancelar</button></div>
    </div>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{error}</p>}
    <p role="status" className="text-sm text-muted-foreground">{busy.size ? "Guardando cambios…" : feedback}</p>
    <p className="text-xs text-muted-foreground">Cada toque guarda el cambio. Repite el estado seleccionado para volver a “sin marcar”.</p>
    <ul className="space-y-3">{visibleRows.map((row) => <AthleteRow key={row.membership_id} row={row} busy={busy.has(row.membership_id)}
      onStatus={(status) => void persist([{ membership_id: row.membership_id, status }], false, row.status === status, row.status ? { status } : undefined)}
      onNote={(note) => row.status ? persist([{ membership_id: row.membership_id, status: row.status, note }], false, false, { note }) : Promise.resolve()} />)}</ul>
    {visibleRows.length === 0 && <p>No se encontraron deportistas con ese nombre.</p>}
  </section>;
}
