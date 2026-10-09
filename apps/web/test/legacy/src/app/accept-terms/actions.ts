// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
"use server";

import { revalidatePath } from "next/cache";
import { accountConsentSchema } from "@asisteam/core";
import { memberOperation } from "@legacy/lib/members";
import { createClient } from "@legacy/lib/supabase/server";

export async function acceptAccountTerms(input: unknown): Promise<{ success: true } | { error: string }> {
  const parsed = accountConsentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa las condiciones antes de aceptar." };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Tu sesión terminó. Inicia sesión para aceptar las condiciones." };
    const { error } = await memberOperation(() => supabase.rpc("accept_account_terms", {
      p_accepted: parsed.data.terms_accepted, p_terms_version: parsed.data.terms_version,
    }), async api => { await api.acceptAccountTerms({ body: parsed.data }); return null; });
    if (error) return { error: "No pudimos registrar tu aceptación. Actualiza la página y vuelve a intentarlo." };
    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { error: "No pudimos conectar. Revisa tu conexión y vuelve a intentarlo." };
  }
}
