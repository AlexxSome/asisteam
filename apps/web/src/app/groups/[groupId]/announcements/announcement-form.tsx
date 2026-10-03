"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { announcementSchema, type AnnouncementInput } from "@asisteam/core";
import { deleteAnnouncement, publishAnnouncement, updateAnnouncement } from "./actions";

const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";
type EditableAnnouncement = AnnouncementInput & { id: string; updated_at: string };

export function AnnouncementForm({ groupId, announcement, onSaved }: { groupId: string; announcement?: EditableAnnouncement; onSaved?: () => void }) {
  const id = useId();
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // Mantiene la versión original del formulario abierto, incluso si el muro se refresca.
  const version = useRef(announcement?.updated_at);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AnnouncementInput>({
    resolver: zodResolver(announcementSchema), defaultValues: { title: announcement?.title ?? "", body: announcement?.body ?? "" },
  });
  const submit = handleSubmit(async (input) => {
    setMessage(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = announcement
        ? await updateAnnouncement(groupId, announcement.id, version.current!, input)
        : await publishAnnouncement(groupId, requestId.current, input);
      if ("error" in result) { setMessage({ error: true, text: result.error.message }); return; }
      if (!announcement) { reset({ title: "", body: "" }); requestId.current = null; }
      setMessage({ error: false, text: announcement ? "Anuncio actualizado." : "Anuncio publicado." });
      router.refresh();
      onSaved?.();
    } catch {
      setMessage({ error: true, text: "No pudimos confirmar el cambio. Actualiza el muro antes de reintentar." });
    }
  });
  return <form onSubmit={submit} noValidate className="space-y-3" aria-label={announcement ? "Editar anuncio" : "Publicar anuncio"}>
    <fieldset disabled={isSubmitting} className="space-y-3 disabled:opacity-60">
      <div><label htmlFor={`${id}-title`}>Título</label>
        <input id={`${id}-title`} maxLength={120} className={fieldClass} aria-invalid={!!errors.title} aria-describedby={`${id}-title-error`} {...register("title")} />
        <p id={`${id}-title-error`} className="text-sm text-destructive">{errors.title?.message}</p>
      </div>
      <div><label htmlFor={`${id}-body`}>Contenido</label>
        <textarea id={`${id}-body`} rows={5} maxLength={5000} className={fieldClass} aria-invalid={!!errors.body} aria-describedby={`${id}-body-error`} {...register("body")} />
        <p id={`${id}-body-error`} className="text-sm text-destructive">{errors.body?.message}</p>
      </div>
      <button type="submit" className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground">{isSubmitting ? "Guardando…" : announcement ? "Guardar cambios" : "Publicar anuncio"}</button>
    </fieldset>
    {message && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
  </form>;
}

export function AnnouncementManagement({ groupId, announcement }: { groupId: string; announcement: EditableAnnouncement }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deleteVersion = useRef(announcement.updated_at);
  const remove = async () => {
    setPending(true); setError("");
    try {
      const result = await deleteAnnouncement(groupId, announcement.id, deleteVersion.current);
      if ("error" in result) setError(result.error.message);
      else { setConfirming(false); router.refresh(); }
    } catch { setError("No pudimos confirmar la eliminación. Actualiza el muro antes de reintentar."); }
    finally { setPending(false); }
  };
  return <div className="space-y-3 border-t pt-3">
    <div className="flex flex-wrap gap-4">
      <button type="button" disabled={pending} className="min-h-11 underline" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Cerrar edición" : "Editar anuncio"}</button>
      <button type="button" disabled={pending} className="min-h-11 text-destructive underline" onClick={() => { deleteVersion.current = announcement.updated_at; setConfirming(true); }}>Eliminar anuncio</button>
    </div>
    {editing && <AnnouncementForm groupId={groupId} announcement={announcement} onSaved={() => setEditing(false)} />}
    {confirming && <div className="space-y-2 rounded border p-3" role="group" aria-label="Confirmar eliminación">
      <p>¿Eliminar este anuncio del muro de todos los miembros?</p>
      <div className="flex gap-4"><button type="button" disabled={pending} className="min-h-11 text-destructive underline" onClick={remove}>Confirmar eliminación</button>
        <button type="button" disabled={pending} className="min-h-11 underline" onClick={() => setConfirming(false)}>Cancelar</button></div>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
