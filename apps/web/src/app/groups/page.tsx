import Link from "next/link";
import { redirect } from "next/navigation";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import { getMyGroups } from "@/lib/groups";

export const metadata = { title: "Mis grupos" };

export default async function GroupsPage() {
  const { groups } = await getMyGroups();
  if (!groups.length) redirect("/welcome");
  return <main className="mx-auto max-w-3xl space-y-6 p-4 py-10">
    <header><h1 className="text-2xl font-semibold">Mis grupos</h1>
      <p className="mt-2 text-muted-foreground">Elige el grupo en el que quieres participar.</p></header>
    <ul className="grid gap-4 sm:grid-cols-2">
      {groups.map((group) => <li key={group.id}>
        <Link href={`/groups/${group.id}`} className="block h-full space-y-2 rounded-lg border p-5 hover:bg-muted focus-visible:outline-2">
          <span className="block text-lg font-semibold">{group.name}</span>
          {group.sport && <span className="block text-sm text-muted-foreground">{group.sport}</span>}
          <span className="block text-sm">{group.roles.map((role) => MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</span>
          <span className="block text-xs text-muted-foreground">Membresía activa</span>
        </Link>
      </li>)}
    </ul>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
      <Link href="/groups/new">Crear un grupo</Link><Link href="/join">Unirme con código</Link><Link href="/profile">Mi perfil</Link>
    </nav>
  </main>;
}
