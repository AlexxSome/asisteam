import { notFound } from "next/navigation";
import { getGuardianOnboarding } from "@/lib/wards";
import { MembershipProgress } from "../pending/membership-review";
import Link from "next/link";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { AccountActivationConsent, ManagedConsentForm } from "./consent-form";

export const metadata = { title: "Consentimientos de mis pupilos" };

export default async function ManagedConsentsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string; athlete?: string }>;
}) {
  const group = await getGroup((await params).groupId);
  const query = await searchParams;
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  const supabase = await createClient();
  const data = await getGuardianOnboarding(group.id, query.athlete, query.athlete ? 1 : page);
  if (query.athlete && !data.length) notFound();
  const { data: activations, error: activationError } = await supabase.rpc("list_managed_activation_requests", { p_group_id: group.id, p_offset: (page - 1) * 50, p_athlete_user_id: query.athlete });
  if (activationError) throw new Error("No pudimos cargar las solicitudes de activación. Vuelve a intentarlo.");
  return <>
    <h1 className="text-2xl font-semibold">Consentimientos de mis pupilos</h1>
    <h2 className="text-xl font-semibold">Participación en {group.name}{query.athlete && data[0] ? ` · ${data[0].full_name}` : ""}</h2>
    <p>El consentimiento de datos, la membresía activa, el acceso con contraseña y la autorización de imagen son decisiones diferentes.</p>
    {!data.some(ward => ward.can_consent) && <p>No tienes consentimientos de datos pendientes en esta página.</p>}
    {data.map(ward => <section key={ward.membership_id} className="space-y-3">
      {ward.can_consent ? <ManagedConsentForm membershipId={ward.membership_id} billingGroupId={group.roles.includes("ADMIN") ? group.id : undefined} fullName={ward.full_name} relationship={ward.relationship ?? ""} managedEnrollment={ward.requires_managed_consent} />
        : <><h3 className="text-lg font-semibold">{ward.full_name}</h3><MembershipProgress groupId={group.id} member={ward} audience="guardian" /></>}
    </section>)}
    <h2 className="text-xl font-semibold">Activación de cuentas propias</h2>
    {!activations?.length && <p>No tienes solicitudes de activación en esta página.</p>}
    {activations?.map(ward => <AccountActivationConsent key={ward.request_id} requestId={ward.request_id} fullName={ward.full_name} relationship={ward.relationship} approved={ward.status === "APPROVED"} />)}
    <nav aria-label="Páginas de consentimientos" className="flex gap-4 underline">
      {page > 1 && <Link href={`?${new URLSearchParams({ page: String(page - 1), ...(query.athlete ? { athlete: query.athlete } : {}) })}`}>Anterior</Link>}
      {Math.max(data?.[0]?.total_count ?? 0, activations?.[0]?.total_count ?? 0) > page * 50 && <Link href={`?${new URLSearchParams({ page: String(page + 1), ...(query.athlete ? { athlete: query.athlete } : {}) })}`}>Siguiente</Link>}
    </nav>
    <p className="text-sm">La autorización de imagen se revisa por separado en <Link className="underline" href="/profile">Mi perfil</Link>.</p>
    <Link className="inline-flex min-h-11 items-center underline" href={query.athlete ? `/wards/${query.athlete}` : "/wards"}>Volver a mis pupilos</Link>
  </>;
}
