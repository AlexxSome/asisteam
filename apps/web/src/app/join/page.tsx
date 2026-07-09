import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Unirme con código",
};

// Pantalla ONB-02: se implementa en HU-DEP-01 (issue #37).
export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/register");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Unirme con código</h1>
      <p className="max-w-md text-muted-foreground">
        Esta funcionalidad está en construcción (HU-DEP-01).
      </p>
      <Link href="/welcome" className="text-sm underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  );
}
