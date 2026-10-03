"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAnnouncementPush } from "./actions";

export function WallRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router]);
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="min-h-11 underline">{pending ? "Actualizando…" : "Actualizar muro"}</button>;
}

export function AnnouncementPushPreference({ enabled, hasDevices }: { enabled: boolean; hasDevices: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  async function change(value: boolean) {
    setPending(true); setMessage(null);
    try {
      const result = await setAnnouncementPush(value);
      if ("error" in result) setMessage({ error: true, text: result.error.message });
      else { setMessage({ error: false, text: value ? "Avisos de anuncios habilitados." : "Avisos de anuncios deshabilitados." }); router.refresh(); }
    } catch { setMessage({ error: true, text: "No pudimos guardar tu preferencia." }); }
    finally { setPending(false); }
  }
  return <section className="space-y-2 rounded-lg border p-4" aria-label="Avisos de anuncios">
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} disabled={pending} onChange={(event) => change(event.target.checked)} />Recibir avisos de anuncios de mis grupos</label>
    <p className="text-sm text-muted-foreground">Se aplica a todos tus grupos y dispositivos vinculados con notificaciones permitidas.</p>
    {!hasDevices && <p className="text-sm">No tienes dispositivos vinculados para recibir estos avisos. Los anuncios siguen disponibles en el muro.</p>}
    {message && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
  </section>;
}
