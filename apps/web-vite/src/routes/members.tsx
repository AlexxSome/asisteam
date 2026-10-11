import { Form, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { RouterLink as Link } from "../navigation";
import { Page, ActionLink, Button, Field, Input } from "../ui";
import { EmptyState } from "../../../web/src/components/ui/empty-state";
import { Pagination } from "../components/pagination";
import { memberFilterSchema, MEMBERSHIP_ROLE_LABELS, MEMBERSHIP_ROLES, MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUSES } from "@asisteam/core/browser";
import { MemberManagement } from "../components/member-management";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true), query=new URL(request.url).searchParams;
 const parsed=memberFilterSchema.safeParse({role:query.get("role")||undefined,status:query.get("status")||undefined,page:query.get("page")??undefined,search:query.get("search")??undefined});
 if(!parsed.success)return {group,invalid:true as const,members:[],total:0,filter:null};
 try{const result=await browserApi(request.signal).listGroupMembers({params:{groupId:group.id},query:parsed.data});return {group,invalid:false as const,members:result.data,total:result.total,filter:parsed.data};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,invalid,members,total,filter}=useLoaderData<typeof loader>();
 const baseHref=`/groups/${group.id}/members`;
 if(invalid || !filter)return <Page><h1>Integrantes</h1><p role="alert">Revisa los filtros seleccionados. La búsqueda admite hasta 120 caracteres.</p><ActionLink href={baseHref}>Restablecer filtros</ActionLink></Page>;
 const {role,status,page,search}=filter,totalPages=Math.max(1,Math.ceil(total/50)),filtered=!!(role||status||search);
 const href=(next:number)=>{const params=new URLSearchParams({page:String(next)});if(role)params.set("role",role);if(status)params.set("status",status);if(search)params.set("search",search);return `?${params}`;};
    return <Page><title>Integrantes · Asisteam</title>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Integrantes</h1>
      <p>Gestiona la nómina de {group.name}. Cada fila corresponde a un rol; una persona puede tener varios.</p></header>
    <div className="flex flex-wrap items-start gap-3">
      <details className="min-w-0 max-w-full rounded-lg border border-border bg-surface" open={!members.length && !filtered && page === 1}>
        <summary className={`min-h-11 content-center rounded-md bg-primary px-4 py-2 text-primary-foreground cursor-pointer`}>Agregar integrante</summary>
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
    <Form method="get" key={`${role}-${status}-${search}`} action={baseHref} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] xl:items-end" aria-label="Buscar y filtrar integrantes">
      <Field id="member-search" label="Buscar por nombre"><Input name="search" type="search" defaultValue={search ?? ""} maxLength={120} placeholder="Nombre o parte del nombre"/></Field>
      <Field id="member-role" label="Rol"><select name="role" defaultValue={role ?? ""} className="min-h-11 w-full min-w-0 rounded border border-input bg-surface px-3"><option value="">Todos los roles</option>{MEMBERSHIP_ROLES.map(value => <option key={value} value={value}>{MEMBERSHIP_ROLE_LABELS[value]}</option>)}</select></Field>
      <Field id="member-status" label="Estado"><select name="status" defaultValue={status ?? ""} className="min-h-11 w-full min-w-0 rounded border border-input bg-surface px-3"><option value="">Todos los estados</option>{MEMBERSHIP_STATUSES.map(value => <option key={value} value={value}>{MEMBERSHIP_STATUS_LABELS[value]}</option>)}</select></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary">Buscar y filtrar</Button>{filtered && <ActionLink href={baseHref}>Limpiar filtros</ActionLink>}</div>
    </Form>
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
  </Page>;
}
