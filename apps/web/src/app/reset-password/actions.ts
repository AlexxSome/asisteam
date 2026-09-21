"use server";

import { passwordResetSchema, recoveryTokenSchema, type PasswordResetInput } from "@asisteam/core";
import { createRecoveryClient } from "@/lib/supabase/recovery";

export type PasswordResetResult = { success: true } | { error: string };

const INVALID_LINK = "El enlace es inválido, ya fue utilizado o venció. Solicita uno nuevo.";

export async function resetPassword(token: string, input: PasswordResetInput): Promise<PasswordResetResult> {
  const parsed = passwordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa la contraseña: debe tener entre 10 y 128 caracteres y coincidir con la confirmación." };
  }
  if (!recoveryTokenSchema.safeParse(token).success) return { error: INVALID_LINK };

  const supabase = createRecoveryClient();
  let verified = false;
  try {
    // Solo un token recovery vigente autoriza este cambio. Nunca basta con
    // la sesión existente del navegador. GET no consume enlaces (prefetch).
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
    if (error || !data.session) return { error: INVALID_LINK };
    verified = true;

    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (updateError) {
      if (updateError.code === "weak_password" || updateError.code === "same_password") {
        return { error: "Elige una contraseña segura distinta de la anterior y solicita un nuevo enlace para intentarlo." };
      }
      return { error: "No pudimos cambiar la contraseña. Solicita un nuevo enlace e inténtalo nuevamente." };
    }
    return { success: true };
  } catch {
    return { error: "No pudimos cambiar la contraseña. Solicita un nuevo enlace e inténtalo nuevamente." };
  } finally {
    if (verified) {
      // No dejar una sesión de recuperación reutilizable tras el intento.
      // Una caída al cerrar sesión no cambia el resultado de updateUser.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  }
}
