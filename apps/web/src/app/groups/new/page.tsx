import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { GroupForm } from "./group-form";

export const metadata: Metadata = {
  title: "Crear grupo",
};

export default async function NewGroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/register");

  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 py-10">
      <h1 className="text-2xl font-semibold">Crear un grupo</h1>
      <GroupForm />
      <Link href="/groups" className="inline-block text-sm underline underline-offset-4">
        Volver a Mis grupos
      </Link>
    </main>
  );
}
