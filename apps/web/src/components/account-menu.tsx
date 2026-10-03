"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useId } from "react";
import { signOutUser } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const descriptionId = useId();
  const [result, action, pending] = useActionState(async () => {
    try {
      return await signOutUser();
    } catch (error) {
      unstable_rethrow(error);
      // Una caída de red entre navegador y Server Action también admite reintento.
      return { error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." };
    }
  }, undefined);

  return <details className={compact ? "relative min-w-0 shrink-0" : "w-full min-w-0 rounded-lg border p-3 sm:w-64"}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
    <summary className="min-h-11 cursor-pointer content-center rounded px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
      Mi cuenta
    </summary>
    <nav aria-label="Mi cuenta" className={compact
      ? "absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-border bg-surface p-4 shadow-overlay"
      : "mt-2 space-y-3"}>
      <Link href="/profile" className="flex min-h-11 items-center rounded px-2 text-sm underline underline-offset-4 focus-visible:outline-2">Mi perfil</Link>
      <form action={action} aria-busy={pending} className="space-y-3">
        <p id={descriptionId} className="text-sm text-muted-foreground">Cierra tu sesión en este dispositivo. Tus otras sesiones seguirán abiertas.</p>
        {result?.error && <p role="alert" className="text-sm">{result.error}</p>}
        <Button type="submit" variant="outline" disabled={pending} aria-describedby={descriptionId} className="h-auto min-h-11 w-full whitespace-normal">
          {pending ? "Cerrando sesión…" : result?.error ? "Reintentar cierre de sesión" : "Cerrar sesión"}
        </Button>
        <span role="status" className="sr-only">{pending ? "Cerrando sesión…" : ""}</span>
      </form>
    </nav>
  </details>;
}
