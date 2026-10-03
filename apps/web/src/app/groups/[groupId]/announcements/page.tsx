import Link from "next/link";
import { getAnnouncements } from "@/lib/announcements";
import { AnnouncementForm, AnnouncementManagement } from "./announcement-form";
import { AnnouncementPushPreference, WallRefresh } from "./wall-controls";

export const metadata = { title: "Anuncios del grupo" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { group, announcements, page, pushEnabled, hasDevices } = await getAnnouncements((await params).groupId, (await searchParams).page);
  const admin = group.roles.includes("ADMIN");
  const format = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "America/Santiago" });
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Anuncios del grupo</h1><WallRefresh /></div>
    <p>Comunicaciones de la administración para los miembros del grupo. El muro se actualiza cada 30 segundos mientras está visible.</p>
    <AnnouncementPushPreference enabled={pushEnabled} hasDevices={hasDevices} />
    {admin && <section className="space-y-3 rounded-lg border p-4" aria-labelledby="publish-heading">
      <h2 id="publish-heading" className="text-lg font-semibold">Publicar anuncio</h2>
      <AnnouncementForm groupId={group.id} />
    </section>}
    <section className="space-y-4" aria-label="Muro de anuncios">
      {!announcements.length && <p>{page === 1 ? "Todavía no hay anuncios en este grupo." : "No hay anuncios en esta página."}</p>}
      {announcements.map((item) => <article key={item.id} id={item.id} className="min-w-0 space-y-3 rounded-lg border p-4">
        <h2 className="break-words text-xl font-semibold">{item.title}</h2>
        <p className="text-sm text-muted-foreground">Administración · <time dateTime={item.created_at}>{format.format(new Date(item.created_at))}</time>
          {item.updated_at !== item.created_at && <> · Editado <time dateTime={item.updated_at}>{format.format(new Date(item.updated_at))}</time></>}</p>
        <p className="whitespace-pre-wrap break-words">{item.body}</p>
        {admin && <AnnouncementManagement groupId={group.id} announcement={item} />}
      </article>)}
    </section>
    <nav aria-label="Páginas del muro" className="flex flex-wrap items-center gap-4">
      {page > 1 && <Link prefetch={false} className="min-h-11 py-2 underline" href={`/groups/${group.id}/announcements?page=${page - 1}`}>Anterior</Link>}
      <span>Página {page}</span>
      {(announcements[0]?.total_count ?? 0) > page * 50 && <Link prefetch={false} className="min-h-11 py-2 underline" href={`/groups/${group.id}/announcements?page=${page + 1}`}>Siguiente</Link>}
    </nav>
  </>;
}
