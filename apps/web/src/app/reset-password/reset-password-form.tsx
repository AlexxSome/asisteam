"use client";

import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordResetSchema, type PasswordResetInput } from "@asisteam/core";
import { ActionLink, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { resetPassword } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PasswordResetInput>({ resolver: zodResolver(passwordResetSchema) });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await resetPassword(token, values);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        window.history.replaceState(null, "", "/reset-password");
      }
    } catch {
      setError("No pudimos conectar. Revisa tu conexión o solicita un nuevo enlace.");
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

  if (success) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.</Alert>
        <ActionLink href="/login">Iniciar sesión</ActionLink>
      </div>
    );
  }

  return (
    <form aria-busy={isSubmitting} onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="password" label="Nueva contraseña" error={errors.password?.message} help="Entre 10 y 128 caracteres.">
        <Input type="password" autoComplete="new-password"
          {...register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirmar nueva contraseña" error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password"
          {...register("confirmPassword")} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Guardar nueva contraseña
      </Button>
      <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Guardando…" : ""}</p>
    </form>
  );
}
