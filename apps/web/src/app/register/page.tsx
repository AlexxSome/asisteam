import { AuthLayout } from "@/components/auth-layout";
import { ActionLink } from "@/components/ui/button";
import { authPath,invitationDestination,parseInviteCode,type AuthSearchParams } from "@/lib/auth-context";
import { getSocialProviderAvailability } from "@/lib/social-auth";
import { createSessionClient } from "@/lib/api/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";
export const metadata: Metadata = { title: "Crear cuenta" };
// Pantalla AUT-02 (docs/05-pantallas.md).
export default async function RegisterPage({ searchParams }: {
    searchParams: Promise<AuthSearchParams>;
}) {
    const inviteCode = parseInviteCode((await searchParams).invite_code);
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (user)
        redirect(invitationDestination(inviteCode));
    const providers = await getSocialProviderAvailability();
    return <AuthLayout title="Crear cuenta" description="Crea tu cuenta para administrar o participar en tus grupos deportivos." inviteCode={inviteCode}>
    <RegisterForm inviteCode={inviteCode} providers={providers}/>
    <p className="text-center text-small text-muted-foreground">
      ¿Ya tienes cuenta? <ActionLink href={authPath("/login", inviteCode)}>Inicia sesión</ActionLink>
    </p>
  </AuthLayout>;
}
