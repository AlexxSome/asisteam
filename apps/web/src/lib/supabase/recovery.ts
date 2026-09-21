import { createClient } from "@supabase/supabase-js";

/**
 * Solo para las Server Actions de recuperación. La sesión obtenida con el
 * token vive únicamente durante la petición: no lee/escribe cookies, no
 * reemplaza otra cuenta abierta y nunca persiste tokens en el navegador.
 */
export function createRecoveryClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    },
  );
}
