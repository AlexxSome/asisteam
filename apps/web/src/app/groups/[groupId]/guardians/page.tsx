import Link from "next/link";
import { notFound } from "next/navigation";
import { isGroupId } from "@/lib/group-routing";
import { getGroup } from "@/lib/groups";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { GuardianForm } from "./guardian-form";

export const metadata = { title: "Registrar apoderado" };
export default async function GuardiansPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ q?: string; page?: string; membership?: string }>;
}) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  const supabase = await createClient();
  if (query.membership !== undefined) {
    if (!isGroupId(query.membership)) notFound();
    const { data: context, error: contextError } = await memberOperation(() => supabase.rpc("list_membership_onboarding", { p_group_id: group.id, p_membership_id: query.membership }), async api => (await api.listMembershipOnboarding({ query: { group_id: group.id, membership_id: query.membership } })).data);
    if (contextError) throw new Error("No pudimos cargar el deportista. Vuelve a intentarlo.");
    const athlete = context?.[0];
    if (!athlete?.is_minor) notFound();
    return <>
      <h1 className="text-2xl font-semibold">Vincular apoderado de {athlete.full_name}</h1>
      <p>Deportista seleccionado en {group.name}. El apoderado otorga su propio consentimiento.</p>
      <GuardianForm groupId={group.id} athletes={[{ user_id: athlete.athlete_user_id, full_name: athlete.full_name }]} selectedAthleteId={athlete.athlete_user_id} />
      <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/members/pending?membership=${athlete.membership_id}`}>Volver al estado de incorporación</Link>
    </>;
  }
  const { data, error } = await memberOperation(() => supabase.rpc("list_guardianship_athletes", { p_group_id: group.id, p_search: search, p_offset: (page - 1) * 50 }), async api => (await api.listGuardianshipAthletes({ params: { groupId: group.id }, query: { search, page } })).data);
  if (error) throw new Error("No pudimos cargar los deportistas. Vuelve a intentarlo.");
  const pageUrl = (value: number) => `?${new URLSearchParams({ q: search, page: String(value) })}`;
  return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Registrar y vincular apoderado</h1>
      <p>Vincula un apoderado nuevo o existente a un deportista menor de edad de {group.name}.</p></header>
    <form method="get" className="flex max-w-xl flex-wrap items-end gap-2">
      <div className="flex-1 space-y-2"><label htmlFor="athlete-search">Buscar deportista por nombre</label>
        <input id="athlete-search" name="q" defaultValue={search} maxLength={120} className="min-h-11 w-full rounded-md border bg-background px-3 py-2" /></div>
      <button className="min-h-11 rounded-md border px-4 py-2">Buscar</button>
    </form>
    {data?.length ? <GuardianForm key={`${search}:${page}`} groupId={group.id} athletes={data} />
      : <p>No hay deportistas menores activos o pendientes que coincidan en esta página.</p>}
    <nav aria-label="Páginas de deportistas" className="flex gap-4 underline">
      {page > 1 && <Link href={pageUrl(page - 1)}>Anterior</Link>}
      {(data?.[0]?.total_count ?? 0) > page * 50 && <Link href={pageUrl(page + 1)}>Siguiente</Link>}
    </nav>
  </>;
}
