import { ActionLink } from "@/components/ui/button";
import { SUPPORT_EMAIL, SUPPORT_REQUEST_URLS } from "@/lib/support";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { OwnProfile } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { AvatarPermissions, type AvatarPermission } from "./avatar-permissions";

export const metadata = { title: "Mi perfil" };
export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("id, full_name, email, phone, birthdate, avatar_url").eq("auth_user_id", user.id).single<OwnProfile>();
  if (!profile) return <AppShell><div className="mx-auto max-w-xl space-y-6"><h1>Mi perfil</h1><p role="alert">No pudimos cargar tu perfil. Vuelve a intentarlo.</p><Link href="/groups">Volver</Link></div></AppShell>;
  const [{ data: allowed }, { data: requests }, { data: adminRoles }, { data: avatarPermissions }] = await Promise.all([
    supabase.rpc("can_upload_avatar"),
    supabase.from("birthdate_change_requests").select("id, requested_birthdate, status").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("memberships").select("id").eq("user_id", profile.id).eq("role", "ADMIN").eq("status", "ACTIVE").limit(1),
    supabase.rpc("list_avatar_permissions"),
  ]);
  const request = requests?.[0];
  return <AppShell><div className="mx-auto max-w-xl space-y-6">
    <Link href="/groups" className="text-sm underline">Volver a mis grupos</Link>
    <header><h1 className="text-2xl font-semibold">Mi perfil</h1><p className="mt-2 text-muted-foreground">Tus datos son los mismos en todos tus grupos.</p></header>
    {request && <aside className="rounded-lg border p-4" aria-label="Estado de corrección de fecha">
      <p className="font-medium">Corrección a {String(request.requested_birthdate).split("-").reverse().join("/")}</p>
      <p className="text-sm">{request.status === "PENDING" ? "Pendiente: un ADMIN de cada grupo debe confirmarla. Contacta a tus administradores. Si eres ADMIN, debe revisarla otro administrador; no puedes aprobar tu propia solicitud."
        : request.status === "APPLIED" ? "Confirmada y aplicada." : request.status === "REJECTED" ? "Rechazada: tu fecha anterior se conserva. Puedes enviar una nueva corrección." : "Cancelada porque enviaste otra fecha o cambió tu perfil."}</p>
    </aside>}
    <ProfileForm key={profile.id} profile={profile} avatarAllowed={allowed === true} />
    <AvatarPermissions permissions={(avatarPermissions ?? []) as AvatarPermission[]} />
    <section aria-labelledby="account-title" className="space-y-4 border-t pt-6">
      <h2 id="account-title" className="text-lg font-semibold">Cuenta y seguridad</h2>
      <p className="text-small text-muted-foreground">Para cambiar tu contraseña, usa la recuperación por email. Recibirás las instrucciones del flujo de recuperación de acceso.</p>
      <ActionLink href="/forgot-password">Recuperar o cambiar contraseña</ActionLink>
      <p className="text-small">Para cerrar la sesión en este dispositivo, abre <strong>Mi cuenta</strong> en la cabecera y elige <strong>Cerrar sesión</strong>.</p>
    </section>
    <section id="privacy" aria-labelledby="privacy-title" className="space-y-4 border-t pt-6 scroll-mt-6">
      <h2 id="privacy-title" className="text-lg font-semibold">Privacidad y soporte</h2>
      <ActionLink href="/legal/2026-09-21#privacidad">Consultar condiciones y privacidad</ActionLink>
      <p className="text-small">Puedes solicitar una copia de tus datos, su supresión o la revocación de un consentimiento. Si actúas por un menor, indica que eres su apoderado; soporte revisará la solicitud y la representación antes de tramitarla.</p>
      <ul className="space-y-2">
        <li><ActionLink href={SUPPORT_REQUEST_URLS.copy}>Solicitar copia de mis datos</ActionLink></li>
        <li><ActionLink href={SUPPORT_REQUEST_URLS.deletion}>Solicitar supresión de datos</ActionLink></li>
        <li><ActionLink href={SUPPORT_REQUEST_URLS.revocation}>Solicitar revocación de consentimiento</ActionLink></li>
        <li><ActionLink href={SUPPORT_REQUEST_URLS.help}>Pedir ayuda a soporte</ActionLink></li>
      </ul>
      <p className="text-small text-muted-foreground">Estos enlaces abren tu aplicación de correo; debes enviar el mensaje para iniciar la solicitud. No descargan datos, eliminan tu cuenta ni revocan permisos automáticamente.</p>
      <p className="break-words text-small">Si no se abre tu correo, escribe a <a href={SUPPORT_REQUEST_URLS.help} className="underline underline-offset-4">{SUPPORT_EMAIL}</a>. No envíes contraseñas ni documentos o datos sensibles de menores en el primer mensaje.</p>
    </section>
    {!!adminRoles?.length && <Link href="/profile/birthdate-requests" className="block underline">Revisar correcciones de edad de mis grupos</Link>}
  </div></AppShell>;
}
