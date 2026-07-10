import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Crear grupo",
};

// Pantalla ONB-04: se implementa en HU-ADM-01 (issue #20).
export default async function NewGroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/register");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Crear un grupo</h1>
      <p className="max-w-md text-muted-foreground">
        Esta funcionalidad está en construcción (HU-ADM-01).
      </p>
      <Link href="/welcome" className="text-sm underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  );
}
