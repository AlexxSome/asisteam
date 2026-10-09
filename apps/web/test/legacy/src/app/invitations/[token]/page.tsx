// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import type { Metadata } from "next";
import Link from "next/link";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@legacy/lib/supabase/server";
import { previewInvitation } from "@legacy/app/invitations/[token]/actions";
import { InvitationForm } from "@legacy/app/invitations/[token]/invitation-form";

export const metadata: Metadata = { title: "Aceptar invitación", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitationPage({ params }: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewInvitation(token);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <main className="flex min-h-screen items-center justify-center p-4">
    <Card className="w-full max-w-lg">
      <CardHeader><CardTitle as="h1">{preview.data?.managed_activation ? "Activar mi cuenta" : "Aceptar invitación"}</CardTitle>
        {preview?.data && <CardDescription>{preview.data.managed_activation
          ? `Activa tu acceso personal a ${preview.data.group_name}. Conservarás tus grupos y tu historial de asistencia.`
          : `Te invitaron a ${preview.data.group_name} como ${MEMBERSHIP_ROLE_LABELS[preview.data.role]}.`}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">
        {preview.error ? <p role="alert">{preview.error}</p>
          : <InvitationForm token={token} signedInEmail={user?.email} managedActivation={preview.data?.managed_activation} />}
        <p className="text-sm"><Link href={user ? "/" : "/login"} className="underline">{user ? "Volver al inicio" : "Ir a iniciar sesión"}</Link></p>
      </CardContent>
    </Card>
  </main>;
}
