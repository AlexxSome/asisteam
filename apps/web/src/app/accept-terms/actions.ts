"use server";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { accountConsentSchema } from "@asisteam/core";
import { revalidatePath } from "next/cache";
export async function acceptAccountTerms(input: unknown): Promise<{
    success: true;
} | {
    error: string;
}> {
    const parsed = accountConsentSchema.safeParse(input);
    if (!parsed.success)
        return { error: parsed.error.issues[0]?.message ?? "Revisa las condiciones antes de aceptar." };
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return { error: "Tu sesión terminó. Inicia sesión para aceptar las condiciones." };
        const { error } = await memberOperation(async (api) => { await api.acceptAccountTerms({ body: parsed.data }); return null; });
        if (error)
            return { error: "No pudimos registrar tu aceptación. Actualiza la página y vuelve a intentarlo." };
        revalidatePath("/", "layout");
        return { success: true };
    }
    catch {
        return { error: "No pudimos conectar. Revisa tu conexión y vuelve a intentarlo." };
    }
}
