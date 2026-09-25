import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyGroups } from "@/lib/groups";

export const metadata = { title: "Mi asistencia" };

export default async function MyHistoryGroupsPage() {
  const { groups } = await getMyGroups();
  const athleteGroups = groups.filter((group) => group.roles.includes("ATHLETE"));
  if (athleteGroups.length === 1) redirect(`/groups/${athleteGroups[0]!.id}/me/history`);
  return <main className="mx-auto max-w-3xl space-y-5 p-4">
    <h1 className="text-2xl font-semibold">Mi asistencia</h1>
    {athleteGroups.length ? <><p>Elige un grupo para consultar tu historial.</p>
      <ul className="space-y-3">{athleteGroups.map((group) => <li key={group.id}><Link href={`/groups/${group.id}/me/history`} className="block rounded-lg border p-4 underline">{group.name}</Link></li>)}</ul>
    </> : <p>Aún no tienes una membresía activa como deportista.</p>}
    <Link href="/groups" className="block underline">Volver a mis grupos</Link>
  </main>;
}
