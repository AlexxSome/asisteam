"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invitationFormSchema, MEMBERSHIP_ROLE_LABELS, SEND_INVITATION_ERROR_MESSAGES, type InvitationFormInput } from "@asisteam/core";
import { sendInvitation } from "./actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { InlineConfirmation } from "@/components/ui/inline-confirmation";
type Feedback = { error?: string; success?: string };
const FeedbackContext = createContext<(feedback: Feedback) => void>(() => {});

export function InvitationFeedback({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback>({});
  return <FeedbackContext.Provider value={setFeedback}>
    {feedback.error && <p role="alert" className="text-destructive">{feedback.error}</p>}
    {feedback.success && <p role="status">{feedback.success}</p>}
    {children}
  </FeedbackContext.Provider>;
}

export function InvitationForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const setFeedback = useContext(FeedbackContext);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InvitationFormInput>({
    resolver: zodResolver(invitationFormSchema), defaultValues: { email: "", role: "ATHLETE" },
  });
  const submit = handleSubmit(async values => {
    setFeedback({});
    try {
      const result = await sendInvitation({ action: "send", group_id: groupId, ...values });
      if ("error" in result) setFeedback({ error: result.error.message });
      else {
        setFeedback({ success: "Envío de invitación confirmado. El enlace vence en 7 días. Esto no confirma su entrega ni lectura." });
        reset({ email: "", role: values.role });
        router.refresh();
      }
    } catch { setFeedback({ error: SEND_INVITATION_ERROR_MESSAGES.unavailable }); }
  });
  return <form onSubmit={submit} aria-busy={isSubmitting} className="max-w-xl space-y-4" noValidate>
    <Field id="invitation-email" label="Email" error={errors.email?.message}>
      <Input type="email" autoComplete="email" maxLength={254} {...register("email")} />
    </Field>
    <div className="space-y-2"><label htmlFor="invitation-role">Rol en el grupo</label>
      <select id="invitation-role" className="min-h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2" aria-invalid={!!errors.role} aria-describedby="invitation-role-error" {...register("role")}>
        {(["ATHLETE", "GUARDIAN"] as const).map(role => <option key={role} value={role}>{MEMBERSHIP_ROLE_LABELS[role]}</option>)}
      </select><p id="invitation-role-error" className="text-sm text-destructive">{errors.role?.message}</p>
    </div>
    <p className="text-sm text-muted-foreground">La persona recibirá un enlace para registrarse o aceptar con su cuenta. Los menores necesitan un apoderado y su consentimiento antes de activar la cuenta.</p>
    <Button type="submit" loading={isSubmitting}>Enviar invitación</Button>
  </form>;
}

export function ResendInvitationButton({ groupId, invitationId }: { groupId: string; invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pendingRef = useRef(false);
  const setSharedFeedback = useContext(FeedbackContext);
  const [feedback, setLocalFeedback] = useState<Feedback>({});
  const latestFeedback = useRef<Feedback>({});
  // A successful resend can remove this row. Keep its result visible after refresh.
  useEffect(() => () => {
    if (latestFeedback.current.error || latestFeedback.current.success) setSharedFeedback(latestFeedback.current);
  }, [setSharedFeedback]);
  const setFeedback = (value: Feedback) => { latestFeedback.current = value; setLocalFeedback(value); };
  const resend = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true); setSharedFeedback({}); setFeedback({});
    try {
      const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitationId });
      if ("error" in result) setFeedback({ error: result.error.message });
      else { setFeedback({ success: "Reenvío confirmado. El enlace anterior quedó invalidado; el nuevo vence en 7 días. Esto no confirma su entrega ni lectura." }); setConfirm(false); router.refresh(); }
    } catch { setFeedback({ error: SEND_INVITATION_ERROR_MESSAGES.unavailable }); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <div className="space-y-2">
    <Button type="button" variant="secondary" disabled={pending} aria-expanded={confirm} onClick={() => setConfirm(true)}>Reenviar invitación</Button>
    <InlineConfirmation open={confirm} title="¿Reenviar esta invitación?" confirmLabel="Confirmar reenvío" busy={pending}
      onConfirm={() => void resend()} onCancel={() => setConfirm(false)}>
      El enlace anterior dejará de funcionar. Se enviará uno nuevo al mismo destinatario, con el mismo rol y un vencimiento de 7 días.
    </InlineConfirmation>
    {feedback.error && <p role="alert" className="text-destructive">{feedback.error}</p>}
    {feedback.success && <p role="status" className="text-small">{feedback.success}</p>}
  </div>;
}
