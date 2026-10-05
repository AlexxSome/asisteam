"use client";

import { useEffect, useRef, useState } from "react";
import { ActionLink, Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ATTENDANCE_STATUS_LABELS, CHECKIN_ERROR_MESSAGES, parseCheckinFragment, type CheckinInput } from "@asisteam/core";
import { LoginForm } from "@/app/login/login-form";
import { redeemCheckin } from "./actions";

export function CheckinForm({ authenticated }: { authenticated: boolean }) {
  const [input, setInput] = useState<CheckinInput | null>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof redeemCheckin>> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<Awaited<ReturnType<typeof redeemCheckin>>> | null>(null);
  const fragmentRead = useRef(false);
  useEffect(() => {
    const readFragment = () => {
      setInput(parseCheckinFragment(window.location.hash));
      setResult(null); request.current = null;
      // No conservar el token en el historial ni pasarlo a enlaces posteriores.
      window.history.replaceState(null, "", window.location.pathname);
    };
    if (!fragmentRead.current) { fragmentRead.current = true; readFragment(); }
    // Algunas cámaras reutilizan la pestaña: otro QR cambia solo el fragmento.
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  useEffect(() => {
    if (!input || !authenticated) return;
    let active = true;
    request.current ??= redeemCheckin(input).catch(() => ({ error: { code: "checkin_failed", message: CHECKIN_ERROR_MESSAGES.checkin_failed!, details: {} } }));
    void request.current.then(value => { if (active) setResult(value); });
    return () => { active = false; };
  }, [input, authenticated, attempt]);

  const groupsLink = <ActionLink href="/groups">Volver a mis grupos</ActionLink>;
  if (input === undefined) return <div className="space-y-4"><p role="status">Leyendo el QR…</p>{groupsLink}</div>;
  if (!input) return <div className="space-y-4">
    <Alert tone="warning"><h2 className="font-semibold">Necesitas el QR de la actividad</h2><p>Este enlace no contiene un QR válido.</p></Alert>
    <p>Abre la cámara de tu teléfono y escanea el QR actual que muestra el administrador de la actividad.</p>
    {groupsLink}
  </div>;
  if (!authenticated || (result && "error" in result && result.error.code === "authentication_required")) return <div className="space-y-4">
    <h2 className="text-xl font-semibold">Inicia sesión para registrar tu llegada</h2>
    <p>Usa tu cuenta de deportista. Si el QR vence mientras ingresas, vuelve a escanear el código actual del administrador.</p>
    <LoginForm checkin={input} />
    {groupsLink}
  </div>;
  if (!result) return <div className="space-y-4">
    <p role="status">Registrando tu llegada…</p>
    <p className="text-small text-muted-foreground">Espera la confirmación antes de cerrar esta pantalla.</p>
    {groupsLink}
  </div>;
  if ("error" in result) {
    const expired = result.error.code === "checkin_qr_expired";
    const retryable = result.error.code === "checkin_failed";
    return <div className="space-y-4">
      <Alert><h2 className="font-semibold">{expired ? "QR vencido o no válido" : retryable ? "No pudimos confirmar tu llegada" : "Registro no disponible"}</h2><p>{result.error.message}</p></Alert>
      <p>{expired ? "Abre la cámara de tu teléfono y vuelve a escanear el QR actual del administrador."
        : retryable ? "Revisa tu conexión y vuelve a intentar. Si la llegada ya se guardó, se conservará ese registro."
          : "Consulta al administrador de la actividad para revisar el horario o tu acceso."}</p>
      {retryable && <Button variant="secondary" onClick={() => {
        request.current = null; setResult(null); setAttempt(value => value + 1);
      }}>Reintentar registro</Button>}
      {groupsLink}
    </div>;
  }
  return <div className="space-y-4">
    <Alert tone="success">
      <h2 className="text-xl font-semibold">{result.receipt.created ? "Llegada confirmada" : "Ya tenías un registro"}</h2>
      <p className="mt-2 font-medium">{result.receipt.activity_title}</p>
      <p>Estado: <strong>{ATTENDANCE_STATUS_LABELS[result.receipt.status]}</strong>.</p>
      {!result.receipt.created && <p className="mt-2">Se conservó tu asistencia anterior. Si necesitas corregirla, contacta al administrador.</p>}
    </Alert>
    <ActionLink href={`/groups/${result.receipt.group_id}/activities/${result.receipt.activity_id}`} variant="secondary">Ver actividad</ActionLink>
    {groupsLink}
  </div>;
}
