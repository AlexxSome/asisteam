// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";
import { AppShell } from "@legacy/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@legacy/lib/supabase/server";
import { BirthdateReviews, type BirthdateReview } from "@/app/profile/birthdate-requests/reviews";

export const metadata = { title: "Correcciones de fecha de nacimiento" };
export default async function BirthdateRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let data: BirthdateReview[] | null = null;
  let error = false;
  try {
    if (moduleTransport("profile") === "nest") data = (await createServerApiClient().listBirthdateReviews()).data;
    else { const result = await supabase.rpc("list_birthdate_reviews"); data = result.data; error = !!result.error; }
  } catch { error = true; }
  return <AppShell><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/profile" className="underline">Volver a mi perfil</Link>
    <h1 className="text-2xl font-semibold">Correcciones de fecha de nacimiento</h1>
    <p>Verifica la fecha con el integrante antes de confirmar. Se requiere un ADMIN de cada grupo. Al aplicar la corrección, los apoderados perderán acceso porque el integrante será mayor de edad.</p>
    {error ? <p role="alert">No pudimos cargar las solicitudes. Inténtalo nuevamente.</p> : <BirthdateReviews reviews={(data ?? []) as BirthdateReview[]} />}
  </div></AppShell>;
}
