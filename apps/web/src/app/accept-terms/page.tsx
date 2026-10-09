import { AuthLayout } from "@/components/auth-layout";
import { consentReturnPath } from "@/lib/account-consent-routing";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptTermsForm } from "./accept-terms-form";
export const metadata: Metadata = { title: "Revisa las condiciones de tu cuenta", robots: { index: false, follow: false } };
export default async function AcceptTermsPage({ searchParams }: {
    searchParams: Promise<{
        return_to?: string | string[];
    }>;
}) {
    const returnTo = consentReturnPath((await searchParams).return_to);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect("/login");
    const { data: accepted, error } = await memberOperation(async (api) => (await api.getCurrentAccountConsent()).accepted);
    if (!error && accepted)
        redirect(returnTo);
    return <AuthLayout title="Revisa las condiciones de tu cuenta" description="Para continuar, revisa el aviso de uso y privacidad y registra tu aceptación. Iniciar sesión con Google o Apple no equivale a aceptar estas condiciones.">
    <AcceptTermsForm returnTo={returnTo}/>
  </AuthLayout>;
}
