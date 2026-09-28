import Link from "next/link";
import { getMyWards, parseWardsPage } from "@/lib/wards";

export const metadata = { title: "Mis pupilos" };
export const dynamic = "force-dynamic";

export default async function WardsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = parseWardsPage((await searchParams).page);
  const { wards, hasNext } = await getMyWards(page);
  return <main className="mx-auto max-w-3xl space-y-6 p-4 py-10">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Mis pupilos</h1>
      <p className="text-muted-foreground">Elige un deportista para ver su perfil deportivo y sus grupos.</p>
    </header>
    {wards.length === 0 ? <p>{page === 1
      ? "Aún no tienes deportistas a tu cargo; pide al administrador del grupo que te vincule."
      : "No hay más pupilos en esta página."}</p> : <ul className="grid gap-4 sm:grid-cols-2">
      {wards.map((ward) => <li key={ward.athlete_user_id} className="space-y-3 rounded-lg border p-5">
        <Link href={`/wards/${ward.athlete_user_id}`} prefetch={false} className="flex min-h-11 items-center gap-3 underline underline-offset-4">
          {ward.avatar_url && <img src={ward.avatar_url} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />}
          <h2 className="break-words text-lg font-semibold">{ward.full_name}</h2>
        </Link>
        <p className="text-sm text-muted-foreground">{ward.age} años</p>
        <ul className="space-y-1 text-sm" aria-label={`Grupos de ${ward.full_name}`}>
          {ward.groups.map((group) => <li key={group.group_id} className="break-words">{group.name}
            {group.membership_status === "PENDING" && <span className="text-muted-foreground"> · Pendiente de activación</span>}
          </li>)}
        </ul>
        {ward.days_until_majority !== null && ward.days_until_majority <= 30 && <p className="rounded-md bg-muted p-3 text-sm">
          En {ward.days_until_majority} {ward.days_until_majority === 1 ? "día" : "días"} tu pupilo administrará su propia cuenta.
        </p>}
      </li>)}
    </ul>}
    <nav aria-label="Páginas de mis pupilos" className="flex gap-5 underline">
      {page > 1 && <Link href={`/wards?page=${page - 1}`} prefetch={false}>Anterior</Link>}
      {hasNext && <Link href={`/wards?page=${page + 1}`} prefetch={false}>Siguiente</Link>}
    </nav>
    <p className="text-sm text-muted-foreground">Al cumplir 18 años, el deportista deja de aparecer entre tus pupilos y recibes un aviso por correo.</p>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
      <Link href="/groups">Mis grupos</Link><Link href="/profile">Mi perfil</Link>
    </nav>
  </main>;
}
