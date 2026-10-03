import type { Metadata } from "next";
import { ActionLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { joinCodeSchema, SOCIAL_AUTH_ERROR } from "@asisteam/core";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

// Pantalla AUT-01 (docs/05-pantallas.md).
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ invite_code?: string; social_error?: string }>;
}) {
  const params = await searchParams;
  const parsedCode = joinCodeSchema.safeParse(params.invite_code);
  const inviteCode = parsedCode.success ? parsedCode.data : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !params.social_error) redirect(inviteCode ? `/join?code=${inviteCode}` : "/welcome");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Iniciar sesión</CardTitle>
          <CardDescription>
            Ingresa con Google, Apple o tu email para acceder a tus grupos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.social_error && <Alert>{SOCIAL_AUTH_ERROR}</Alert>}
          <LoginForm inviteCode={inviteCode} />
          <p className="text-center text-sm text-muted-foreground">
            <ActionLink href="/forgot-password">
              ¿Olvidaste tu contraseña?
            </ActionLink>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <ActionLink href="/register">
              Crea una
            </ActionLink>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
