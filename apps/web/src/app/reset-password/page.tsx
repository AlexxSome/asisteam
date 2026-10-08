import type { Metadata } from "next";
import { cookies } from "next/headers";
import { recoveryTokenSchema } from "@asisteam/core";
import { AuthLayout } from "@/components/auth-layout";
import { ActionLink } from "@/components/ui/button";
import { authPath, parseInviteCode, RECOVERY_INVITE_COOKIE, type AuthSearchParams } from "@/lib/auth-context";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// AUT-04: el token se comprueba y consume solo en la Server Action.
export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<AuthSearchParams & { token?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = recoveryTokenSchema.safeParse(params.token);
  const inviteCode = parseInviteCode(params.invite_code)
    ?? parseInviteCode((await cookies()).get(RECOVERY_INVITE_COOKIE)?.value);
  return <AuthLayout title="Restablecer contraseña" description="Define una nueva contraseña para recuperar tu acceso." inviteCode={inviteCode}>
    <ResetPasswordForm token={parsed.success ? parsed.data : ""} inviteCode={inviteCode} />
    <p className="text-center text-small text-muted-foreground">
      <ActionLink href={authPath("/forgot-password", inviteCode)}>Solicitar un nuevo enlace</ActionLink>
    </p>
    <p className="text-center text-small text-muted-foreground">
      <ActionLink href={authPath("/login", inviteCode)}>Volver a iniciar sesión</ActionLink>
    </p>
  </AuthLayout>;
}
