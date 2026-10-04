import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth-layout";
import { ActionLink } from "@/components/ui/button";
import { authPath, parseInviteCode, type AuthSearchParams } from "@/lib/auth-context";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

// AUT-03: pública, incluso si hay otra cuenta abierta en este navegador.
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<AuthSearchParams> }) {
  const inviteCode = parseInviteCode((await searchParams).invite_code);
  return <AuthLayout title="Recuperar contraseña" description="Ingresa tu email para recibir un enlace válido por 60 minutos." inviteCode={inviteCode}>
    <ForgotPasswordForm inviteCode={inviteCode} />
    <p className="text-center text-small text-muted-foreground">
      <ActionLink href={authPath("/login", inviteCode)}>Volver a iniciar sesión</ActionLink>
    </p>
  </AuthLayout>;
}
