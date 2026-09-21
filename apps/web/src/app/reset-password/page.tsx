import type { Metadata } from "next";
import Link from "next/link";
import { recoveryTokenSchema } from "@asisteam/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// AUT-04: el token se comprueba y consume solo en la Server Action.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parsed = recoveryTokenSchema.safeParse((await searchParams).token);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restablecer contraseña</CardTitle>
          <CardDescription>Define una nueva contraseña para recuperar tu acceso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {parsed.success ? <ResetPasswordForm token={parsed.data} /> : (
            <p role="alert" className="text-sm text-destructive">El enlace es inválido o está incompleto. Solicita uno nuevo.</p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="underline underline-offset-4">Solicitar un nuevo enlace</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
