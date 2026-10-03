import type { Metadata } from "next";
import { ActionLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

// AUT-03: pública, incluso si hay otra cuenta abierta en este navegador.
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Recuperar contraseña</CardTitle>
          <CardDescription>Ingresa tu email para recibir un enlace válido por 60 minutos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ForgotPasswordForm />
          <p className="text-center text-sm text-muted-foreground">
            <ActionLink href="/login">Volver a iniciar sesión</ActionLink>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
