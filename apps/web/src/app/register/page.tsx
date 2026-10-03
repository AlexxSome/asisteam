import type { Metadata } from "next";
import { ActionLink } from "@/components/ui/button";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./register-form";
import { SocialLoginButtons } from "@/components/social-login-buttons";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

// Pantalla AUT-02 (docs/05-pantallas.md).
export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/welcome");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Crear cuenta</CardTitle>
          <CardDescription>
            Regístrate con Google, Apple o tu email para administrar o participar en tus grupos
            deportivos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SocialLoginButtons />
          <p className="text-center text-sm text-muted-foreground">O crea una cuenta con tu email</p>
          <RegisterForm />
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <ActionLink href="/login">
              Inicia sesión
            </ActionLink>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
