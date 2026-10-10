"use server";
import { assertAuthOrigin,nativeAuthClient,setNativeCookies } from '@/lib/api/native-auth';
import { invitationDestination } from "@/lib/auth-context";
import { registerSchema,type RegisterInput } from "@asisteam/core";
import { redirect } from "next/navigation";
export type RegisterResult = {
    error: string;
} | undefined;
/** Native registration records account consent before issuing the browser session. */
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
