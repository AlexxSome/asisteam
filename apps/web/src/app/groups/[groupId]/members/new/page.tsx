import { notFound } from "next/navigation";
import { getGroup } from "@/lib/groups";
import { ManagedMemberForm } from "./managed-member-form";

export const metadata = { title: "Crear cuenta gestionada" };

export default async function NewManagedMemberPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  return <>
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Crear cuenta gestionada</h1>
      <p>Registra un deportista en {group.name} sin credenciales de acceso. Su email es opcional.</p>
    </header>
    <ManagedMemberForm groupId={group.id} />
  </>;
}
