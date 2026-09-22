"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACTIVITY_WEEKDAYS, ACTIVITY_WEEKDAY_LABELS, activityFormSchema, activityTypeLabel, type ActivityFormInput, type ActivityScope } from "@asisteam/core";
import { createActivity, deleteActivity, updateActivity } from "./actions";

type ActivityType = { id: string; name: string; group_id: string | null };
const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";

export function ActivityForm({ groupId, types, activity }: { groupId: string; types: ActivityType[]; activity?: { id: string; recurring: boolean; values: ActivityFormInput } }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [scope, setScope] = useState<ActivityScope>("single");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [needsAttendanceConfirmation, setNeedsAttendanceConfirmation] = useState(false);
  const [confirmAttendance, setConfirmAttendance] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { register, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<ActivityFormInput>({
    resolver: zodResolver(activityFormSchema), defaultValues: activity?.values ?? { description: "", location: "", activity_type_id: "", recurrence_rule: null },
  });
  const recurrence = watch("recurrence_rule");
  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = activity ? await updateActivity(groupId, activity.id, values, scope) : await createActivity(groupId, values);
      if ("affected" in result) {
        router.push(`/groups/${groupId}/activities/${activity!.id}`);
        router.refresh();
        return;
      }
      if ("activityId" in result) {
        router.push(`/groups/${groupId}/activities/${result.activityId}`);
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
    setIsDeleting(true);
    setServerError(null);
    try {
      const result = await deleteActivity(groupId, activity.id, scope, confirmAttendance);
      if ("affected" in result) { router.push(`/groups/${groupId}/activities`); router.refresh(); return; }
      setServerError(result.error.message);
      if (result.error.code === "attendance_confirmation_required") setNeedsAttendanceConfirmation(true);
    } catch { setServerError("No pudimos confirmar la eliminación. Revisa la lista de actividades antes de reintentar."); }
    finally { setIsDeleting(false); }
  };
  return <form onSubmit={submit} className="max-w-xl space-y-5" noValidate>
    <p className="text-sm text-muted-foreground">Todos los horarios se ingresan en hora de Chile (America/Santiago).</p>
    {activity?.recurring && <fieldset className="space-y-2 rounded-md border p-4">
      <legend className="font-medium">Aplicar cambios a</legend>
      {(["single", "series"] as const).map((value) => <label key={value} className="flex min-h-11 items-center gap-3">
        <input type="radio" name="scope" value={value} checked={scope === value} disabled={isSubmitting || isDeleting} onChange={() => {
          setScope(value); setDeleteOpen(false); setNeedsAttendanceConfirmation(false); setConfirmAttendance(false); setServerError(null);
          if (value === "series") setValue("starts_at", activity.values.starts_at);
        }} />{value === "single" ? "Solo esta actividad" : "Esta y las siguientes"}
      </label>)}
      {scope === "series" && <p className="text-sm text-muted-foreground">Solo se modifican las actividades futuras sin asistencia registrada, desde esta ocurrencia. Se conservan sus fechas y días; puedes cambiar el horario y los demás datos.</p>}
    </fieldset>}
    <div className="space-y-2"><label htmlFor="title">Título</label>
      <input id="title" maxLength={120} className={fieldClass} aria-invalid={!!errors.title} aria-describedby="title-error" {...register("title")} />
      <p id="title-error" className="text-sm text-destructive">{errors.title?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="activity_type_id">Tipo de actividad</label>
      <select id="activity_type_id" className={fieldClass} aria-invalid={!!errors.activity_type_id} aria-describedby="type-error" {...register("activity_type_id")}>
        <option value="">Selecciona un tipo</option>
        {types.map((type) => <option key={type.id} value={type.id}>{activityTypeLabel(type.name, type.group_id === null)}</option>)}
      </select><p id="type-error" className="text-sm text-destructive">{errors.activity_type_id?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="location">Lugar (opcional)</label>
      <input id="location" maxLength={200} className={fieldClass} aria-invalid={!!errors.location} aria-describedby="location-error" {...register("location")} />
      <p id="location-error" className="text-sm text-destructive">{errors.location?.message}</p>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">{(["starts_at", "ends_at"] as const).map((field) => <div className="min-w-0 space-y-2" key={field}>
      <label htmlFor={field}>{field === "starts_at" ? "Inicio" : "Término"}</label>
      <input id={field} type="datetime-local" step={60} className={fieldClass} aria-invalid={!!errors[field]} aria-describedby={`${field}-error`}
        min={activity && scope === "series" && field === "starts_at" ? `${activity.values.starts_at.slice(0, 10)}T00:00` : undefined}
        max={activity && scope === "series" && field === "starts_at" ? `${activity.values.starts_at.slice(0, 10)}T23:59` : undefined}
        {...register(field)} />
      <p id={`${field}-error`} className="text-sm text-destructive">{errors[field]?.message}</p>
    </div>)}</div>
    {!activity && <fieldset className="space-y-3 rounded-md border p-4">
      <legend className="font-medium">Repetición</legend>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={!!recurrence} onChange={(event) => setValue("recurrence_rule", event.target.checked ? { freq: "WEEKLY", by_weekday: [], until: "" } : null, { shouldValidate: false })} />Repetir semanalmente</label>
      {recurrence && <>
        <p className="text-sm text-muted-foreground">Desde la fecha de inicio hasta la fecha de término, inclusive. Máximo 26 semanas y 150 actividades.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ACTIVITY_WEEKDAYS.map((day) => <label key={day} className="flex min-h-11 items-center gap-2">
          <input type="checkbox" value={day} {...register("recurrence_rule.by_weekday")} />{ACTIVITY_WEEKDAY_LABELS[day]}
        </label>)}</div>
        <label className="block space-y-2" htmlFor="recurrence-until"><span>Repetir hasta</span>
          <input id="recurrence-until" type="date" className={fieldClass} aria-describedby="recurrence-error" {...register("recurrence_rule.until")} />
        </label>
        <p id="recurrence-error" role={errors.recurrence_rule ? "alert" : undefined} className="text-sm text-destructive">{errors.recurrence_rule?.message ?? errors.recurrence_rule?.by_weekday?.message ?? errors.recurrence_rule?.until?.message}</p>
      </>}
    </fieldset>}
    <div className="space-y-2"><label htmlFor="description">Descripción (opcional)</label>
      <textarea id="description" maxLength={2000} rows={3} className={fieldClass} aria-invalid={!!errors.description} aria-describedby="description-error" {...register("description")} />
      <p id="description-error" className="text-sm text-destructive">{errors.description?.message}</p>
    </div>
    {serverError && <p role="alert" className="text-destructive">{serverError}</p>}
    <button type="submit" className="min-h-11 rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" disabled={isSubmitting || isDeleting}>
      {isSubmitting ? "Guardando…" : activity ? "Guardar cambios" : recurrence ? "Crear serie semanal" : "Crear actividad"}
    </button>
    {activity && <div className="space-y-3 border-t pt-5">
      {!deleteOpen ? <button type="button" className="min-h-11 rounded-md border px-4 py-2 text-destructive" disabled={isSubmitting || isDeleting} onClick={() => setDeleteOpen(true)}>Eliminar {scope === "series" ? "esta y las siguientes" : "actividad"}</button> : <div role="group" aria-label="Confirmar eliminación" className="space-y-3 rounded-md border border-destructive p-4">
        <p>{scope === "series" ? "Se eliminarán esta y las siguientes ocurrencias futuras sin asistencia. Las pasadas y las que tienen asistencia se conservan." : "Se eliminará solo esta actividad. Las demás ocurrencias de la serie se conservan."}</p>
        {needsAttendanceConfirmation && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmAttendance} onChange={(event) => setConfirmAttendance(event.target.checked)} />Confirmo eliminar también la asistencia registrada de esta actividad.</label>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="min-h-11 rounded-md bg-destructive px-4 py-2 text-white disabled:opacity-50" disabled={isSubmitting || isDeleting || (needsAttendanceConfirmation && !confirmAttendance)} onClick={remove}>{isDeleting ? "Eliminando…" : "Confirmar eliminación"}</button>
          <button type="button" className="min-h-11 rounded-md border px-4 py-2" disabled={isDeleting} onClick={() => { setDeleteOpen(false); setConfirmAttendance(false); setNeedsAttendanceConfirmation(false); }}>Cancelar</button>
        </div>
      </div>}
    </div>}
  </form>;
}
