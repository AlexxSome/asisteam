// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import "server-only";
import type { OwnProfile } from "@asisteam/core";
import { createClient } from "@legacy/lib/supabase/server";
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";

export async function getProfilePageData(authUserId: string) {
  if (moduleTransport("profile") === "nest") {
    const client = createServerApiClient();
    const [profile, context] = await Promise.all([client.getOwnProfile(), client.getProfileContext()]);
    return { profile, allowed: context.avatar_allowed, request: context.birthdate_request, hasAdminRole: context.has_admin_role, avatarPermissions: context.avatar_permissions };
  }
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users").select("id, full_name, email, phone, birthdate, avatar_url").eq("auth_user_id", authUserId).single<OwnProfile>();
  if (!profile) return null;
  const [{ data: allowed }, { data: requests }, { data: adminRoles }, { data: avatarPermissions }] = await Promise.all([
    supabase.rpc("can_upload_avatar"),
    supabase.from("birthdate_change_requests").select("id, requested_birthdate, status").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("memberships").select("id").eq("user_id", profile.id).eq("role", "ADMIN").eq("status", "ACTIVE").limit(1),
    supabase.rpc("list_avatar_permissions"),
  ]);
  return { profile, allowed: allowed === true, request: requests?.[0] ?? null, hasAdminRole: !!adminRoles?.length, avatarPermissions: avatarPermissions ?? [] };
}
