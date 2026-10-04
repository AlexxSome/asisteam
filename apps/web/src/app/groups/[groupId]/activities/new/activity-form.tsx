"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACTIVITY_WEEKDAYS, ACTIVITY_WEEKDAY_LABELS, activityFormSchema, activityTypeLabel, activityRecurrenceSummary, formatActivityCalendarDate, type ActivityFormInput, type ActivityScope } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { createActivity, deleteActivity, updateActivity } from "./actions";

type ActivityType = { id: string; name: string; group_id: string | null };
const fieldClass = "w-full min-w-0 min-h-11 rounded-md border border-input bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
function localSchedule(start: string | undefined, end: string | undefined) {
  if (!start || !end) return "Completa el inicio y el término para revisar el horario.";
  const date = formatActivityCalendarDate(start.slice(0, 10));
  const endDate = start.slice(0, 10) === end.slice(0, 10) ? "" : ` del ${formatActivityCalendarDate(end.slice(0, 10))}`;
  return `${date}, ${start.slice(11, 16)} → ${end.slice(11, 16)}${endDate} · hora de Chile.`;
}

export function ActivityForm({ groupId, types, activity, returnHref, detailQuery = "", agendaHref }: {
  groupId: string; types: ActivityType[]; returnHref?: string; detailQuery?: string; agendaHref?: string;
  activity?: { id: string; recurring: boolean; recurrenceSummary?: string; values: ActivityFormInput };
}) {
  const router = useRouter();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [scope, setScope] = useState<ActivityScope>("single");
  const [deleteScope, setDeleteScope] = useState<ActivityScope>("single");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [needsAttendanceConfirmation, setNeedsAttendanceConfirmation] = useState(false);
  const [confirmAttendance, setConfirmAttendance] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { register, handleSubmit, reset, setError, setValue, watch, formState: { errors, isSubmitting, isDirty } } = useForm<ActivityFormInput>({
    resolver: zodResolver(activityFormSchema), defaultValues: activity?.values ?? {
      title: "", starts_at: "", ends_at: "", description: "", location: "", activity_type_id: "", recurrence_rule: null,
    },
  });
  const leave = useUnsavedChanges(isDirty);
  const recurrence = watch("recurrence_rule");
  const startsAt = watch("starts_at");
  const endsAt = watch("ends_at");
  const busy = isSubmitting || isDeleting;
  const destination = returnHref ?? (activity ? `/groups/${groupId}/activities/${activity.id}` : `/groups/${groupId}/activities`);
  const scopeDescription = scope === "series"
    ? "Se guardarán los datos y el horario en esta y las siguientes ocurrencias futuras sin asistencia. Se conservan las fechas y días de la serie; las pasadas y las que tienen asistencia no cambian."
    : activity?.recurring ? "Solo cambiará esta actividad. Las demás ocurrencias de la serie se conservan." : "Se guardará una actividad puntual.";
  const submit = handleSubmit(async (values) => {
    setServerError(null);
    if (activity && scope === "series" && values.starts_at.slice(0, 10) !== activity.values.starts_at.slice(0, 10)) {
      setError("starts_at", { message: "Para mover la fecha elige Solo esta actividad. Para editar la serie, conserva la fecha original." });
      return;
    }
    try {
      const result = activity ? await updateActivity(groupId, activity.id, values, scope) : await createActivity(groupId, values);
      if ("affected" in result) {
        reset(values);
        leave(() => { router.push(`/groups/${groupId}/activities/${activity!.id}${detailQuery}`); router.refresh(); }, true);
        return;
      }
      if ("activityId" in result) {
        reset(values);
        leave(() => router.push(`/groups/${groupId}/activities/${result.activityId}${detailQuery}`), true);
        return;
      }
      setServerError(result.error.message);
      for (const [field, messages] of Object.entries(result.error.details)) {
        if (messages?.[0]) setError(field as keyof ActivityFormInput, { message: messages[0] });
      }
    } catch {
      setServerError("No pudimos confirmar el cambio. Revisa la lista de actividades antes de reintentar.");
    }
  });
  const remove = async () => {
    if (!activity) return;
    setIsDeleting(true); setServerError(null);
    try {
      const result = await deleteActivity(groupId, activity.id, deleteScope, confirmAttendance);
      if ("affected" in result) {
        leave(() => { router.push(agendaHref ?? `/groups/${groupId}/activities`); router.refresh(); }, true);
        return;
      }
      setServerError(result.error.message);
      if (result.error.code === "attendance_confirmation_required") setNeedsAttendanceConfirmation(true);
    } catch { setServerError("No pudimos confirmar la eliminación. Revisa la lista de actividades antes de reintentar."); }
    finally { setIsDeleting(false); }
  };
  return <div className="max-w-xl space-y-8">
    <form onSubmit={submit} data-unsaved-activity="true" noValidate>
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <legend className="sr-only">Datos de la actividad</legend>
        <p className="text-sm text-muted-foreground">Todos los horarios se ingresan en hora de Chile (America/Santiago).</p>
        {activity?.recurring && <fieldset className="space-y-2 rounded-md border p-4">
          <legend className="font-medium">Aplicar cambios a</legend>
          {(["single", "series"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => { setScope(value); setServerError(null); }} />
            {value === "single" ? "Solo esta actividad" : "Esta y las siguientes"}
          </label>)}
          <p className="text-sm text-muted-foreground">{scopeDescription}</p>
          {activity.recurrenceSummary && <p className="text-sm">{activity.recurrenceSummary}</p>}
        </fieldset>}
        <Field id="title" label="Título" error={errors.title?.message}><Input maxLength={120} {...register("title")} /></Field>
        <Field id="activity_type_id" label="Tipo de actividad" error={errors.activity_type_id?.message}>
          <select className={fieldClass} {...register("activity_type_id")}>
            <option value="">Selecciona un tipo</option>
            {types.map(type => <option key={type.id} value={type.id}>{activityTypeLabel(type.name, type.group_id === null)}</option>)}
          </select>
        </Field>
        <Field id="location" label="Lugar (opcional)" error={errors.location?.message}><Input maxLength={200} {...register("location")} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">{(["starts_at", "ends_at"] as const).map(field => <Field key={field} id={field}
          label={field === "starts_at" ? "Inicio" : "Término"} error={errors[field]?.message}
          help={activity && scope === "series" && field === "starts_at" ? `Conserva el ${formatActivityCalendarDate(activity.values.starts_at.slice(0, 10))}. Cambia solo la hora; no se descartan tus otros cambios al elegir el alcance.` : undefined}>
          <Input type="datetime-local" step={60}
            min={activity && scope === "series" && field === "starts_at" ? `${activity.values.starts_at.slice(0, 10)}T00:00` : undefined}
            max={activity && scope === "series" && field === "starts_at" ? `${activity.values.starts_at.slice(0, 10)}T23:59` : undefined}
            {...register(field)} />
        </Field>)}</div>
        {!activity && <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="font-medium">Repetición</legend>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={!!recurrence} onChange={event => setValue("recurrence_rule", event.target.checked ? { freq: "WEEKLY", by_weekday: [], until: "" } : null, { shouldDirty: true })} />Repetir semanalmente</label>
          {recurrence && <>
            <p className="text-sm text-muted-foreground">Desde la fecha de inicio hasta la fecha final, inclusive. Máximo 26 semanas y 150 actividades.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ACTIVITY_WEEKDAYS.map(day => <label key={day} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" value={day} {...register("recurrence_rule.by_weekday")} />{ACTIVITY_WEEKDAY_LABELS[day]}
            </label>)}</div>
            <Field id="recurrence-until" label="Repetir hasta" error={errors.recurrence_rule?.message ?? errors.recurrence_rule?.by_weekday?.message ?? errors.recurrence_rule?.until?.message}>
              <Input type="date" {...register("recurrence_rule.until")} />
            </Field>
          </>}
        </fieldset>}
        <Field id="description" label="Descripción (opcional)" error={errors.description?.message}><Textarea maxLength={2000} rows={3} {...register("description")} /></Field>
        <section aria-labelledby="activity-summary" className="space-y-2 rounded-lg border bg-muted p-4">
          <h2 id="activity-summary" className="font-semibold">Resumen antes de guardar</h2>
          <p className="text-sm">{localSchedule(startsAt, endsAt)}</p>
          <p className="text-sm">{activity ? scopeDescription : recurrence
            ? activityRecurrenceSummary(recurrence) === "Sin repetición" ? "Completa los días y la fecha final de la repetición." : activityRecurrenceSummary(recurrence)
            : "Sin repetición: se creará una sola actividad."}</p>
          {activity?.recurring && scope === "series" && <p className="text-sm">Desde la ocurrencia del {formatActivityCalendarDate(activity.values.starts_at.slice(0, 10))}. {activity.recurrenceSummary}</p>}
        </section>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={isSubmitting} disabled={isDeleting}>{isSubmitting ? "Guardando…" : activity ? "Guardar cambios" : recurrence ? "Crear serie semanal" : "Crear actividad"}</Button>
          <Button type="button" variant="secondary" onClick={() => leave(() => router.push(destination))}>Cancelar edición</Button>
        </div>
        {isDirty && <p role="status" className="text-sm text-muted-foreground">Tienes cambios sin guardar.</p>}
      </fieldset>
    </form>
    {serverError && <p role="alert" className="text-destructive">{serverError}</p>}
    {activity && <section aria-labelledby="delete-activity" className="space-y-3 border-t pt-6">
      <h2 id="delete-activity" className="text-lg font-semibold">Eliminar actividad</h2>
      <p className="break-words text-sm">Actividad guardada: <strong>{activity.values.title}</strong>. {localSchedule(activity.values.starts_at, activity.values.ends_at)}</p>
      {activity.recurring && <fieldset disabled={busy} className="space-y-2">
        <legend className="font-medium">Alcance de eliminación</legend>
        {(["single", "series"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-3">
          <input type="radio" name="delete-scope" checked={deleteScope === value} onChange={() => {
            setDeleteScope(value); setDeleteOpen(false); setNeedsAttendanceConfirmation(false); setConfirmAttendance(false); setServerError(null);
          }} />{value === "single" ? "Eliminar solo esta actividad" : "Eliminar esta y las siguientes"}
        </label>)}
      </fieldset>}
      <Button ref={deleteButtonRef} type="button" variant="secondary" disabled={busy} aria-expanded={deleteOpen} onClick={() => setDeleteOpen(true)}>Eliminar {deleteScope === "series" ? "esta y las siguientes" : "actividad"}</Button>
      <InlineConfirmation open={deleteOpen} title="Revisar eliminación" destructive busy={isDeleting}
        fallbackFocusRef={deleteButtonRef}
        disabled={isSubmitting || (needsAttendanceConfirmation && !confirmAttendance)} confirmLabel="Confirmar eliminación" cancelLabel="Conservar actividad"
        onConfirm={() => void remove()} onCancel={() => { setDeleteOpen(false); setConfirmAttendance(false); setNeedsAttendanceConfirmation(false); }}>
        {deleteScope === "series" ? `Se eliminarán esta y las siguientes ocurrencias futuras sin asistencia, desde el ${formatActivityCalendarDate(activity.values.starts_at.slice(0, 10))}. Las pasadas y las que tienen asistencia se conservan. ${activity.recurrenceSummary ?? ""}` : "Se eliminará solo esta actividad. Las demás ocurrencias de la serie se conservan."}
        {isDirty && <span className="mt-2 block">Los cambios sin guardar de este formulario también se descartarán.</span>}
        {needsAttendanceConfirmation && <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmAttendance} disabled={busy} onChange={event => setConfirmAttendance(event.target.checked)} />Confirmo eliminar también la asistencia registrada de esta actividad.</label>}
      </InlineConfirmation>
    </section>}
  </div>;
}
