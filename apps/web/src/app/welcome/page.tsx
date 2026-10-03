import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { groupHomePath } from "@/lib/groups";

export const metadata: Metadata = {
  title: "Bienvenida",
};

/**
 * Pantalla ONB-01: bienvenida para usuarios sin membresías ACTIVE.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/register");

  const home = await groupHomePath();
  if (home !== "/welcome") redirect(home);

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, birthdate")
    .eq("auth_user_id", user.id)
    .single<{ full_name: string; birthdate: string | null }>();

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <AppShell><div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `¡Hola, ${firstName}!` : "¡Bienvenido/a a Asisteam!"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tu cuenta está lista. Para comenzar, crea un grupo o únete a uno
          existente con un código de invitación.
        </p>
      </div>

      {profile && !profile.birthdate && (
        <p className="text-center text-sm text-muted-foreground">
          Revisa tu nombre y completa tu fecha de nacimiento en{" "}
          <Link href="/profile" className="underline underline-offset-4">Mi perfil</Link>{" "}
          antes de unirte como deportista.
        </p>
      )}

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Crear un grupo</CardTitle>
            <CardDescription>
              Administra tu club o equipo: integrantes, actividades y
              asistencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/groups/new"
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Crear un grupo
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Unirme con código</CardTitle>
            <CardDescription>
              ¿Te compartieron un código de invitación? Únete como deportista.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/join"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            >
              Unirme con código
            </Link>
          </CardContent>
        </Card>
      </div>

      <Link href="/profile" className={buttonVariants({ variant: "outline" })}>
        Mi perfil
      </Link>
    </div></AppShell>
  );
}
