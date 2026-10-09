"use server";
import { assertAuthOrigin,clearNativeCookies,nativeAuthClient } from '@/lib/api/native-auth';
import { passwordResetSchema,recoveryTokenSchema,type PasswordResetInput } from "@asisteam/core";
export type PasswordResetResult = {
    success: true;
} | {
    error: string;
};
const INVALID_LINK = "El enlace es inválido, ya fue utilizado o venció. Solicita uno nuevo.";
export async function resetPassword(token: string, input: PasswordResetInput): Promise<PasswordResetResult> {
    const parsed = passwordResetSchema.safeParse(input);
    if (!parsed.success) {
        return { error: "Revisa la contraseña: debe tener entre 10 y 128 caracteres y coincidir con la confirmación." };
    }
    if (!recoveryTokenSchema.safeParse(token).success)
        return { error: INVALID_LINK };
    {
        try {
            await assertAuthOrigin();
            await (await nativeAuthClient()).resetPassword({ body: { token, password: parsed.data.password } });
            await clearNativeCookies();
            return { success: true };
        }
        catch {
            return { error: INVALID_LINK };
        }
    }
}
