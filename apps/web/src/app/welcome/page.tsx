import { PendingJoinRequests } from "@/app/groups/[groupId]/members/pending/membership-review";
import { AppShell } from "@/components/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card,CardContent,CardDescription,CardHeader,CardTitle,} from "@/components/ui/card";
import { createServerApiClient } from '@/lib/api/server';
import { getMyPendingMemberships,groupHomePath } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
    title: "Bienvenida",
};
/**
 * Pantalla ONB-01: bienvenida para usuarios sin membresías ACTIVE.
 */
export default async function WelcomePage() {
    const supabase = await createClient();
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user)
        redirect("/register");
    const home = await groupHomePath();
    if (home !== "/welcome")
        redirect(home);
    const profile = await createServerApiClient().getOwnProfile();
    const pending = await getMyPendingMemberships();
    const firstName = profile?.full_name?.split(" ")[0] ?? "";
    return (<AppShell><div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `¡Hola, ${firstName}!` : "¡Bienvenido/a a Asisteam!"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {pending.length ? "Tu cuenta está lista y tus solicitudes siguen guardadas. Revisa quién debe completar cada paso." : "Tu cuenta está lista. Para comenzar, crea un grupo o únete a uno existente con un código de invitación."}
        </p>
      </div>

      {profile && !profile.birthdate && (<p className="text-center text-sm text-muted-foreground">
          Revisa tu nombre y completa tu fecha de nacimiento en{" "}
          <Link href="/profile" className="underline underline-offset-4">Mi perfil</Link>{" "}
          antes de unirte como deportista.
        </p>)}

      <PendingJoinRequests memberships={pending}/>
      {pending.length > 0 && <h2 className="text-xl font-semibold">Otros grupos</h2>}
      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Crear un grupo</CardTitle>
            <CardDescription>
              Administra tu club o equipo: integrantes, actividades y
              asistencia. Puedes configurarlo antes de contratar. Para activar
              deportistas necesitas el primer pago aprobado de un plan mensual;
              no hay prueba gratuita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/groups/new" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              Crear un grupo
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Unirme con código</CardTitle>
            <CardDescription>
              ¿Te compartieron un código de invitación? Únete como deportista.
              El administrador gestiona los cupos; no necesitas contratar un plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/join" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
              Unirme con código
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="max-w-xl text-center text-sm text-muted-foreground">Si eres apoderado, abre la invitación por email que te envió el administrador. El código de grupo incorpora solo deportistas.</p>

      <Link href="/profile" className={buttonVariants({ variant: "outline" })}>
        Mi perfil
      </Link>
    </div></AppShell>);
}
