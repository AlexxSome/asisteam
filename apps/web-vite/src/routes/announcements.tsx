import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page } from "../ui";
import { EmptyState } from "../../../web/src/components/ui/empty-state";
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
  return <Page><title>Anuncios del grupo · Asisteam</title><WallSession key={`${group.id}-${page}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <h1 className="text-h1">Anuncios del grupo</h1>
        <p className="text-small text-muted-foreground">Comunicaciones de la administración. Se actualizan cada 30 segundos mientras lees el muro.</p>
      </div>
      <WallRefresh />
    </div>
    {admin && <AnnouncementComposer groupId={group.id} />}
    <section className="min-w-0 space-y-4" aria-label="Muro de anuncios">
      {!announcements.length && <EmptyState title={page === 1 ? "Todavía no hay anuncios en este grupo" : "No hay anuncios en esta página"}>
        {page === 1 ? (admin ? "Publica un anuncio para compartir información con los miembros del grupo." : "Cuando la administración publique un anuncio, podrás leerlo aquí.")
          : <Link prefetch={false} className="inline-flex min-h-11 items-center underline" href={`/groups/${group.id}/announcements`}>Volver al inicio del muro</Link>}
      </EmptyState>}
      {announcements.map((item) => <article key={item.id} id={item.id} data-announcement className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-4 sm:p-6 [overflow-wrap:anywhere]">
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
    <AnnouncementPushPreference enabled={pushEnabled} hasDevices={hasDevices} />
  </WallSession></Page>;
}
