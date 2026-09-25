import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { AccountActivationConsent, ManagedConsentForm } from "./consent-form";

export const metadata = { title: "Consentimientos de mis pupilos" };

export default async function ManagedConsentsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const group = await getGroup((await params).groupId);
  const query = await searchParams;
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_managed_member_consents", { p_group_id: group.id, p_offset: (page - 1) * 50 });
  if (error) throw new Error("No pudimos cargar los consentimientos. Vuelve a intentarlo.");
  const { data: activations, error: activationError } = await supabase.rpc("list_managed_activation_requests", { p_group_id: group.id, p_offset: (page - 1) * 50 });
  if (activationError) throw new Error("No pudimos cargar las solicitudes de activación. Vuelve a intentarlo.");
  return <>
    <h1 className="text-2xl font-semibold">Consentimientos de mis pupilos</h1>
    <h2 className="text-xl font-semibold">Alta en {group.name}</h2>
    <p>Confirma el tratamiento de datos para completar el alta pendiente de tu pupilo.</p>
    {!data?.length && <p>No tienes consentimientos pendientes en esta página.</p>}
    {data?.map(ward => <ManagedConsentForm key={ward.membership_id} membershipId={ward.membership_id} fullName={ward.full_name} relationship={ward.relationship} />)}
    <h2 className="text-xl font-semibold">Activación de cuentas propias</h2>
    {!activations?.length && <p>No tienes solicitudes de activación en esta página.</p>}
    {activations?.map(ward => <AccountActivationConsent key={ward.request_id} requestId={ward.request_id} fullName={ward.full_name} relationship={ward.relationship} approved={ward.status === "APPROVED"} />)}
    <nav aria-label="Páginas de consentimientos" className="flex gap-4 underline">
      {page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}
      {Math.max(data?.[0]?.total_count ?? 0, activations?.[0]?.total_count ?? 0) > page * 50 && <Link href={`?page=${page + 1}`}>Siguiente</Link>}
    </nav>
    <Link className="underline" href={`/groups/${group.id}`}>Volver al grupo</Link>
  </>;
}
