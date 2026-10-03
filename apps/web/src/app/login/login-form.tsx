"use client";

import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput, type CheckinInput } from "@asisteam/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { loginUser } from "./actions";
import { SocialLoginButtons } from "@/components/social-login-buttons";

export function LoginForm({ inviteCode, checkin }: { inviteCode?: string; checkin?: CheckinInput } = {}) {
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
    const result = await loginUser(values, inviteCode, checkin);
    if (result?.error) setServerError(result.error);
  });

  const submittingRef = useRef(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try { await submit(event); }
    finally { submittingRef.current = false; }
  }

  return (
    <div className="space-y-4">
      <SocialLoginButtons context={{ invite_code: inviteCode, checkin }} disabled={isSubmitting} />
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
          <Input
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </Field>

        {serverError && (
          <Alert>{serverError}</Alert>
        )}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Iniciar sesión
        </Button>
        <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Iniciando sesión…" : ""}</p>
      </form>
    </div>
  );
}
