import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { joinCodeSchema } from "@asisteam/core";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

// Pantalla AUT-01 (docs/05-pantallas.md).
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ invite_code?: string }>;
}) {
  const parsedCode = joinCodeSchema.safeParse((await searchParams).invite_code);
  const inviteCode = parsedCode.success ? parsedCode.data : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(inviteCode ? `/join?code=${inviteCode}` : "/welcome");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Ingresa con tu email y contraseña para acceder a tus grupos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm inviteCode={inviteCode} />
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="underline underline-offset-4">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="underline underline-offset-4">
              Crea una
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
