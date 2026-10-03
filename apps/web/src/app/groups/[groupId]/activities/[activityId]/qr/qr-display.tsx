"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CHECKIN_ERROR_MESSAGES, checkinPath, type QrCheckinSettings } from "@asisteam/core";
import { issueCheckinQr, saveQrSettings } from "@/app/check-in/actions";

export function QrDisplay({ groupId, activityId, initialSettings }: { groupId: string; activityId: string; initialSettings: QrCheckinSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [url, setUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let ticker: ReturnType<typeof setInterval>;
    const refresh = async () => {
      clearInterval(ticker); setUrl(null); setError(null);
      const started = performance.now();
      try {
        const result = await issueCheckinQr(activityId);
        if (!active) return;
        if ("error" in result) { setError(result.error.message); return; }
        const duration = Date.parse(result.qr.expires_at) - Date.parse(result.qr.server_time);
        const deadline = started + duration;
        const remaining = () => Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
        if (deadline > performance.now()) {
          setUrl(window.location.origin + checkinPath({ activity_id: result.qr.activity_id, token: result.qr.token }));
          setSeconds(remaining());
          ticker = setInterval(() => { setSeconds(remaining()); if (!remaining()) setUrl(null); }, 250);
        }
        timer = setTimeout(() => { if (active) void refresh(); }, Math.max(250, deadline - performance.now()));
      } catch { if (active) setError(CHECKIN_ERROR_MESSAGES.checkin_failed!); }
    };
    void refresh();
    const visibility = () => {
      clearTimeout(timer); clearInterval(ticker); setUrl(null);
      // Reinicia el efecto y descarta cualquier respuesta de una petición anterior.
      if (document.visibilityState === "visible") setRevision(value => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; clearTimeout(timer); clearInterval(ticker); document.removeEventListener("visibilitychange", visibility); };
  }, [activityId, revision]);

  return <div className="space-y-6">
    <section className="space-y-3" aria-label="QR de asistencia">
      <p>Los deportistas escanean este QR con la cámara de su teléfono y abren el enlace para registrar su llegada.</p>
      {url ? <>
        <QRCodeSVG value={url} size={280} marginSize={4} level="M" title="QR temporal para registrar asistencia" className="h-auto max-w-full" />
        <p>Se renueva en {seconds} s. Mantén esta pantalla abierta.</p>
      </> : !error && <p role="status">Actualizando QR…</p>}
      {error && <><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="rounded-md border px-4 py-3">Actualizar QR</button></>}
      <p className="text-sm text-muted-foreground">Los registros anteriores se conservan. Solo un deportista con membresía activa en este grupo puede registrar su propia llegada.</p>
    </section>
    <form className="max-w-md space-y-4 rounded-md border p-4" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setFeedback(null);
      try {
        const result = await saveQrSettings(groupId, settings);
        if ("error" in result) setFeedback(result.error.message);
        else { setSettings(result.settings); setFeedback("Configuración guardada para todas las actividades del grupo."); setRevision(value => value + 1); }
      } catch { setFeedback(CHECKIN_ERROR_MESSAGES.checkin_failed!); }
      finally { setSaving(false); }
    }}>
      <h2 className="text-lg font-semibold">Horario de registro del grupo</h2>
      <p>Los minutos se cuentan desde el inicio de cada actividad. En el umbral exacto todavía se registra Presente.</p>
      {([
        ["opens_before_minutes", "Abrir minutos antes del inicio", 0],
        ["closes_after_minutes", "Cerrar minutos después del inicio", 1],
        ["late_after_minutes", "Registrar Atrasado después de estos minutos", 0],
      ] as const).map(([key, label, min]) => <div key={key} className="space-y-1">
        <label htmlFor={key} className="block font-medium">{label}</label>
        <input id={key} type="number" inputMode="numeric" min={min} max={1440} step={1} required value={Number.isNaN(settings[key]) ? "" : settings[key]} disabled={saving}
          className="w-full rounded-md border px-3 py-2" onChange={event => setSettings(current => ({ ...current, [key]: event.target.valueAsNumber }))} />
      </div>)}
      <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-3 text-primary-foreground">{saving ? "Guardando…" : "Guardar horario del grupo"}</button>
      {feedback && <p role="status">{feedback}</p>}
    </form>
  </div>;
}
