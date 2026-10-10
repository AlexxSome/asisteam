import { AppShell } from "@/components/app-shell";
import { createSessionClient } from "@/lib/api/session";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GroupForm } from "./group-form";
export const metadata: Metadata = {
    title: "Crear grupo",
};
export default async function NewGroupPage() {
    const sessionClient = await createSessionClient();
    const { data: { user }, } = await sessionClient.auth.getUser();
    if (!user)
        redirect("/register");
    return (<AppShell><div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Crear un grupo</h1>
      <GroupForm />
      <Link href="/groups" className="inline-block text-sm underline underline-offset-4">
        Volver a Mis grupos
      </Link>
    </div></AppShell>);
}
