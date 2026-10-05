"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionLink, Button } from "./button";

export function ErrorState({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <section className="mx-auto max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-6 [overflow-wrap:anywhere]">
    <h1 className="text-h1">{offline ? "Sin conexión" : "No pudimos cargar esta página"}</h1>
    <p role="alert" className="text-muted-foreground">{offline
      ? "Revisa tu conexión a internet y vuelve a intentarlo cuando esté disponible."
      : "Ocurrió un problema al cargar el contenido. Puedes volver a intentarlo o continuar desde tus grupos."}</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" loading={retrying} onClick={() => startRetry(() => {
        // reset alone reuses the failed Server Component payload. Fetch a fresh
        // payload as well, preserving the current route and session.
        router.refresh();
        reset();
      })}>{retrying ? "Volviendo a cargar…" : "Volver a intentar"}</Button>
      <ActionLink href="/groups" variant="secondary">Volver a mis grupos</ActionLink>
    </div>
  </section>;
}
