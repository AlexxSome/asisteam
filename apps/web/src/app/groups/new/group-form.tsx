"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { groupFormSchema, type GroupFormInput } from "@asisteam/core";
import { createGroup } from "./actions";
import { rotateInviteCode, updateGroup } from "../[groupId]/actions";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
import { GroupLogo } from "@/components/app-shell";

export function GroupForm({ groupId, initialValues, inviteCode }: {
  groupId?: string; initialValues?: GroupFormInput; inviteCode?: string | null;
} = {}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState(inviteCode);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotateFeedback, setRotateFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const rotatingRef = useRef(false);
  const [origin, setOrigin] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const joinPath = code ? `/join?code=${encodeURIComponent(code)}` : "";
  const joinLink = origin && joinPath ? `${origin}${joinPath}` : joinPath;
  const { register, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting } } = useForm<GroupFormInput>({
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
    if (!groupId || rotatingRef.current) return;
    rotatingRef.current = true;
    setRotating(true);
    setRotateFeedback(null);
    try {
      const result = await rotateInviteCode(groupId);
      if ("error" in result) setRotateFeedback({ error: true, message: result.error.message });
      else {
        setCode(result.code);
        setShareMessage(null);
        setRotateFeedback({ error: false, message: "Código regenerado. Comparte el nuevo enlace; el anterior ya no funciona." });
        setConfirmRotate(false);
        router.refresh();
      }
    } catch {
      setRotateFeedback({ error: true, message: "No pudimos confirmar el nuevo código. Actualiza la página antes de volver a intentarlo." });
    } finally {
      rotatingRef.current = false;
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
    {!groupId && <aside aria-label="Antes de crear tu grupo" className="space-y-2 rounded-md bg-info-subtle p-4 text-sm">
      <h2 className="font-semibold">Configura ahora; activa deportistas con un plan</h2>
      <p>Puedes crear el grupo, completar su configuración y preparar actividades. Comienza con 0 cupos de deportistas; para activarlos necesitas el primer pago aprobado de una suscripción mensual.</p>
      <p>El club paga a Asisteam. No hay plan gratuito ni prueba gratuita. Después de crear el grupo podrás revisar los planes en Suscripción y continuar la configuración.</p>
    </aside>}
    <Field id="name" label="Nombre del grupo" error={errors.name?.message}>
      <Input maxLength={80} autoComplete="organization" {...register("name")} />
    </Field>
    <Field id="sport" label="Deporte o disciplina" error={errors.sport?.message}>
      <Input maxLength={50} {...register("sport")} />
    </Field>
    <Field id="description" label="Descripción (opcional)" error={errors.description?.message}>
      <Textarea rows={3} {...register("description")} />
    </Field>
    <Field id="logo_url" label="URL del logo (opcional)" error={errors.logo_url?.message}
      help="Pega el enlace público de una imagen (http o https). Si no está disponible, mostraremos las iniciales del grupo. También puedes dejarlo vacío.">
      <Input type="url" placeholder="https://..." {...register("logo_url")} />
    </Field>
    <div className="flex items-center gap-3" role="group" aria-label="Vista previa del logo">
      <GroupLogo key={watch("logo_url")} src={watch("logo_url")} name={watch("name")} preview />
      <p className="text-small text-muted-foreground">Vista previa del logo. Guarda los cambios para aplicarlo.</p>
    </div>
    {serverError && <p role="alert" className="text-destructive">{serverError}</p>}
    {saved && <p role="status">Cambios guardados.</p>}
    <Button type="submit" loading={isSubmitting}>{groupId ? "Guardar cambios" : "Crear grupo"}</Button>
  </form>
    {groupId && <section id="invite" className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Código de invitación</h2>
      <p>Comparte este código con quienes quieras incorporar como deportistas.</p>
      <output className="block font-mono text-xl tracking-widest" aria-label="Código de invitación">{code}</output>
      {code && <div className="space-y-2">
        <label htmlFor="invite-link" className="block">Enlace para unirse</label>
        <Input id="invite-link" readOnly value={joinLink} onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" variant="secondary" onClick={copyLink} disabled={rotating}>Copiar enlace</Button>
        {shareMessage && <p role="status" className="text-sm">{shareMessage}</p>}
      </div>}
      <Button type="button" variant="secondary" disabled={rotating} aria-expanded={confirmRotate}
        onClick={() => { setConfirmRotate(true); setRotateFeedback(null); }}>Regenerar código</Button>
      <InlineConfirmation open={confirmRotate} title="¿Reemplazar el código de invitación?" confirmLabel="Confirmar regeneración"
        busy={rotating} destructive onConfirm={() => void rotate()} onCancel={() => setConfirmRotate(false)}>
        El código {code} y el enlace para unirse que lo contiene dejarán de funcionar. Tendrás que compartir el nuevo enlace.
        Los integrantes actuales y las invitaciones por email no cambian.
      </InlineConfirmation>
      {rotateFeedback && <p role={rotateFeedback.error ? "alert" : "status"} className={rotateFeedback.error ? "text-destructive" : "text-small"}>{rotateFeedback.message}</p>}
      <p className="text-sm text-muted-foreground">Regenera solo si necesitas invalidar el código y el enlace compartidos.</p>
    </section>}
    {groupId && <Link href={`/groups/${groupId}`} className="inline-flex min-h-11 items-center underline">Volver al inicio del grupo</Link>}
  </div>;
}
