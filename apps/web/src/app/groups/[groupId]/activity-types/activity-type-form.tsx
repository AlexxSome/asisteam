"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { activityTypeUpdateSchema, type ActivityTypeUpdateInput } from "@asisteam/core";
import { createActivityType, updateActivityType } from "./actions";

const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";
const defaults: ActivityTypeUpdateInput = { name: "", color: "#6B7280", is_active: true };

export function ActivityTypeForm({ groupId, activityType }: {
  groupId: string; activityType?: { id: string; name: string; color: string; is_active: boolean };
}) {
  const id = useId();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<ActivityTypeUpdateInput>({
    resolver: zodResolver(activityTypeUpdateSchema),
    defaultValues: activityType ? { name: activityType.name, color: activityType.color, is_active: activityType.is_active } : defaults,
  });
  const submit = handleSubmit(async (values) => {
    setFeedback(null);
    try {
      const result = activityType
        ? await updateActivityType(groupId, activityType.id, values)
        : await createActivityType(groupId, { name: values.name, color: values.color });
      if ("error" in result) {
        setFeedback({ error: true, message: result.error.message });
        for (const [field, messages] of Object.entries(result.error.details)) {
          if (messages?.[0]) setError(field as keyof ActivityTypeUpdateInput, { message: messages[0] });
        }
        return;
      }
      setFeedback({ error: false, message: activityType ? "Tipo de actividad actualizado." : "Tipo creado. Ya está disponible al crear actividades." });
      if (!activityType) reset(defaults);
      router.refresh();
    } catch {
      setFeedback({ error: true, message: "No pudimos confirmar el cambio. Recarga la lista antes de reintentar." });
    }
  });
  return <form onSubmit={submit} noValidate className="space-y-3" aria-label={activityType ? `Editar ${activityType.name}` : "Crear tipo de actividad"}>
    <fieldset disabled={isSubmitting} className="space-y-3 disabled:opacity-60">
      <div><label htmlFor={`${id}-name`}>Nombre</label>
        <input id={`${id}-name`} maxLength={40} className={fieldClass} aria-invalid={!!errors.name} aria-describedby={`${id}-name-error`} {...register("name")} />
        <p id={`${id}-name-error`} className="text-sm text-destructive">{errors.name?.message}</p>
      </div>
      <div><label htmlFor={`${id}-color`}>Color hexadecimal</label>
        <input id={`${id}-color`} maxLength={7} placeholder="#2563EB" spellCheck={false} className={fieldClass} aria-invalid={!!errors.color} aria-describedby={`${id}-color-error`} {...register("color")} />
        <p id={`${id}-color-error`} className="text-sm text-destructive">{errors.color?.message}</p>
      </div>
      {activityType && <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" {...register("is_active")} />Disponible para nuevas actividades
      </label>}
      <button type="submit" className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground">{isSubmitting ? "Guardando…" : activityType ? "Guardar cambios" : "Crear tipo"}</button>
    </fieldset>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-destructive" : "text-sm"}>{feedback.message}</p>}
  </form>;
}
