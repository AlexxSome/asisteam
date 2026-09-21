"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invitationFormSchema, MEMBERSHIP_ROLE_LABELS, SEND_INVITATION_ERROR_MESSAGES, type InvitationFormInput } from "@asisteam/core";
import { sendInvitation } from "./actions";

const fieldClass = "w-full min-h-11 rounded-md border bg-background px-3 py-2";
const buttonClass = "min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50";
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
        setFeedback({ success: "Invitación enviada. El enlace vence en 7 días." });
        reset({ email: "", role: values.role });
      }
    } catch { setFeedback({ error: SEND_INVITATION_ERROR_MESSAGES.unavailable }); }
    router.refresh();
  });
  return <form onSubmit={submit} className="max-w-xl space-y-4" noValidate>
    <div className="space-y-2"><label htmlFor="invitation-email">Email</label>
      <input id="invitation-email" type="email" autoComplete="email" maxLength={254} className={fieldClass}
        aria-invalid={!!errors.email} aria-describedby="invitation-email-error" {...register("email")} />
      <p id="invitation-email-error" className="text-sm text-destructive">{errors.email?.message}</p>
    </div>
    <div className="space-y-2"><label htmlFor="invitation-role">Rol en el grupo</label>
      <select id="invitation-role" className={fieldClass} aria-invalid={!!errors.role} aria-describedby="invitation-role-error" {...register("role")}>
        {(["ATHLETE", "GUARDIAN"] as const).map(role => <option key={role} value={role}>{MEMBERSHIP_ROLE_LABELS[role]}</option>)}
      </select><p id="invitation-role-error" className="text-sm text-destructive">{errors.role?.message}</p>
    </div>
    <p className="text-sm text-muted-foreground">La persona recibirá un enlace para registrarse o aceptar con su cuenta. Los menores necesitan un apoderado y su consentimiento antes de activar la cuenta.</p>
    <button type="submit" className={buttonClass} disabled={isSubmitting}>{isSubmitting ? "Enviando…" : "Enviar invitación"}</button>
  </form>;
}

export function ResendInvitationButton({ groupId, invitationId }: { groupId: string; invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const setFeedback = useContext(FeedbackContext);
  const resend = async () => {
    setPending(true); setFeedback({});
    try {
      const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitationId });
      if ("error" in result) setFeedback({ error: result.error.message });
      else setFeedback({ success: "Invitación reenviada. El enlace anterior quedó invalidado." });
    } catch { setFeedback({ error: SEND_INVITATION_ERROR_MESSAGES.unavailable }); }
    finally { setPending(false); router.refresh(); }
  };
  return <div className="space-y-2">
    <button type="button" disabled={pending} onClick={resend} className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50">
      {pending ? "Reenviando…" : "Reenviar invitación"}
    </button>
  </div>;
}
