"use server";

import { passwordRecoverySchema, type PasswordRecoveryInput } from "@asisteam/core";
import { createRecoveryClient } from "@/lib/supabase/recovery";

export async function requestPasswordRecovery(input: PasswordRecoveryInput) {
  const parsed = passwordRecoverySchema.safeParse(input);
  if (parsed.success) {
    try {
      const supabase = createRecoveryClient();
      // La plantilla usa SiteURL y TokenHash; funciona también en otro
      // navegador y no depende de una cookie PKCE del navegador solicitante.
      await supabase.auth.resetPasswordForEmail(parsed.data.email);
    } catch {
      // Tanto errores de red como respuestas del proveedor (incluido 429)
      // mantienen el mismo resultado público, sin revelar cuentas ni PII.
    }
  }

  return { message: "Si el email existe, enviamos instrucciones" };
}
