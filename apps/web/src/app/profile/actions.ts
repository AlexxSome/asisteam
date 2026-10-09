"use server";
import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError } from "@asisteam/api-client";
import { avatarContentType,avatarFileSchema,profileSchema,type OwnProfile,type ProfileInput } from "@asisteam/core";
import { revalidatePath } from "next/cache";
const COLUMNS = "id, full_name, email, phone, birthdate, avatar_url";
export type ProfileResult = {
    ok: true;
    message: string;
    profile?: OwnProfile;
} | {
    ok: false;
    message: string;
};
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
    if (!parsed.success)
        return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos del perfil." };
    {
        try {
            const result = await createServerApiClient().updateOwnProfile({ body: parsed.data });
            revalidatePath("/profile");
            revalidatePath("/welcome");
            return { ok: true, profile: result.profile, message: result.birthdate_change_pending
                    ? "Nombre y teléfono guardados. La nueva fecha queda pendiente de un ADMIN de cada grupo; conservamos tu fecha actual hasta la última confirmación."
                    : "Tu perfil se actualizó en todos tus grupos." };
        }
        catch (error) {
            return profileError(error instanceof ApiClientError ? error.error.code : undefined);
        }
    }
}
export async function uploadAvatar(formData: FormData): Promise<ProfileResult> {
    const file = formData.get("avatar");
    if (!(file instanceof File))
        return { ok: false, message: "Selecciona una imagen." };
    const parsed = avatarFileSchema.safeParse({ type: file.type, size: file.size });
    if (!parsed.success)
        return { ok: false, message: parsed.error.issues[0]?.message ?? "Imagen inválida." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = avatarContentType(bytes);
    if (contentType !== file.type)
        return { ok: false, message: "El contenido no corresponde a una imagen JPEG, PNG o WebP válida." };
    {
        try {
            await createServerApiClient().uploadAvatar({ body: { type: contentType, content_base64: Buffer.from(bytes).toString("base64") } });
            revalidatePath("/profile");
            return { ok: true, message: "Tu foto de perfil se actualizó." };
        }
        catch (error) {
            return profileError(error instanceof ApiClientError ? error.error.code : undefined);
        }
    }
}
export async function reviewBirthdate(requestId: string, groupId: string, approve: boolean): Promise<ProfileResult> {
    if (!/^[0-9a-f-]{36}$/.test(requestId) || !/^[0-9a-f-]{36}$/.test(groupId) || typeof approve !== "boolean") {
        return { ok: false, message: "Solicitud inválida." };
    }
    {
        try {
            const data = await createServerApiClient().reviewBirthdate({ params: { requestId }, body: { group_id: groupId, approve } });
            revalidatePath("/profile");
            revalidatePath("/profile/birthdate-requests");
            return { ok: true, message: data.status === "APPLIED" ? "Todos los grupos confirmaron. Se aplicó la fecha y se desactivaron los vínculos de apoderados."
                    : data.status === "REJECTED" ? "Solicitud rechazada. La fecha original se conserva." : "Confirmación guardada. Falta la aprobación de otros grupos." };
        }
        catch {
            return { ok: false, message: "La solicitud ya no está disponible o no tienes permiso para revisarla. Actualiza la página." };
        }
    }
}
export async function setAvatarPermission(guardianshipId: string, allow: boolean): Promise<ProfileResult> {
    if (!/^[0-9a-f-]{36}$/.test(guardianshipId) || typeof allow !== "boolean")
        return { ok: false, message: "Solicitud inválida." };
    {
        try {
            await createServerApiClient().setAvatarPermission({ params: { guardianshipId }, body: { allow } });
            revalidatePath("/profile");
            return { ok: true, message: allow ? "Autorización de imagen registrada." : "Permiso de imagen retirado. Si no existe otra autorización vigente, su foto dejará de estar disponible." };
        }
        catch {
            return { ok: false, message: "No pudimos cambiar el permiso. Verifica que el vínculo y el consentimiento del menor sigan vigentes." };
        }
    }
}
