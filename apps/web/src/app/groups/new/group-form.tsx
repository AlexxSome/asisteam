"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { groupFormSchema, type GroupFormInput } from "@asisteam/core";
import { createGroup } from "./actions";

const fieldClass = "min-h-11 w-full rounded-md border bg-background px-3 py-2";

export function GroupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<GroupFormInput>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { name: "", sport: "", description: "", logo_url: "" },
  });
  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createGroup(values);
      if ("groupId" in result) {
        router.push(`/groups/${result.groupId}`);
        return;
      }
      setServerError(result.error.message);
      for (const [field, messages] of Object.entries(result.error.details)) {
        if (messages?.[0]) setError(field as keyof GroupFormInput, { message: messages[0] });
      }
    } catch {
      setServerError("No pudimos confirmar la creación. Revisa Mis grupos antes de volver a intentarlo.");
    }
  });

  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="text-sm text-muted-foreground">Serás administrador del grupo. Las estadísticas del grupo estarán ocultas para deportistas y apoderados de forma predeterminada.</p>
    <div className="space-y-2"><label htmlFor="name">Nombre del grupo</label>
      <input id="name" maxLength={80} autoComplete="organization" className={fieldClass} aria-invalid={!!errors.name} aria-describedby="name-error" {...register("name")} />
      <p id="name-error" className="text-sm text-destructive">{errors.name?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="sport">Deporte o disciplina</label>
      <input id="sport" maxLength={50} className={fieldClass} aria-invalid={!!errors.sport} aria-describedby="sport-error" {...register("sport")} />
      <p id="sport-error" className="text-sm text-destructive">{errors.sport?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="description">Descripción (opcional)</label>
      <textarea id="description" rows={3} className={fieldClass} aria-invalid={!!errors.description} aria-describedby="description-error" {...register("description")} />
      <p id="description-error" className="text-sm text-destructive">{errors.description?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="logo_url">URL del logo (opcional)</label>
      <input id="logo_url" type="url" placeholder="https://..." className={fieldClass} aria-invalid={!!errors.logo_url} aria-describedby="logo-error" {...register("logo_url")} />
      <p id="logo-error" className="text-sm text-destructive">{errors.logo_url?.message}</p>
    </div>
    {serverError && <p role="alert" className="text-destructive">{serverError}</p>}
    <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">
      {isSubmitting ? "Creando grupo…" : "Crear grupo"}
    </button>
  </form>;
}
