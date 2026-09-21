import { notFound } from "next/navigation";
import { getGroup } from "@/lib/groups";

export const metadata = { title: "Configuración del grupo" };

export default async function GroupSettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  return <>
    <h1 className="text-2xl font-semibold">Configuración del grupo</h1>
    <section className="space-y-3 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Código de invitación</h2>
      <p>Comparte este código con quienes quieras incorporar como deportistas.</p>
      <p className="font-mono text-xl tracking-widest">{group.invite_code}</p>
    </section>
  </>;
}
