import type { Metadata } from "next";
import Link from "next/link";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { previewInvitation } from "./actions";
import { InvitationForm } from "./invitation-form";

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
      <CardHeader><CardTitle>Aceptar invitación</CardTitle>
        {preview?.data && <CardDescription>Te invitaron a {preview.data.group_name} como {MEMBERSHIP_ROLE_LABELS[preview.data.role]}.</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">
        {preview.error ? <p role="alert">{preview.error}</p>
          : <InvitationForm token={token} signedInEmail={user?.email} />}
        <p className="text-sm"><Link href={user ? "/" : "/login"} className="underline">{user ? "Volver al inicio" : "Ir a iniciar sesión"}</Link></p>
      </CardContent>
    </Card>
  </main>;
}
