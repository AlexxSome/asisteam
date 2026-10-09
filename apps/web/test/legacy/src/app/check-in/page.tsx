// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { createClient } from "@legacy/lib/supabase/server";
import { CheckinForm } from "@/app/check-in/check-in-form";

export const metadata = { title: "Registrar mi llegada", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return <main className="mx-auto max-w-md space-y-5 p-4 py-10">
    <h1 className="text-2xl font-semibold">Registrar mi llegada</h1>
    <CheckinForm authenticated={!!user} />
  </main>;
}
