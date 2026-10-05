"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CHECKIN_ERROR_MESSAGES, checkinPath, qrCheckinSettingsSchema, type QrCheckinSettings } from "@asisteam/core";
import { issueCheckinQr, saveQrSettings } from "@/app/check-in/actions";
import { Alert } from "@/components/ui/alert";
import { ActionLink, Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Feedback = { tone: "error" | "success"; message: string };

export function QrDisplay({ groupId, activityId, initialSettings }: { groupId: string; activityId: string; initialSettings: QrCheckinSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [url, setUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof QrCheckinSettings, string>>>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    let ticker: ReturnType<typeof setInterval>;
    const refresh = async () => {
      const current = ++generation;
      clearInterval(ticker); setUrl(null); setError(null);
      const started = performance.now();
      try {
        const result = await issueCheckinQr(activityId);
        if (!active || current !== generation) return;
        if ("error" in result) { setError(result.error); return; }
        const duration = Date.parse(result.qr.expires_at) - Date.parse(result.qr.server_time);
        const deadline = started + duration;
        const remaining = () => Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
        if (deadline > performance.now()) {
          setUrl(window.location.origin + checkinPath({ activity_id: result.qr.activity_id, token: result.qr.token }));
          setSeconds(remaining());
          ticker = setInterval(() => { setSeconds(remaining()); if (!remaining()) setUrl(null); }, 250);
        }
        timer = setTimeout(() => { if (active) void refresh(); }, Math.max(250, deadline - performance.now()));
      } catch {
        if (active && current === generation) setError({ code: "checkin_failed", message: CHECKIN_ERROR_MESSAGES.checkin_failed! });
      }
    };
    if (document.visibilityState === "visible") void refresh();
    const visibility = () => {
      generation += 1;
      clearTimeout(timer); clearInterval(ticker); setUrl(null);
      // Descarta también respuestas que llegan mientras la pestaña está oculta.
      if (document.visibilityState === "visible") setRevision(value => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; clearTimeout(timer); clearInterval(ticker); document.removeEventListener("visibilitychange", visibility); };
  }, [activityId, revision]);

  return <div className="space-y-6">
    <section className="space-y-3" aria-label="QR de asistencia">
      <div className="mx-auto flex min-h-72 max-w-sm flex-col items-center justify-center rounded-lg border bg-white p-2">
        {url ? <QRCodeSVG value={url} size={280} marginSize={4} level="M" title="QR temporal para registrar asistencia" className="h-auto max-w-full" />
          : !error ? <p role="status" className="p-4 text-center text-slate-700">Actualizando QR…</p>
            : <div className="space-y-3 p-2">
              <Alert><p className="font-semibold">QR no disponible</p><p>{error.message}</p></Alert>
              {error.code === "checkin_failed" && <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Reintentar cargar QR</Button>}
              <ActionLink href={`/groups/${groupId}/activities/${activityId}`}>Volver a la actividad</ActionLink>
            </div>}
      </div>
      {/* El contador visual queda fuera de las regiones de anuncios. */}
      {url && <p className="text-center text-small">Se renueva en {seconds} s. Mantén esta pantalla abierta.</p>}
      <p className="text-small">Escanea con la cámara de tu teléfono y abre el enlace para registrar tu llegada.</p>
      <p className="text-small text-muted-foreground">Solo para deportistas activos de este grupo. Si ya hay asistencia, se conserva el registro anterior.</p>
    </section>
    <details className="rounded-lg border bg-surface">
      <summary className="min-h-11 cursor-pointer rounded-lg px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Ajustes de QR de todo el grupo</summary>
      <form className="max-w-lg space-y-4 p-4 pt-1" aria-label="Horario de registro del grupo" aria-describedby="qr-settings-scope" aria-busy={saving} noValidate onSubmit={async event => {
        event.preventDefault();
        if (submitting.current) return;
        setFeedback(null);
        const parsed = qrCheckinSettingsSchema.safeParse(settings);
        if (!parsed.success) {
          setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0], issue.code === "custom" ? issue.message : "Ingresa un número entero dentro del rango indicado."])));
          setFeedback({ tone: "error", message: CHECKIN_ERROR_MESSAGES.invalid_qr_settings! });
          return;
        }
        submitting.current = true; setSaving(true); setFieldErrors({});
        try {
          const result = await saveQrSettings(groupId, parsed.data);
          if ("error" in result) setFeedback({ tone: "error", message: result.error.message });
          else {
            setSettings(result.settings);
            setFeedback({ tone: "success", message: "Horario guardado para todas las actividades del grupo." });
            setRevision(value => value + 1);
          }
        } catch { setFeedback({ tone: "error", message: "No pudimos guardar el horario. Revisa tu conexión y vuelve a guardar." }); }
        finally { submitting.current = false; setSaving(false); }
      }}>
        <p id="qr-settings-scope" className="text-small">Al guardar, estos horarios se aplican a <strong>todas las actividades del grupo</strong>, incluida esta. Los registros anteriores se conservan.</p>
        <p className="text-small text-muted-foreground">Los minutos se cuentan desde el inicio de cada actividad. En el umbral exacto todavía se registra Presente.</p>
        {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
        {([
          ["opens_before_minutes", "Abrir minutos antes del inicio", 0],
          ["closes_after_minutes", "Cerrar minutos después del inicio", 1],
          ["late_after_minutes", "Registrar Atrasado después de estos minutos", 0],
        ] as const).map(([key, label, min]) => <Field key={key} id={key} label={label} help={`Entre ${min} y 1440 minutos.`} error={fieldErrors[key]}>
          <Input type="number" inputMode="numeric" min={min} max={1440} step={1} required value={Number.isNaN(settings[key]) ? "" : settings[key]} disabled={saving}
            onChange={event => {
              setSettings(current => ({ ...current, [key]: event.target.valueAsNumber }));
              setFeedback(null); setFieldErrors({});
            }} />
        </Field>)}
        <Button type="submit" loading={saving}>{saving ? "Guardando…" : "Guardar horario para todo el grupo"}</Button>
      </form>
    </details>
  </div>;
}
