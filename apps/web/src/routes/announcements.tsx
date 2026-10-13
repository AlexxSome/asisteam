import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page } from "../ui";
import { PageHeader } from "../components/ui/page-header";
import { EmptyState } from "../../src/components/ui/empty-state";
import { AnnouncementComposer, AnnouncementManagement } from "../components/announcement-form";
import { AnnouncementPushPreference, WallRefresh, WallSession } from "../components/wall-controls";
import { groupData } from "../group-data";
import { browserApi, sessionError } from "../api";
import { pageQuery } from "../capability-data";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),page=pageQuery(request,100000);
 try{return {group,...await browserApi(request.signal).getAnnouncements({params:{groupId:group.id},query:{page}})};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,announcements,page,pushEnabled,hasDevices}=useLoaderData<typeof loader>();
  const admin = group.access === "admin";
  const format = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "America/Santiago" });
  const hasNextPage = (announcements[0]?.total_count ?? 0) > page * 50;
  return <Page className="max-w-7xl p-0 md:p-0"><title>Anuncios del grupo · Asisteam</title><WallSession key={`${group.id}-${page}`}><div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PageHeader title="Anuncios del grupo" description={`Comunicaciones de la administración de ${group.name}.`} />
      <WallRefresh />
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(320px,4fr)]">
    <div className="min-w-0 space-y-4">
    <section className="min-w-0 space-y-4" aria-label="Muro de anuncios">
      {!announcements.length && <EmptyState title={page === 1 ? "Todavía no hay anuncios en este grupo" : "No hay anuncios en esta página"}>
        {page === 1 ? (admin ? "Publica un anuncio para compartir información con los miembros del grupo." : "Cuando la administración publique un anuncio, podrás leerlo aquí.")
          : <Link prefetch={false} className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/announcements`}>Volver al inicio del muro</Link>}
      </EmptyState>}
      {announcements.map((item) => <article key={item.id} id={item.id} data-announcement className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-4 sm:p-6 [overflow-wrap:anywhere]">
        <p className="text-caption font-medium text-muted-foreground">Anuncio del grupo</p>
        <h2 className="text-h2">{item.title}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-muted-foreground">
          <span className="font-medium text-foreground">Administración del grupo</span>
          <span>Publicado <time dateTime={item.created_at}>{format.format(new Date(item.created_at))}</time></span>
          {item.updated_at !== item.created_at && <span>Editado <time dateTime={item.updated_at}>{format.format(new Date(item.updated_at))}</time></span>}
        </div>
        <p className="max-w-prose whitespace-pre-wrap text-body leading-relaxed">{item.body}</p>
        {admin && <AnnouncementManagement groupId={group.id} announcement={item} />}
      </article>)}
    </section>
    <nav aria-label="Páginas del muro" className="flex flex-wrap items-center gap-4 text-small">
      {page > 1 && <Link prefetch={false} className="min-h-11 py-2 underline" href={`/groups/${group.id}/announcements?page=${page - 1}`}>Anterior</Link>}
      <span>Página {page}</span>
      {hasNextPage && <Link prefetch={false} className="min-h-11 py-2 underline" href={`/groups/${group.id}/announcements?page=${page + 1}`}>Siguiente</Link>}
      {!!announcements.length && !hasNextPage && <span className="text-muted-foreground">Llegaste al final del muro.</span>}
    </nav>
    </div>
    <aside className="min-w-0 space-y-4" aria-label="Opciones del muro">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4 sm:p-6" aria-labelledby="wall-reading-title">
        <h2 id="wall-reading-title" className="text-h3">Lectura del muro</h2>
        <p className="text-small text-muted-foreground">Se actualiza cada 30 segundos mientras lees. Al editar, la actualización se pausa para conservar tus cambios.</p>
        <p className="text-small text-muted-foreground">Los anuncios pertenecen a este grupo. Los avisos móviles se configuran para todos tus grupos.</p>
      </section>
      {admin && <section className="space-y-3 rounded-lg border border-border bg-surface p-4 sm:p-6" aria-labelledby="wall-management-title">
        <h2 id="wall-management-title" className="text-h3">Gestión de anuncios</h2>
        <p className="text-small text-muted-foreground">Comparte información con los miembros de {group.name}. Cada anuncio puede editarse desde su tarjeta.</p>
        <AnnouncementComposer groupId={group.id} />
      </section>}
    <AnnouncementPushPreference enabled={pushEnabled} hasDevices={hasDevices} />
    </aside></div>
  </div></WallSession></Page>;
}
