"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordResetSchema, type PasswordResetInput } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PasswordResetInput>({ resolver: zodResolver(passwordResetSchema) });

  const onSubmit = handleSubmit(async (values) => {
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

  if (success) {
    return (
      <div className="space-y-4">
        <p role="status">Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.</p>
        <Link href="/login" className="text-sm underline underline-offset-4">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" type="password" autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-help password-error" : "password-help"}
          {...register("password")} />
        <p id="password-help" className="text-sm text-muted-foreground">Entre 10 y 128 caracteres.</p>
        {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? "confirmation-error" : undefined}
          {...register("confirmPassword")} />
        {errors.confirmPassword && <p id="confirmation-error" className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
