import { AppShell } from "@/components/app-shell";
import { createServerApiClient } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BirthdateReviews,type BirthdateReview } from "./reviews";
export const metadata = { title: "Correcciones de fecha de nacimiento" };
export default async function BirthdateRequestsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect("/login");
    let data: BirthdateReview[] | null = null;
    let error = false;
    try {
        data = (await createServerApiClient().listBirthdateReviews()).data;
    }
    catch {
        error = true;
    }
    return <AppShell><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/profile" className="underline">Volver a mi perfil</Link>
    <h1 className="text-2xl font-semibold">Correcciones de fecha de nacimiento</h1>
    <p>Verifica la fecha con el integrante antes de confirmar. Se requiere un ADMIN de cada grupo. Al aplicar la corrección, los apoderados perderán acceso porque el integrante será mayor de edad.</p>
    {error ? <p role="alert">No pudimos cargar las solicitudes. Inténtalo nuevamente.</p> : <BirthdateReviews reviews={(data ?? []) as BirthdateReview[]}/>}
  </div></AppShell>;
}
