"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { announcementSchema, type AnnouncementInput } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { useWallAnnouncement, useWallEditor } from "./wall-controls";
import { deleteAnnouncement, publishAnnouncement, updateAnnouncement } from "./actions";

type EditableAnnouncement = AnnouncementInput & { id: string; updated_at: string };

export function AnnouncementComposer({ groupId }: { groupId: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  return <section className="min-w-0 space-y-3" aria-label="Publicación de anuncios">
    <Button ref={trigger} type="button" variant={open ? "secondary" : "primary"} aria-expanded={open} aria-controls={id}
      onClick={() => { setOpen(!open); if (!open) setMessage(""); }}>{open ? "Ocultar editor" : "Publicar anuncio"}</Button>
    <div id={id} hidden={!open} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-h3">Nuevo anuncio</h2>
      <p className="text-small text-muted-foreground">Al ocultar el editor, conservas el borrador mientras sigas en esta página.</p>
      <AnnouncementForm groupId={groupId} active={open} onSaved={() => {
        setOpen(false); setMessage("Anuncio publicado."); trigger.current?.focus({ preventScroll: true });
      }} />
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function AnnouncementForm({ groupId, announcement, onSaved, active = true }: {
  groupId: string; announcement?: EditableAnnouncement; onSaved?: () => void; active?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // Preserve the version from opening the editor, even if server props change.
  const version = useRef(announcement?.updated_at);
  const { register, handleSubmit, reset, setFocus, formState: { errors, isSubmitting } } = useForm<AnnouncementInput>({
    resolver: zodResolver(announcementSchema), defaultValues: { title: announcement?.title ?? "", body: announcement?.body ?? "" },
  });
  useWallEditor(active || isSubmitting);
  useEffect(() => { if (active) setFocus("title"); }, [active, setFocus]);
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
      onSaved?.();
      router.refresh();
    } catch {
      setMessage({ error: true, text: "No pudimos confirmar el cambio. Actualiza el muro antes de reintentar." });
    }
  });
  return <form onSubmit={submit} noValidate className="space-y-3" aria-label={announcement ? "Editar anuncio" : "Publicar anuncio"}>
    <fieldset disabled={isSubmitting} className="min-w-0 space-y-3 disabled:opacity-60">
      <Field id={`${id}-title`} label="Título" error={errors.title?.message} help="Hasta 120 caracteres.">
        <Input maxLength={120} {...register("title")} />
      </Field>
      <Field id={`${id}-body`} label="Contenido" error={errors.body?.message} help="Hasta 5000 caracteres. Puedes separar el texto en párrafos.">
        <Textarea rows={7} maxLength={5000} {...register("body")} />
      </Field>
      <Button type="submit" loading={isSubmitting}>{isSubmitting ? "Guardando…" : announcement ? "Guardar cambios" : "Publicar anuncio"}</Button>
    </fieldset>
    {message && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
  </form>;
}

export function AnnouncementManagement({ groupId, announcement }: { groupId: string; announcement: EditableAnnouncement }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editTrigger = useRef<HTMLButtonElement>(null);
  const deleteVersion = useRef(announcement.updated_at);
  const announce = useWallAnnouncement();
  useWallEditor(confirming);
  const remove = async () => {
    setPending(true); setError(""); setMessage("");
    try {
      const result = await deleteAnnouncement(groupId, announcement.id, deleteVersion.current);
      if ("error" in result) setError(result.error.message);
      else {
        setConfirming(false);
        if (announce) announce("Anuncio eliminado.", true);
        else setMessage("Anuncio eliminado.");
        router.refresh();
      }
    } catch { setError("No pudimos confirmar la eliminación. Actualiza el muro antes de reintentar."); }
    finally { setPending(false); }
  };
  return <div className="space-y-3 border-t border-border pt-3">
    <div className="flex flex-wrap gap-3">
      <Button ref={editTrigger} type="button" variant="tertiary" disabled={pending || confirming} aria-expanded={editing} aria-controls={id}
        onClick={() => { setEditing(!editing); setMessage(""); }}>{editing ? "Cerrar edición" : "Editar anuncio"}</Button>
      <Button type="button" variant="tertiary" className="text-destructive" disabled={pending || editing || confirming}
        onClick={() => { deleteVersion.current = announcement.updated_at; setError(""); setConfirming(true); }}>Eliminar anuncio</Button>
    </div>
    {editing && <div id={id}>
      <AnnouncementForm groupId={groupId} announcement={announcement} onSaved={() => {
        setEditing(false); setMessage("Anuncio actualizado."); editTrigger.current?.focus({ preventScroll: true });
      }} />
    </div>}
    <InlineConfirmation open={confirming} title="Confirmar eliminación" confirmLabel="Confirmar eliminación" destructive busy={pending}
      onConfirm={remove} onCancel={() => { setConfirming(false); setError(""); }}>
      El anuncio «{announcement.title}» dejará de estar visible para todos los miembros del grupo.
    </InlineConfirmation>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
