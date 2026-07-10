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

export const metadata: Metadata = {
  title: "Bienvenida",
};

/**
 * Pantalla ONB-01 (docs/05-pantallas.md): usuario autenticado sin
 * membresías. Cuando exista `memberships` (HU-GEN-05), quienes ya
 * tengan grupos serán redirigidos a su dashboard en vez de ver esto.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/register");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("auth_user_id", user.id)
    .single<{ full_name: string }>();

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `¡Hola, ${firstName}!` : "¡Bienvenido/a a Asisteam!"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tu cuenta está lista. Para comenzar, crea un grupo o únete a uno
          existente con un código de invitación.
        </p>
      </div>

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
    </main>
  );
}
