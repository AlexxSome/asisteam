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

type RowFeedback = { kind: "saving" | "saved" | "error"; message: string; announce?: boolean };

function AthleteRow({ row, busy, feedback, canEditNotes, onStatus, onNote }: {
  row: AttendanceRosterRow; busy: boolean; feedback?: RowFeedback; canEditNotes: boolean;
  onStatus: (status: AttendanceStatus) => void; onNote: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const [dirty, setDirty] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  // Keep a draft through optimistic updates and rollback; sync confirmed server values.
  useEffect(() => { if (!dirty) setNote(row.note ?? ""); }, [row.note, dirty]);
  const statusLabel = row.status ? ATTENDANCE_STATUS_LABELS[row.status] : "Sin marcar";
  return <li className="space-y-2 rounded-lg border border-border bg-surface p-3">
    <div className="flex items-start gap-2">
      {row.avatar_url && <img src={row.avatar_url} alt="" width={32} height={32} referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold [overflow-wrap:anywhere]">{row.full_name}</p>
        <p role={feedback?.announce === false ? undefined : "status"} aria-label={`Guardado de ${row.full_name}`}
          aria-atomic="true" className="text-caption text-muted-foreground">
          {statusLabel} · {feedback?.kind === "saving" ? "Guardando…" : feedback?.kind === "error" ? "Sin confirmar" : feedback?.message ?? (row.status ? "Guardado" : "Pendiente")}
        </p>
      </div>
      {canEditNotes && <Button type="button" variant="tertiary" className="shrink-0 px-2 text-small"
        aria-label={`Nota de ${row.full_name}${row.note ? " (registrada)" : " (opcional)"}`}
        aria-expanded={noteOpen} aria-controls={`note-panel-${row.membership_id}`}
        onClick={() => setNoteOpen(!noteOpen)}>Nota{row.note && <span aria-hidden="true">•</span>}</Button>}
    </div>
    <div role="group" aria-label={`Asistencia de ${row.full_name}`} aria-busy={busy} className="grid grid-cols-2 gap-1 min-[360px]:grid-cols-4">
      {ATTENDANCE_STATUSES.map((status) => <Button variant="secondary" key={status} type="button" aria-pressed={row.status === status}
        disabled={busy} onClick={() => onStatus(status)}
        className={`min-h-11 min-w-0 flex-col gap-0 px-1 py-1 text-caption ${row.status === status ? `${attendanceStatusClasses[status]} ring-2 ring-inset ring-current font-bold` : ""}`}>
        <span aria-hidden="true" className="inline-block h-4 leading-4">{row.status === status ? "✓" : ""}</span>
        <span className="[overflow-wrap:anywhere]">{ATTENDANCE_STATUS_LABELS[status]}</span>
      </Button>)}
    </div>
    {feedback?.kind === "error" && <p role={feedback.announce === false ? undefined : "alert"}
      className="border-l-2 border-error pl-2 text-small text-error">{feedback.message}</p>}
    {canEditNotes && <div id={`note-panel-${row.membership_id}`} hidden={!noteOpen}>
      {row.status ? <form onSubmit={(event) => { event.preventDefault(); void onNote(note).then(saved => { if (saved) setDirty(false); }); }} className="space-y-2 pt-2">
        <Field id={`note-${row.membership_id}`} label={`Nota de ${row.full_name}`} help={`${note.length}/500 caracteres`}>
          <Textarea value={note} onChange={(event) => { setNote(event.target.value); setDirty(true); }} maxLength={500} rows={3} disabled={busy} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={note === (row.note ?? "")}>Guardar nota</Button>
      </form> : <p className="pt-2 text-small text-muted-foreground">Marca un estado antes de añadir una nota.</p>}
    </div>}
  </li>;
}

export function AttendanceSheet({ groupId, activityId, initialRows, canEditNotes = true }: {
  groupId: string; activityId: string; initialRows: AttendanceRosterRow[]; canEditNotes?: boolean;
}) {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const rosterRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
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
    if (onlyUnmarked) { setError(null); setFeedback(""); }
    function report(kind: RowFeedback["kind"], message: string) {
      setRowFeedback(current => ({ ...current, ...Object.fromEntries(ids.map(id => [id, { kind, message, announce: !onlyUnmarked }])) }));
    }
    report("saving", "Guardando…");
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
        patch(previous);
        report("error", result.error.message);
        if (onlyUnmarked) setError(result.error.message);
        return false;
      } else {
        if ("records" in result) patch(result.records.map((record) => ({ ...record, note: record.note ?? null })));
        report("saved", clear ? "Registro desmarcado." : "Guardado");
        return true;
      }
    } catch {
      patch(previous);
      const message = navigator.onLine === false ? "Sin conexión: el cambio no se guardó." : "No pudimos confirmar el guardado. Recarga la asistencia antes de reintentar.";
      report("error", message);
      if (onlyUnmarked) setError(message);
      return false;
    } finally {
      ids.forEach((id) => busyRef.current.delete(id));
      setBusy(new Set(busyRef.current));
    }
  }

  async function markAllPresent() {
    if (bulkRef.current || busyRef.current.size) return;
    bulkRef.current = true; setBulkBusy(true); setError(null); setFeedback("");
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
      setFeedback(`Se confirmaron ${completed} registros. Las marcas existentes se conservaron.`);
    } finally { bulkRef.current = false; setBulkBusy(false); setConfirmAll(false); }
  }

  const visibleRows = rows.filter((row) => row.full_name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  function clearSearch() { setQuery(""); setPage(1); searchRef.current?.focus(); }
  return <section className="space-y-3" aria-label="Registro de asistencia">
    <p className="text-small tabular-nums" aria-live="polite">Presentes {counts.PRESENT} · Atrasados {counts.LATE} · Ausentes {counts.ABSENT} · Justificados {counts.EXCUSED} · Sin marcar {counts.unmarked}</p>
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1"><Field id="athlete-search" label="Buscar deportista">
        <Input ref={searchRef} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </Field></div>
      {query && <Button type="button" variant="tertiary" onClick={clearSearch}>Limpiar búsqueda</Button>}
    </div>
    <Button type="button" variant="secondary" onClick={() => setConfirmAll(true)} loading={bulkBusy}
      disabled={busy.size > 0 || counts.unmarked === 0}>Marcar todos como Presente</Button>
    <InlineConfirmation open={confirmAll} title="Confirmar presentes" busy={bulkBusy} disabled={busy.size > 0}
      onConfirm={() => void markAllPresent()} onCancel={() => setConfirmAll(false)} fallbackFocusRef={feedbackRef}>
      Se marcarán como presentes los {counts.unmarked} deportistas sin registro de toda la nómina, incluidos los que no aparecen en esta búsqueda o página. Las marcas existentes se conservan.
    </InlineConfirmation>
    {error && <Alert>{error}</Alert>}
    <p ref={feedbackRef} tabIndex={-1} role="status" aria-label="Resultado del guardado masivo"
      className={bulkBusy || feedback ? "text-small text-muted-foreground" : "sr-only"}>{bulkBusy ? "Guardando toda la nómina…" : feedback}</p>
    <p className="text-caption text-muted-foreground">Cada toque guarda. {canEditNotes ? "Repite el estado para desmarcar." : "Solo ADMIN edita notas o desmarca."}</p>
    {query && <p role="status" className="text-small text-muted-foreground">{visibleRows.length} de {rows.length} deportistas coinciden.</p>}
    <ul ref={rosterRef} tabIndex={-1} aria-label="Deportistas" className="space-y-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{visibleRows.slice((page - 1) * 50, page * 50).map((row) => <AthleteRow key={row.membership_id} row={row} busy={bulkBusy || busy.has(row.membership_id)} feedback={rowFeedback[row.membership_id]} canEditNotes={canEditNotes}
      onStatus={(status) => void persist([{ membership_id: row.membership_id, status }], false, canEditNotes && row.status === status, row.status ? { status } : undefined)}
      onNote={async (note) => row.status ? persist([{ membership_id: row.membership_id, status: row.status, note }], false, false, { note }) : false} />)}</ul>
    {visibleRows.length > 50 && <Pagination label="Páginas de deportistas" page={page}
      totalPages={Math.ceil(visibleRows.length / 50)} onPageChange={next => {
        setPage(next); rosterRef.current?.focus(); rosterRef.current?.scrollIntoView({ block: "start" });
      }} />}
    {visibleRows.length === 0 && <EmptyState title="Sin resultados para esta búsqueda">
      No se encontraron deportistas con ese nombre. Prueba con otro nombre o limpia la búsqueda.
    </EmptyState>}
  </section>;
}
