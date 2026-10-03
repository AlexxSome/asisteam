"use client";

import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@asisteam/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { registerUser } from "./actions";

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await registerUser(values);
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

      <Field id="birthdate" label="Fecha de nacimiento" error={errors.birthdate?.message}>
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
        <Input
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>

      {serverError && (
        <Alert>{serverError}</Alert>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Crear cuenta
      </Button>
      <p role="status" className="text-small text-muted-foreground">{isSubmitting ? "Creando cuenta…" : ""}</p>
    </form>
  );
}
