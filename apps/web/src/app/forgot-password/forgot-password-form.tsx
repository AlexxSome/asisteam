"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordRecoverySchema, type PasswordRecoveryInput } from "@asisteam/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordRecovery } from "./actions";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PasswordRecoveryInput>({ resolver: zodResolver(passwordRecoverySchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await requestPasswordRecovery(values);
      setMessage(result.message);
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.");
    }
  });

  if (message) {
    return <p role="status" className="text-sm">{message}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email"
          aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")} />
        {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Enviando…" : "Enviar instrucciones"}
      </Button>
    </form>
  );
}
