"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAnnouncementPush } from "./actions";

type ReadingPosition = { id?: string; top?: number; x: number; y: number };
const WallContext = createContext<{
  blockRefresh: () => () => void;
  refresh: () => void;
  pending: boolean;
  paused: boolean;
  announce: (message: string, focus?: boolean) => void;
} | null>(null);

/** Coordinates refreshes without replacing an open editor or moving the reader. */
export function WallSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const blockers = useRef(0);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<{ text: string; sequence: number } | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const focusFeedback = useRef(false);
  const position = useRef<ReadingPosition | null>(null);
  const refreshing = useRef(false);
  const blockRefresh = useCallback(() => {
    blockers.current += 1;
    setPaused(true);
    return () => { blockers.current -= 1; setPaused(blockers.current > 0); };
  }, []);
  const announce = useCallback((text: string, focus = false) => {
    focusFeedback.current = focus;
    setMessage((previous) => ({ text, sequence: (previous?.sequence ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (focusFeedback.current) { feedback.current?.focus({ preventScroll: true }); focusFeedback.current = false; }
  }, [message]);
  const refresh = useCallback(() => {
    if (blockers.current || refreshing.current) return;
    const visible = Array.from(document.querySelectorAll<HTMLElement>("[data-announcement]")).find((article) => {
      const rect = article.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    position.current = { id: visible?.id, top: visible?.getBoundingClientRect().top, x: window.scrollX, y: window.scrollY };
    refreshing.current = true;
    startTransition(() => router.refresh());
  }, [router]);
  useLayoutEffect(() => {
    if (pending || !position.current) return;
    const previous = position.current;
    position.current = null;
    refreshing.current = false;
    // Do not undo scrolling performed by the reader while the request was in flight.
    if (window.scrollY !== previous.y) return;
    const anchor = previous.id ? document.getElementById(previous.id) : null;
    const y = anchor && previous.top !== undefined ? window.scrollY + anchor.getBoundingClientRect().top - previous.top : previous.y;
    if (y !== window.scrollY) window.scrollTo({ left: previous.x, top: y, behavior: "instant" });
  }, [pending]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh]);
  return <WallContext.Provider value={{ blockRefresh, refresh, pending, paused, announce }}>
    {message && <p key={message.sequence} ref={feedback} role="status" tabIndex={-1} className="rounded-lg border border-border bg-surface p-3">{message.text}</p>}
    {children}
  </WallContext.Provider>;
}

export function useWallEditor(open: boolean) {
  const blockRefresh = useContext(WallContext)?.blockRefresh;
  useEffect(() => { if (open) return blockRefresh?.(); }, [open, blockRefresh]);
}

export function useWallAnnouncement() {
  return useContext(WallContext)?.announce;
}

export function WallRefresh() {
  const session = useContext(WallContext);
  const [requested, setRequested] = useState(false);
  return <div className="space-y-1" aria-busy={session?.pending || undefined}>
    <Button type="button" variant="secondary" aria-disabled={session?.pending || undefined} onClick={() => {
      setRequested(true);
      session?.refresh();
    }}>{session?.pending ? "Actualizando…" : "Actualizar muro"}</Button>
    {session?.paused && <p role={requested ? "status" : undefined} className="max-w-sm text-small text-muted-foreground">
      Actualización pausada. Cierra el editor o la confirmación para actualizar sin perder tus cambios.
    </p>}
  </div>;
}

export function AnnouncementPushPreference({ enabled, hasDevices }: { enabled: boolean; hasDevices: boolean }) {
  const router = useRouter();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(enabled);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => { setValue(enabled); }, [enabled]);
  async function change(next: boolean) {
    setPending(true); setMessage(null);
    try {
      const result = await setAnnouncementPush(next);
      if ("error" in result) setMessage({ error: true, text: result.error.message });
      else {
        setValue(next);
        setMessage({ error: false, text: next ? "Avisos habilitados para todos tus grupos." : "Avisos deshabilitados para todos tus grupos." });
        router.refresh();
      }
    } catch { setMessage({ error: true, text: "No pudimos guardar tu preferencia." }); }
    finally { setPending(false); }
  }
  return <details className="min-w-0 rounded-lg border border-border bg-surface p-4">
    <summary className="min-h-11 cursor-pointer py-2 font-medium">Avisos de todos mis grupos</summary>
    <div className="space-y-3 pt-3">
      <p id={`${id}-scope`} className="text-small text-muted-foreground">Esta preferencia se aplica a todos tus grupos, no solo al grupo que estás viendo. Los avisos requieren un dispositivo móvil vinculado y permiso de notificaciones.</p>
      {!hasDevices && <p id={`${id}-devices`} className="text-small">No tienes dispositivos vinculados. La aplicación móvil que permitirá vincularlos está pendiente; por ahora puedes leer los anuncios en este muro. Este navegador no recibe estos avisos.</p>}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={value} disabled={pending}
          aria-describedby={`${id}-scope${hasDevices ? "" : ` ${id}-devices`}`} onChange={(event) => change(event.target.checked)} />
        {hasDevices ? "Recibir avisos de todos mis grupos" : "Guardar preferencia de avisos para todos mis grupos"}
      </label>
      {!hasDevices && value && <p className="text-small text-muted-foreground">Tu preferencia está guardada, pero no recibirás avisos hasta vincular un dispositivo móvil. Puedes desactivarla aquí.</p>}
      {message && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
    </div>
  </details>;
}
