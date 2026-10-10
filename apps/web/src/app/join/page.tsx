import { joinByCode } from "@/app/groups/[groupId]/actions";
import { PendingJoinRequests } from "@/app/groups/[groupId]/members/pending/membership-review";
import { AppShell } from "@/components/app-shell";
import { getMyPendingMemberships } from "@/lib/groups";
import { createSessionClient } from "@/lib/api/session";
import { GROUP_ERROR_MESSAGES,joinCodeSchema } from "@asisteam/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
    title: "Unirme con código",
};
export default async function JoinPage({ searchParams }: {
    searchParams: Promise<{
        code?: string;
        error?: string;
        pending?: string;
    }>;
}) {
    const { code, error } = await searchParams;
    const sessionClient = await createSessionClient();
    const { data: { user }, } = await sessionClient.auth.getUser();
    if (!user) {
        const inviteCode = joinCodeSchema.safeParse(code);
        redirect(inviteCode.success ? `/login?invite_code=${inviteCode.data}` : "/login");
    }
    const pending = await getMyPendingMemberships();
    const errorMessage = error && Object.hasOwn(GROUP_ERROR_MESSAGES, error)
        ? GROUP_ERROR_MESSAGES[error] : null;
    return (<AppShell><div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Unirme con código</h1>
      <p className="max-w-md text-muted-foreground">{pending.length ? "Para unirte a otro grupo, ingresa su código. Tus solicitudes anteriores siguen guardadas." : "Ingresa el código que compartió el administrador. Te incorporarás como deportista."}</p>
      <PendingJoinRequests memberships={pending}/>
      {errorMessage && <p role="alert" className="text-destructive">{errorMessage}</p>}
      <form action={joinByCode} className="w-full max-w-sm space-y-3 text-left">
        <label htmlFor="invite-code" className="block">Código de invitación</label>
        <input id="invite-code" name="code" defaultValue={code ?? ""} required minLength={8} maxLength={8} pattern="[A-Za-z0-9]{8}" autoComplete="off" className="min-h-11 w-full rounded-md border bg-background px-3 py-2 font-mono"/>
        <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">Unirme al grupo</button>
      </form>
      <Link href="/welcome" className="text-sm underline underline-offset-4">
        Volver al inicio
      </Link>
    </div></AppShell>);
}
