// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import Link from "next/link";
import { notFound } from "next/navigation";
import { isGroupId } from "@/lib/group-routing";
import { getGroup } from "@legacy/lib/groups";
import { memberOperation } from "@legacy/lib/members";
import { createClient } from "@legacy/lib/supabase/server";
import { MembershipReview } from "@/app/groups/[groupId]/members/pending/membership-review";

export const metadata = { title: "Aprobaciones" };

export default async function PendingMembershipsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string; membership?: string }>;
}) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const query = await searchParams;
  const page = typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page) ? Number(query.page) : 1;
  if (query.membership !== undefined && !isGroupId(query.membership)) notFound();
  const membership = query.membership;
  const supabase = await createClient();
  const { data, error } = await memberOperation(() => supabase.rpc("list_membership_onboarding", { p_group_id: group.id, p_membership_id: membership, p_offset: (page - 1) * 50 }), async api => (await api.listMembershipOnboarding({ query: { group_id: group.id, membership_id: membership, page } })).data);
  if (error) throw new Error("No pudimos cargar las aprobaciones. Vuelve a intentarlo.");
  return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Aprobaciones</h1>
      <p>Revisa las incorporaciones pendientes de {group.name}. Los menores requieren apoderado vinculado y consentimiento vigente.</p></header>
    {!data?.length && <p>No hay incorporaciones pendientes en esta página.</p>}
    {data?.map(member => <MembershipReview key={member.membership_id} groupId={group.id} member={member} />)}
    <nav aria-label="Páginas de aprobaciones" className="flex gap-4 underline">
      {page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}
      {(data?.[0]?.total_count ?? 0) > page * 50 && <Link href={`?page=${page + 1}`}>Siguiente</Link>}
    </nav>
    {membership && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/members/pending`}>Ver todas las incorporaciones pendientes</Link>}
    <Link className="underline" href={`/groups/${group.id}/members`}>Volver a integrantes</Link>
  </>;
}
