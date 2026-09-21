"use server";

import { revalidatePath } from "next/cache";
import { avatarContentType, avatarFileSchema, profileSchema, type OwnProfile, type ProfileInput } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = "id, full_name, email, phone, birthdate, avatar_url";
export type ProfileResult = { ok: true; message: string; profile?: OwnProfile } | { ok: false; message: string };

function profileError(message?: string): ProfileResult {
  const messages: Record<string, string> = {
    athlete_birthdate_required: "La fecha de nacimiento es obligatoria para deportistas.",
    minor_requires_guardian_consent: "Para registrar una fecha de menor de edad necesitas un apoderado y su consentimiento vigente.",
    avatar_consent_required: "La foto de un menor necesita el consentimiento vigente de su apoderado para usar imágenes.",
    invalid_birthdate: "Revisa la fecha de nacimiento: debe estar en el pasado y la edad no puede superar los 110 años.",
    invalid_phone: "Usa un teléfono en formato internacional, por ejemplo +56912345678.",
  };
  return { ok: false, message: messages[message ?? ""] ?? "No pudimos guardar los cambios. Inténtalo nuevamente." };
}

export async function saveProfile(input: ProfileInput): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos del perfil." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para editar tu perfil." };

  let { data, error } = await supabase.from("users").update(parsed.data)
    .eq("auth_user_id", user.id).select(COLUMNS).single<OwnProfile>();
  let pending = false;
  if (error?.message === "birthdate_admin_confirmation_required" && parsed.data.birthdate) {
    const request = await supabase.rpc("request_birthdate_change", { p_birthdate: parsed.data.birthdate });
    if (request.error) return profileError(request.error.message);
    // La solicitud conserva la fecha actual. Los demás datos sí se guardan.
    const result = await supabase.from("users").update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
      .eq("auth_user_id", user.id).select(COLUMNS).single<OwnProfile>();
    data = result.data; error = result.error; pending = true;
  }
  if (error || !data) return profileError(error?.message);
  revalidatePath("/profile"); revalidatePath("/welcome");
  return { ok: true, profile: data, message: pending
    ? "Nombre y teléfono guardados. La nueva fecha queda pendiente de un ADMIN de cada grupo; conservamos tu fecha actual hasta la última confirmación."
    : "Tu perfil se actualizó en todos tus grupos." };
}

export async function uploadAvatar(formData: FormData): Promise<ProfileResult> {
  const file = formData.get("avatar");
  if (!(file instanceof File)) return { ok: false, message: "Selecciona una imagen." };
  const parsed = avatarFileSchema.safeParse({ type: file.type, size: file.size });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Imagen inválida." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = avatarContentType(bytes);
  if (contentType !== file.type) return { ok: false, message: "El contenido no corresponde a una imagen JPEG, PNG o WebP válida." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para cambiar tu foto." };
  const { data: allowed, error: permissionError } = await supabase.rpc("can_upload_avatar");
  if (permissionError || !allowed) return profileError("avatar_consent_required");
  const { data: previous } = await supabase.from("users").select("avatar_url").eq("auth_user_id", user.id).single<{ avatar_url: string | null }>();
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const objectPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const bucket = supabase.storage.from("avatars");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) return { ok: false, message: "No pudimos subir la foto. Revisa el tamaño y el permiso de tu apoderado." };
  const { error } = await supabase.from("users").update({ avatar_url: `/profile/avatar/${objectPath}` })
    .eq("auth_user_id", user.id).select("id").single();
  if (error) { await bucket.remove([objectPath]); return profileError(error.message); }
  const prefix = `/profile/avatar/${user.id}/`;
  if (previous?.avatar_url?.startsWith(prefix)) await bucket.remove([previous.avatar_url.slice("/profile/avatar/".length)]);
  revalidatePath("/profile");
  return { ok: true, message: "Tu foto de perfil se actualizó." };
}

export async function reviewBirthdate(requestId: string, groupId: string, approve: boolean): Promise<ProfileResult> {
  if (!/^[0-9a-f-]{36}$/.test(requestId) || !/^[0-9a-f-]{36}$/.test(groupId) || typeof approve !== "boolean") {
    return { ok: false, message: "Solicitud inválida." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para revisar solicitudes." };
  const { data, error } = await supabase.rpc("review_birthdate_change", { p_request_id: requestId, p_group_id: groupId, p_approve: approve });
  if (error) return { ok: false, message: "La solicitud ya no está disponible o no tienes permiso para revisarla. Actualiza la página." };
  revalidatePath("/profile"); revalidatePath("/profile/birthdate-requests");
  return { ok: true, message: data === "APPLIED" ? "Todos los grupos confirmaron. Se aplicó la fecha y se desactivaron los vínculos de apoderados."
    : data === "REJECTED" ? "Solicitud rechazada. La fecha original se conserva." : "Confirmación guardada. Falta la aprobación de otros grupos." };
}

export async function setAvatarPermission(guardianshipId: string, allow: boolean): Promise<ProfileResult> {
  if (!/^[0-9a-f-]{36}$/.test(guardianshipId) || typeof allow !== "boolean") return { ok: false, message: "Solicitud inválida." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para revisar permisos de imagen." };
  const { error } = await supabase.rpc("set_avatar_permission", { p_guardianship_id: guardianshipId, p_allow: allow });
  if (error) return { ok: false, message: "No pudimos cambiar el permiso. Verifica que el vínculo y el consentimiento del menor sigan vigentes." };
  revalidatePath("/profile");
  return { ok: true, message: allow ? "Autorización de imagen registrada." : "Permiso de imagen retirado. Si no existe otra autorización vigente, su foto dejará de estar disponible." };
}
