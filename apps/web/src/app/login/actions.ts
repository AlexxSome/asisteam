"use server";

import { redirect } from "next/navigation";
import { joinCodeSchema, loginSchema, type LoginInput } from "@asisteam/core";

import { createClient } from "@/lib/supabase/server";

export type LoginResult = { error: string } | undefined;

const INVALID_CREDENTIALS_ERROR = "Email o contraseña incorrectos";

/**
 * Inicio de sesión con email y contraseña (HU-GEN-02, AUT-01).
 * Contrato de docs/07-api-y-backend.md §2.1: Supabase Auth
 * `signInWithPassword`. Anti-enumeración (docs/07 §7.3): todo fallo de
 * credenciales responde el mismo mensaje genérico, sin distinguir email
 * inexistente de contraseña incorrecta (criterio 2 de HU-GEN-02).
 *
 * Criterio 3 (cuentas MANAGED): el constraint users_managed_has_no_auth_user
 * garantiza que una cuenta MANAGED nunca tiene fila en auth.users, así que
 * signInWithPassword siempre falla para su email y cae en el mismo mensaje
 * genérico de arriba — no requiere una verificación aparte.
 */
export async function loginUser(input: LoginInput, inviteCode?: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS_ERROR };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
    }
    return { error: INVALID_CREDENTIALS_ERROR };
  }

  const parsedCode = joinCodeSchema.safeParse(inviteCode);
  redirect(parsedCode.success ? `/join?code=${parsedCode.data}` : "/");
}
