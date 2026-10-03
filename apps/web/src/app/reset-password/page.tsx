import type { Metadata } from "next";
import { ActionLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
          <CardTitle as="h1">Restablecer contraseña</CardTitle>
          <CardDescription>Define una nueva contraseña para recuperar tu acceso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {parsed.success ? <ResetPasswordForm token={parsed.data} /> : (
            <Alert>El enlace es inválido o está incompleto. Solicita uno nuevo.</Alert>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <ActionLink href="/forgot-password">Solicitar un nuevo enlace</ActionLink>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
