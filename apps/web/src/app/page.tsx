import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Punto de entrada: enruta según sesión.
 * Cuando exista `memberships` (HU-GEN-05 / HU-ADM-01), los usuarios con
 * grupos irán a su dashboard; sin membresías, a la bienvenida (ONB-01).
 * El destino sin sesión pasará a /login cuando aterrice HU-GEN-02.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/welcome");
  redirect("/register");
}
