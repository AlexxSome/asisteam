"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { groupFormSchema, type GroupFormInput } from "@asisteam/core";
import { createGroup } from "./actions";
import { rotateInviteCode, updateGroup } from "../[groupId]/actions";

const fieldClass = "min-h-11 w-full rounded-md border bg-background px-3 py-2";

export function GroupForm({ groupId, initialValues, inviteCode }: {
  groupId?: string; initialValues?: GroupFormInput; inviteCode?: string | null;
} = {}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState(inviteCode);
  const [rotating, setRotating] = useState(false);
  const [origin, setOrigin] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const joinPath = code ? `/join?code=${encodeURIComponent(code)}` : "";
  const joinLink = origin && joinPath ? `${origin}${joinPath}` : joinPath;
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<GroupFormInput>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: initialValues ?? { name: "", sport: "", description: "", logo_url: "" },
  });
  useEffect(() => {
    if (initialValues) reset(initialValues);
  }, [initialValues?.name, initialValues?.sport, initialValues?.description, initialValues?.logo_url, reset]);
  useEffect(() => { setCode(inviteCode); }, [inviteCode]);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const submit = handleSubmit(async (values) => {
    setServerError(null);
    setSaved(false);
    try {
      const result = groupId ? await updateGroup(groupId, values) : await createGroup(values);
      if ("groupId" in result) {
        router.push(`/groups/${result.groupId}`);
        return;
      }
      if ("success" in result) {
        setSaved(true);
        router.refresh();
        return;
      }
      setServerError(result.error.message);
      for (const [field, messages] of Object.entries(result.error.details)) {
        if (messages?.[0]) setError(field as keyof GroupFormInput, { message: messages[0] });
      }
    } catch {
      setServerError(groupId
        ? "No pudimos confirmar los cambios. Actualiza la página antes de volver a intentarlo."
        : "No pudimos confirmar la creación. Revisa Mis grupos antes de volver a intentarlo.");
    }
  });

  async function rotate() {
    if (!groupId || rotating) return;
    setRotating(true);
    setServerError(null);
    try {
      const result = await rotateInviteCode(groupId);
      if ("error" in result) setServerError(result.error.message);
      else {
        setCode(result.code);
        setShareMessage(null);
        router.refresh();
      }
    } catch {
      setServerError("No pudimos confirmar el nuevo código. Actualiza la página antes de volver a intentarlo.");
    } finally {
      setRotating(false);
    }
  }

  async function copyLink() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${joinPath}`);
      setShareMessage("Enlace copiado.");
    } catch {
      setShareMessage("No pudimos copiar el enlace. Selecciónalo para copiarlo manualmente.");
    }
  }

  return <div className="space-y-6"><form onSubmit={submit} noValidate className="space-y-5 rounded-lg border p-5">
    {groupId ? <h2 className="text-lg font-semibold">Datos del grupo</h2>
      : <p className="text-sm text-muted-foreground">Serás administrador del grupo. Las estadísticas del grupo estarán ocultas para deportistas y apoderados de forma predeterminada.</p>}
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
    {saved && <p role="status">Cambios guardados.</p>}
    <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">
      {isSubmitting ? groupId ? "Guardando…" : "Creando grupo…" : groupId ? "Guardar cambios" : "Crear grupo"}
    </button>
  </form>
    {groupId && <section id="invite" className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Código de invitación</h2>
      <p>Comparte este código con quienes quieras incorporar como deportistas.</p>
      <p className="font-mono text-xl tracking-widest" aria-label="Código de invitación">{code}</p>
      {code && <div className="space-y-2">
        <label htmlFor="invite-link" className="block">Enlace para unirse</label>
        <input id="invite-link" readOnly value={joinLink} className={fieldClass} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={copyLink} className="min-h-11 rounded-md border px-5 py-2">Copiar enlace</button>
        {shareMessage && <p role="status" className="text-sm">{shareMessage}</p>}
      </div>}
      <button type="button" disabled={rotating} onClick={rotate} className="min-h-11 rounded-md border px-5 py-2 disabled:opacity-50">
        {rotating ? "Regenerando…" : "Regenerar código"}
      </button>
      <p className="text-sm text-muted-foreground">El código anterior dejará de funcionar en cuanto se regenere.</p>
    </section>}
  </div>;
}
