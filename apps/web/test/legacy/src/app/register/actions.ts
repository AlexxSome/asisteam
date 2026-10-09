// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
"use server";

import { nativeAuthEnabled } from '@legacy/lib/api/native-auth-config';
import { assertAuthOrigin, nativeAuthClient, setNativeCookies } from '@legacy/lib/api/native-auth';
import { redirect } from "next/navigation";
import { registerSchema, type RegisterInput } from "@asisteam/core";

import { invitationDestination } from "@/lib/auth-context";
import { createClient } from "@legacy/lib/supabase/server";

export type RegisterResult = { error: string } | undefined;

/**
 * Registro con email y contraseña (HU-GEN-01, AUT-02).
 * Contrato de docs/07-api-y-backend.md §2.1: Supabase Auth `signUp` +
 * trigger de perfil (`handle_new_user`) que crea la fila en `public.users`
 * con `account_status = ACTIVE`. Con las confirmaciones de email
 * deshabilitadas, signUp inicia sesión de inmediato (cookies HttpOnly).
 */
export async function registerUser(input: RegisterInput, inviteCode?: string): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos. Revisa el formulario e inténtalo nuevamente." };
  }

  if(nativeAuthEnabled()){
    try{
      await assertAuthOrigin();const api=await nativeAuthClient();await api.registerPassword({body:parsed.data});
      await setNativeCookies(await api.loginPassword({body:{email:parsed.data.email,password:parsed.data.password}}));
    }catch{return {error:'No pudimos crear tu cuenta. Revisa los datos y la contraseña o inicia sesión si ya tienes acceso.'};}
    redirect(invitationDestination(inviteCode));
  }
  const { full_name, email, birthdate, phone, password, terms_accepted, terms_version } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // El trigger handle_new_user copia estos metadatos a public.users.
      data: { full_name, birthdate, phone: phone ?? null, account_terms: { accepted: terms_accepted, version: terms_version } },
    },
  });

  if (error) {
    // Criterio de aceptación 2 de HU-GEN-01: email duplicado.
    if (
      error.code === "user_already_exists" ||
      /already registered/i.test(error.message)
    ) {
      return { error: "Este email ya está registrado" };
    }
    if (error.code === "weak_password") {
      return {
        error:
          "La contraseña no cumple la política de seguridad (mínimo 10 caracteres y no debe aparecer en filtraciones conocidas).",
      };
    }
    return { error: "No pudimos crear tu cuenta. Inténtalo nuevamente en unos minutos." };
  }

  redirect(invitationDestination(inviteCode));
}
