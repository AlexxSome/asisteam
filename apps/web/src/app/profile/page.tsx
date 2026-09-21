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
  if (!profile) return <main className="mx-auto max-w-xl p-6"><h1>Mi perfil</h1><p role="alert">No pudimos cargar tu perfil. Vuelve a intentarlo.</p><Link href="/welcome">Volver</Link></main>;
  const [{ data: allowed }, { data: requests }, { data: adminRoles }, { data: avatarPermissions }] = await Promise.all([
    supabase.rpc("can_upload_avatar"),
    supabase.from("birthdate_change_requests").select("id, requested_birthdate, status").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("memberships").select("id").eq("user_id", profile.id).eq("role", "ADMIN").eq("status", "ACTIVE").limit(1),
    supabase.rpc("list_avatar_permissions"),
  ]);
  const request = requests?.[0];
  return <main className="mx-auto max-w-xl space-y-6 p-4 py-10">
    <Link href="/welcome" className="text-sm underline">Volver al inicio</Link>
    <header><h1 className="text-2xl font-semibold">Mi perfil</h1><p className="mt-2 text-muted-foreground">Tus datos son los mismos en todos tus grupos.</p></header>
    {request && <aside className="rounded-lg border p-4" aria-label="Estado de corrección de fecha">
      <p className="font-medium">Corrección a {String(request.requested_birthdate).split("-").reverse().join("/")}</p>
      <p className="text-sm">{request.status === "PENDING" ? "Pendiente: un ADMIN de cada grupo debe confirmarla. Contacta a tus administradores. Si eres ADMIN, debe revisarla otro administrador; no puedes aprobar tu propia solicitud."
        : request.status === "APPLIED" ? "Confirmada y aplicada." : request.status === "REJECTED" ? "Rechazada: tu fecha anterior se conserva. Puedes enviar una nueva corrección." : "Cancelada porque enviaste otra fecha o cambió tu perfil."}</p>
    </aside>}
    <ProfileForm key={`${profile.id}:${profile.birthdate}`} profile={profile} avatarAllowed={allowed === true} />
    <AvatarPermissions permissions={(avatarPermissions ?? []) as AvatarPermission[]} />
    {!!adminRoles?.length && <Link href="/profile/birthdate-requests" className="block underline">Revisar correcciones de edad de mis grupos</Link>}
  </main>;
}
