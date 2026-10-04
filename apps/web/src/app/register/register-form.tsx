"use client";

import { useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACCOUNT_TERMS_VERSION, registerSchema, type RegisterInput } from "@asisteam/core";
import { AccountTermsField } from "@/components/account-terms-field";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SocialLoginButtons } from "@/components/social-login-buttons";
import type { SocialProviderAvailability } from "@/lib/social-auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { registerUser } from "./actions";

export function RegisterForm({ inviteCode, providers }: { inviteCode?: string; providers?: SocialProviderAvailability } = {}) {
  const [socialPending, setSocialPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms_version: ACCOUNT_TERMS_VERSION },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await registerUser(values, inviteCode);
      if (result?.error) setServerError(result.error);
    } catch (error) {
      unstable_rethrow(error);
      setServerError("No pudimos conectar. Revisa tu conexión y vuelve a crear tu cuenta.");
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
      <SocialLoginButtons context={{ invite_code: inviteCode }} providers={providers} disabled={isSubmitting} onPendingChange={setSocialPending} />
      <p className="text-center text-small text-muted-foreground">O crea una cuenta con tu email</p>
    <form aria-busy={isSubmitting} onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="full_name" label="Nombre completo" error={errors.full_name?.message}>
        <Input
          autoComplete="name"
          {...register("full_name")}
        />
      </Field>

      <Field id="email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </Field>

      <Field id="birthdate" label="Fecha de nacimiento" help="La usamos para aplicar las reglas de participación de menores." error={errors.birthdate?.message}>
        <Input
          type="date"
          {...register("birthdate")}
        />
      </Field>

      <Field id="phone" label="Teléfono (opcional)" error={errors.phone?.message}>
        <Input
          type="tel"
          placeholder="+56912345678"
          autoComplete="tel"
          {...register("phone")}
        />
      </Field>

      <Field id="password" label="Contraseña" error={errors.password?.message} help="Mínimo 10 caracteres.">
        <PasswordInput
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>

      <AccountTermsField {...register("terms_accepted")} error={errors.terms_accepted?.message} versionError={errors.terms_version?.message} disabled={isSubmitting || socialPending} />

      {serverError && (
        <Alert>{serverError}</Alert>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting} disabled={socialPending}>
        Crear cuenta
      </Button>
      <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Creando cuenta…" : ""}</p>
    </form>
    </div>
  );
}
