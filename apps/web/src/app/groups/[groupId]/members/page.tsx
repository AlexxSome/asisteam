import Link from "next/link";
import { notFound } from "next/navigation";
import { groupMemberSchema, memberFilterSchema, MEMBERSHIP_ROLE_LABELS, MEMBERSHIP_ROLES, MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { MemberManagement } from "./member-management";

export const metadata = { title: "Integrantes" };
export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const query = await searchParams;
  const parsed = memberFilterSchema.safeParse({ role: query.role || undefined, status: query.status || undefined, page: query.page });
  if (!parsed.success) return <><h1 className="text-2xl font-semibold">Integrantes</h1><p role="alert">Revisa los filtros seleccionados.</p><Link className="underline" href={`/groups/${group.id}/members`}>Restablecer filtros</Link></>;
  const { role, status, page } = parsed.data;
  const client = await createClient();
  const { data, error } = await client.rpc("list_group_members", { p_group_id: group.id, p_role: role, p_status: status, p_offset: (page - 1) * 50 });
  if (error?.code === "PT403" || error?.code === "PT404") notFound();
  if (error) throw new Error("No pudimos cargar los integrantes. Vuelve a intentarlo.");
  const members = groupMemberSchema.array().parse(data ?? []);
  const href = (next: number) => {
    const search = new URLSearchParams({ page: String(next) });
    if (role) search.set("role", role);
    if (status) search.set("status", status);
    return `?${search}`;
  };
  return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Integrantes</h1>
      <p>Gestiona la nómina de {group.name}. Desactivar conserva el historial y los registros anteriores.</p></header>
    <div className="flex flex-wrap gap-4 underline">
      <Link href={`/groups/${group.id}/members/new`}>Crear cuenta gestionada</Link>
      <Link href={`/groups/${group.id}/invitations/new`}>Invitar por email</Link>
      <Link href={`/groups/${group.id}/members/pending`}>Revisar pendientes</Link>
      <Link href={`/groups/${group.id}/reports?include_inactive=true`}>Reportes con inactivos</Link>
    </div>
    <form className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">Rol<select name="role" defaultValue={role ?? ""} className="min-h-11 rounded border bg-background px-3"><option value="">Todos los roles</option>{MEMBERSHIP_ROLES.map(value => <option key={value} value={value}>{MEMBERSHIP_ROLE_LABELS[value]}</option>)}</select></label>
      <label className="grid gap-1">Estado<select name="status" defaultValue={status ?? ""} className="min-h-11 rounded border bg-background px-3"><option value="">Todos los estados</option>{MEMBERSHIP_STATUSES.map(value => <option key={value} value={value}>{MEMBERSHIP_STATUS_LABELS[value]}</option>)}</select></label>
      <button className="min-h-11 rounded border px-4">Filtrar</button>
    </form>
    {!members.length && <p>No hay integrantes para estos filtros en esta página.</p>}
    {members.map(member => <MemberManagement key={member.membership_id} groupId={group.id} member={member} />)}
    <nav aria-label="Páginas de integrantes" className="flex gap-4 underline">
      {page > 1 && <Link href={href(page - 1)}>Anterior</Link>}
      {(members[0]?.total_count ?? 0) > page * 50 && <Link href={href(page + 1)}>Siguiente</Link>}
    </nav>
  </>;
}
