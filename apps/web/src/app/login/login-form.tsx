"use client";

import { useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput, type CheckinInput } from "@asisteam/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import type { SocialProviderAvailability } from "@/lib/social-auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { loginUser } from "./actions";
import { SocialLoginButtons } from "@/components/social-login-buttons";

export function LoginForm({ inviteCode, checkin, providers }: { inviteCode?: string; checkin?: CheckinInput; providers?: SocialProviderAvailability } = {}) {
  const [socialPending, setSocialPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await loginUser(values, inviteCode, checkin);
      if (result?.error) setServerError(result.error);
    } catch (error) {
      unstable_rethrow(error);
      setServerError("No pudimos conectar. Revisa tu conexión y vuelve a iniciar sesión.");
    }
  });

  const submittingRef = useRef(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || socialPending) return;
    submittingRef.current = true;
    try { await submit(event); }
    finally { submittingRef.current = false; }
  }

  return (
    <div className="space-y-4">
      <SocialLoginButtons context={{ invite_code: inviteCode, checkin }} disabled={isSubmitting} providers={providers} onPendingChange={setSocialPending} />
      <p className="text-center text-sm text-muted-foreground">O ingresa con tu email</p>
      <form aria-busy={isSubmitting} onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            {...register("email")}
          />
        </Field>

        <Field id="password" label="Contraseña" error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            {...register("password")}
          />
        </Field>

        {serverError && (
          <Alert>{serverError}</Alert>
        )}

        <Button type="submit" className="w-full" loading={isSubmitting} disabled={socialPending}>
          Iniciar sesión
        </Button>
        <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Iniciando sesión…" : ""}</p>
      </form>
    </div>
  );
}
