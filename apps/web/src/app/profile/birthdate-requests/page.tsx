import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BirthdateReviews, type BirthdateReview } from "./reviews";

export const metadata = { title: "Correcciones de fecha de nacimiento" };
export default async function BirthdateRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("list_birthdate_reviews");
  return <main className="mx-auto max-w-3xl space-y-6 p-4 py-10">
    <Link href="/profile" className="underline">Volver a mi perfil</Link>
    <h1 className="text-2xl font-semibold">Correcciones de fecha de nacimiento</h1>
    <p>Verifica la fecha con el integrante antes de confirmar. Se requiere un ADMIN de cada grupo. Al aplicar la corrección, los apoderados perderán acceso porque el integrante será mayor de edad.</p>
    {error ? <p role="alert">No pudimos cargar las solicitudes. Inténtalo nuevamente.</p> : <BirthdateReviews reviews={(data ?? []) as BirthdateReview[]} />}
  </main>;
}
