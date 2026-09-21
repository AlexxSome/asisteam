"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { activityFormSchema, activityTypeLabel, type ActivityFormInput } from "@asisteam/core";
import { createActivity } from "./actions";

type ActivityType = { id: string; name: string; group_id: string | null };
const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";

export function ActivityForm({ groupId, types }: { groupId: string; types: ActivityType[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ActivityFormInput>({
    resolver: zodResolver(activityFormSchema), defaultValues: { description: "", location: "", activity_type_id: "" },
  });
  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createActivity(groupId, values);
      if ("activityId" in result) {
        router.push(`/groups/${groupId}/activities/${result.activityId}`);
        return;
      }
      setServerError(result.error.message);
      for (const [field, messages] of Object.entries(result.error.details)) {
        if (messages?.[0]) setError(field as keyof ActivityFormInput, { message: messages[0] });
      }
    } catch {
      setServerError("No pudimos confirmar la creación. Revisa la lista de actividades antes de reintentar.");
    }
  });
  return <form onSubmit={submit} className="max-w-xl space-y-5" noValidate>
    <p className="text-sm text-muted-foreground">Todos los horarios se ingresan en hora de Chile (America/Santiago).</p>
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
      <input id={field} type="datetime-local" step={60} className={fieldClass} aria-invalid={!!errors[field]} aria-describedby={`${field}-error`} {...register(field)} />
      <p id={`${field}-error`} className="text-sm text-destructive">{errors[field]?.message}</p>
    </div>)}</div>
    <div className="space-y-2"><label htmlFor="description">Descripción (opcional)</label>
      <textarea id="description" maxLength={2000} rows={3} className={fieldClass} aria-invalid={!!errors.description} aria-describedby="description-error" {...register("description")} />
      <p id="description-error" className="text-sm text-destructive">{errors.description?.message}</p>
    </div>
    {serverError && <p role="alert" className="text-destructive">{serverError}</p>}
    <button type="submit" className="min-h-11 rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" disabled={isSubmitting}>
      {isSubmitting ? "Creando actividad…" : "Crear actividad"}
    </button>
  </form>;
}
