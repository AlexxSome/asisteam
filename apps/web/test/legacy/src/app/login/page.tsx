// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SOCIAL_AUTH_ERROR } from "@asisteam/core";
import { AuthLayout } from "@/components/auth-layout";
import { ActionLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@legacy/lib/supabase/server";
import { authPath, invitationDestination, parseInviteCode, type AuthSearchParams } from "@/lib/auth-context";
import { getSocialProviderAvailability } from "@legacy/lib/social-auth";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Pantalla AUT-01 (docs/05-pantallas.md).
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<AuthSearchParams & { social_error?: string }>;
}) {
  const params = await searchParams;
  const inviteCode = parseInviteCode(params.invite_code);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !params.social_error) redirect(invitationDestination(inviteCode));
  const providers = await getSocialProviderAvailability();

  return <AuthLayout title="Iniciar sesión" description="Accede a tus grupos con tu email o una cuenta social disponible." inviteCode={inviteCode}>
    {params.social_error && <Alert>{SOCIAL_AUTH_ERROR}</Alert>}
    <LoginForm inviteCode={inviteCode} providers={providers} />
    <p className="text-center text-small text-muted-foreground">
      <ActionLink href={authPath("/forgot-password", inviteCode)}>¿Olvidaste tu contraseña?</ActionLink>
    </p>
    <p className="text-center text-small text-muted-foreground">
      ¿No tienes cuenta? <ActionLink href={authPath("/register", inviteCode)}>Crea una</ActionLink>
    </p>
  </AuthLayout>;
}
