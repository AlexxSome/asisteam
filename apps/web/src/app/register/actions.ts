"use server";
import { assertAuthOrigin,nativeAuthClient,setNativeCookies } from '@/lib/api/native-auth';
import { invitationDestination } from "@/lib/auth-context";
import { registerSchema,type RegisterInput } from "@asisteam/core";
import { redirect } from "next/navigation";
export type RegisterResult = {
    error: string;
} | undefined;
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
    {
        try {
            await assertAuthOrigin();
            const api = await nativeAuthClient();
            await api.registerPassword({ body: parsed.data });
            await setNativeCookies(await api.loginPassword({ body: { email: parsed.data.email, password: parsed.data.password } }));
        }
        catch {
            return { error: 'No pudimos crear tu cuenta. Revisa los datos y la contraseña o inicia sesión si ya tienes acceso.' };
        }
        redirect(invitationDestination(inviteCode));
    }
}
