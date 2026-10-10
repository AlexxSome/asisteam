import { ActionLink,Button,buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { getGroup } from "@/lib/groups";
import { memberOperation } from "@/lib/members";
import { groupMemberSchema,memberFilterSchema,MEMBERSHIP_ROLE_LABELS,MEMBERSHIP_ROLES,MEMBERSHIP_STATUS_LABELS,MEMBERSHIP_STATUSES } from "@asisteam/core";
import { notFound } from "next/navigation";
import { MemberManagement } from "./member-management";
export const metadata = { title: "Integrantes" };
export default async function MembersPage({ params, searchParams }: {
    params: Promise<{
        groupId: string;
    }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const group = await getGroup((await params).groupId);
    if (!group.roles.includes("ADMIN"))
        notFound();
    const query = await searchParams;
    const parsed = memberFilterSchema.safeParse({ role: query.role || undefined, status: query.status || undefined, page: query.page, search: query.search });
    const baseHref = `/groups/${group.id}/members`;
    if (!parsed.success)
        return <><h1 className="text-2xl font-semibold">Integrantes</h1><p role="alert">Revisa los filtros seleccionados. La búsqueda admite hasta 120 caracteres.</p><ActionLink href={baseHref}>Restablecer filtros</ActionLink></>;
    const { role, status, page, search } = parsed.data;

    const loadPage = async (offset: number) => {
        const { data, error } = await memberOperation(async (api) => (await api.listGroupMembers({ params: { groupId: group.id }, query: { role, status, search, page: offset / 50 + 1 } })).data);
        if (error?.code === "PT403" || error?.code === "PT404")
            notFound();
        if (error)
            throw new Error("No pudimos cargar los integrantes. Vuelve a intentarlo.");
        return groupMemberSchema.array().parse(data ?? []);
    };
    const members = await loadPage((page - 1) * 50);
    // The table RPC has no row carrying count on an empty page. Recover the total
    // with one bounded first-page request, retaining the requested URL and filters.
    const total = members[0]?.total_count ?? (page > 1 ? (await loadPage(0))[0]?.total_count ?? 0 : 0);
    const totalPages = Math.max(1, Math.ceil(total / 50));
    const filtered = !!(role || status || search);
    const href = (next: number) => {
        const params = new URLSearchParams({ page: String(next) });
        if (role)
            params.set("role", role);
        if (status)
            params.set("status", status);
        if (search)
            params.set("search", search);
        return `?${params}`;
    };
    return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Integrantes</h1>
      <p>Gestiona la nómina de {group.name}. Cada fila corresponde a un rol; una persona puede tener varios.</p></header>
    <div className="flex flex-wrap items-start gap-3">
      <details className="min-w-0 max-w-full rounded-lg border border-border bg-surface" open={!members.length && !filtered && page === 1}>
        <summary className={`${buttonVariants({ variant: "primary" })} cursor-pointer`}>Agregar integrante</summary>
        <div className="grid max-w-xl gap-4 p-4 sm:grid-cols-2">
          <div className="min-w-0"><ActionLink href={`${baseHref}/new`}>Crear cuenta gestionada</ActionLink>
            <p className="text-small">Para quien no tendrá credenciales propias. Si es menor, requiere apoderado y consentimiento.</p></div>
          <div className="min-w-0"><ActionLink href={`/groups/${group.id}/invitations/new`}>Invitar por email</ActionLink>
            <p className="text-small">Para quien completará su registro con credenciales propias, o un apoderado con invitación dirigida.</p></div>
        </div>
      </details>
      <ActionLink href={`${baseHref}/pending`}>Revisar pendientes</ActionLink>
      <ActionLink href={`/groups/${group.id}/reports?include_inactive=true`}>Reportes con inactivos</ActionLink>
    </div>
    <form key={`${role}-${status}-${search}`} action={baseHref} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] xl:items-end" aria-label="Buscar y filtrar integrantes">
      <Field id="member-search" label="Buscar por nombre"><Input name="search" type="search" defaultValue={search ?? ""} maxLength={120} placeholder="Nombre o parte del nombre"/></Field>
      <Field id="member-role" label="Rol"><select name="role" defaultValue={role ?? ""} className="min-h-11 w-full min-w-0 rounded border border-input bg-surface px-3"><option value="">Todos los roles</option>{MEMBERSHIP_ROLES.map(value => <option key={value} value={value}>{MEMBERSHIP_ROLE_LABELS[value]}</option>)}</select></Field>
      <Field id="member-status" label="Estado"><select name="status" defaultValue={status ?? ""} className="min-h-11 w-full min-w-0 rounded border border-input bg-surface px-3"><option value="">Todos los estados</option>{MEMBERSHIP_STATUSES.map(value => <option key={value} value={value}>{MEMBERSHIP_STATUS_LABELS[value]}</option>)}</select></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary">Buscar y filtrar</Button>{filtered && <ActionLink href={baseHref}>Limpiar filtros</ActionLink>}</div>
    </form>
    <p role="status" className="text-small text-muted-foreground tabular-nums">{members.length
            ? `Mostrando ${(page - 1) * 50 + 1}–${(page - 1) * 50 + members.length} de ${total} membresías. 50 por página.`
            : `${total} membresías encontradas.`} La búsqueda abarca toda la nómina del grupo.</p>
    {!members.length && <EmptyState title={page > 1 ? "No hay integrantes en esta página" : filtered ? "Sin resultados para estos filtros" : "Aún no hay integrantes en la nómina"} action={page > 1 ? <ActionLink href={href(1)} variant="secondary">Volver a la primera página</ActionLink>
                : filtered ? <ActionLink href={baseHref} variant="secondary">Restablecer la nómina</ActionLink>
                    : <ActionLink href={`${baseHref}/new`} variant="primary">Crear cuenta gestionada</ActionLink>}>
      {page > 1 ? `La página ${page} está fuera de los resultados actuales (${totalPages} páginas). Vuelve al inicio conservando la búsqueda y los filtros.`
                : filtered ? "Prueba con otro nombre, rol o estado, o restablece la nómina."
                    : "Abre Agregar integrante para elegir entre una cuenta gestionada y una invitación por email."}
    </EmptyState>}
    {members.length > 0 && <div className="min-w-0 rounded-lg border border-border">
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_auto] gap-2 border-b border-border bg-muted px-3 py-2 text-small font-medium lg:grid">
        <span>Persona</span><span>Rol de esta fila</span><span>Estado</span><span className="w-52">Gestión</span>
      </div>
      {members.map(member => <MemberManagement key={member.membership_id} groupId={group.id} member={member}/>)}
    </div>}
    {members.length > 0 && <Pagination label="Páginas de integrantes" page={page} totalPages={totalPages} previousHref={page > 1 ? href(page - 1) : undefined} nextHref={total > page * 50 ? href(page + 1) : undefined}/>}
  </>;
}
