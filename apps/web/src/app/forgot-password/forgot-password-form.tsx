"use client";

import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordRecoverySchema, type PasswordRecoveryInput } from "@asisteam/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { requestPasswordRecovery } from "./actions";

export function ForgotPasswordForm({ inviteCode }: { inviteCode?: string } = {}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PasswordRecoveryInput>({ resolver: zodResolver(passwordRecoverySchema) });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await requestPasswordRecovery(values, inviteCode);
      setMessage(result.message);
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.");
    }
  });

  const submittingRef = useRef(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try { await submit(event); }
    finally { submittingRef.current = false; }
  }

  if (message) {
    return <div className="space-y-3"><Alert tone="success">{message}</Alert>{inviteCode && <p className="text-small text-muted-foreground">Abre el enlace en este navegador para conservar tu invitación. Si usas otro dispositivo, vuelve a abrir la invitación del grupo después de recuperar tu acceso.</p>}</div>;
  }

  return (
    <form aria-busy={isSubmitting} onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email"
          {...register("email")} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Enviar instrucciones
      </Button>
      <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Enviando…" : ""}</p>
    </form>
  );
}
