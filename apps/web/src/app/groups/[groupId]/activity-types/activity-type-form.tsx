"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { activityTypeUpdateSchema, type ActivityTypeUpdateInput } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createActivityType, updateActivityType } from "./actions";

const defaults: ActivityTypeUpdateInput = { name: "", color: "#6B7280", is_active: true };
const palette = [
  { name: "Gris", value: "#6B7280" }, { name: "Azul", value: "#2563EB" },
  { name: "Verde", value: "#15803D" }, { name: "Ámbar", value: "#B45309" },
  { name: "Rojo", value: "#DC2626" }, { name: "Violeta", value: "#7C3AED" },
];

export function ActivityTypeForm({ groupId, activityType }: {
  groupId: string; activityType?: { id: string; name: string; color: string; is_active: boolean };
}) {
  const id = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(!activityType);
  const [advanced, setAdvanced] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const { register, handleSubmit, reset, setError, setValue, setFocus, watch, formState: { errors, isSubmitting } } = useForm<ActivityTypeUpdateInput>({
    resolver: zodResolver(activityTypeUpdateSchema),
    defaultValues: activityType ? { name: activityType.name, color: activityType.color, is_active: activityType.is_active } : defaults,
  });
  useEffect(() => {
    if (!activityType) return;
    if (editing && !wasEditing.current) setFocus("name");
    else if (!editing && wasEditing.current) trigger.current?.focus();
    wasEditing.current = editing;
  }, [editing, activityType, setFocus]);
  const color = watch("color");
  const active = watch("is_active");
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
        if (result.error.details.color) setAdvanced(true);
        return;
      }
      setFeedback({ error: false, message: activityType ? "Tipo de actividad actualizado." : "Tipo creado. Ya está disponible al crear actividades." });
      if (activityType) setEditing(false);
      else reset(defaults);
      router.refresh();
    } catch {
      setFeedback({ error: true, message: "No pudimos confirmar el cambio. Recarga la lista antes de reintentar." });
    }
  }, invalid => { if (invalid.color) setAdvanced(true); });
  return <div className="space-y-3">
    {activityType && !editing ? <Button ref={trigger} type="button" variant="secondary" aria-expanded={false}
      onClick={() => { reset({ name: activityType.name, color: activityType.color, is_active: activityType.is_active }); setFeedback(null); setEditing(true); }}>
      Editar {activityType.name}
    </Button> : <form onSubmit={submit} noValidate className="space-y-3" aria-label={activityType ? `Editar ${activityType.name}` : "Crear tipo de actividad"}>
      <fieldset disabled={isSubmitting} className="min-w-0 space-y-4 disabled:opacity-60">
        <Field id={`${id}-name`} label="Nombre" error={errors.name?.message}>
          <Input maxLength={40} {...register("name")} />
        </Field>
        <fieldset className="min-w-0 space-y-2" aria-describedby={errors.color ? `${id}-color-error` : undefined}>
          <legend className="text-label">Color</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{palette.map(option => <label key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-small has-[:checked]:border-primary has-[:checked]:bg-info-subtle">
            <input type="radio" name={`${id}-palette`} value={option.value} checked={color.toUpperCase() === option.value}
              onChange={() => setValue("color", option.value, { shouldDirty: true, shouldValidate: true })} />
            <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ backgroundColor: option.value }} />{option.name}
          </label>)}</div>
          <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}>
            <summary className="min-h-11 cursor-pointer content-center text-small underline">Color personalizado (avanzado)</summary>
            <Field id={`${id}-color`} label="Color hexadecimal" error={errors.color?.message} help="Opcional: usa un código de 6 dígitos, por ejemplo #2563EB.">
              <Input maxLength={7} spellCheck={false} {...register("color")} />
            </Field>
          </details>
          {!palette.some(option => option.value === color.toUpperCase()) && !errors.color && <p className="flex items-center gap-2 text-small">
            <span aria-hidden className="size-4 rounded-full" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(color) ? color : undefined }} />Color personalizado seleccionado
          </p>}
        </fieldset>
        {activityType && <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" aria-describedby={`${id}-availability`} className="size-5 shrink-0" {...register("is_active")} />Disponible para nuevas actividades</label>
          <p id={`${id}-availability`} className="text-small text-muted-foreground">{active
            ? "Al desactivarlo dejará de ofrecerse para nuevas actividades. Las actividades existentes y su historial se conservan."
            : "Al guardar, este tipo no se ofrecerá para nuevas actividades. No se cancelan ni modifican actividades ya programadas; su historial se conserva."}</p>
        </div>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={isSubmitting}>{activityType ? "Guardar cambios" : "Crear tipo"}</Button>
          {activityType && <Button type="button" variant="secondary" onClick={() => { setEditing(false); setFeedback(null); }}>Cancelar edición</Button>}
        </div>
      </fieldset>
    </form>}
    {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-destructive" : "text-small"}>{feedback.message}</p>}
  </div>;
}
