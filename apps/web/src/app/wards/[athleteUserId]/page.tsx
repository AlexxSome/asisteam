import Link from "next/link";
import { getWard } from "@/lib/wards";

export const metadata = { title: "Perfil deportivo del pupilo" };
export const dynamic = "force-dynamic";

export default async function WardPage({ params }: { params: Promise<{ athleteUserId: string }> }) {
  const ward = await getWard((await params).athleteUserId);
  return <main className="mx-auto max-w-3xl space-y-6 p-4 py-10">
    <Link href="/wards" prefetch={false} className="inline-block py-2 underline">Volver a mis pupilos</Link>
    <header className="flex items-center gap-4">
      {ward.avatar_url && <img src={ward.avatar_url} alt="" width={72} height={72} className="size-18 rounded-full object-cover" />}
      <div><p className="text-sm text-muted-foreground">Perfil deportivo</p>
        <h1 className="break-words text-2xl font-semibold">{ward.full_name}</h1>
        <p className="mt-2 text-muted-foreground">{ward.age} años</p>
      </div>
    </header>
    <section aria-labelledby="ward-groups" className="space-y-4">
      <h2 id="ward-groups" className="text-xl font-semibold">Sus grupos</h2>
      <ul className="space-y-3">{ward.groups.map((group) => <li key={group.group_id} className="space-y-2 rounded-lg border p-4">
        <Link href={`/groups/${group.group_id}`} prefetch={false} className="block break-words py-2 text-lg font-semibold underline">{group.name}</Link>
        {group.sport && <p>{group.sport}</p>}
        <p className="text-sm text-muted-foreground">{group.membership_status === "PENDING" ? "Pendiente de activación" : "Membresía activa"}</p>
        {group.membership_status === "ACTIVE" && <Link href={`/groups/${group.group_id}/wards/${ward.athlete_user_id}/history`} prefetch={false} className="inline-block min-h-11 py-2 underline">Ver historial de asistencia</Link>}
      </li>)}</ul>
    </section>
  </main>;
}
