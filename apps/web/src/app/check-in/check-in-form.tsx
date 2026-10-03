"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

  if (input === undefined) return <p role="status">Leyendo el QR…</p>;
  if (!input) return <p role="alert">Abre la cámara de tu teléfono y escanea el QR actual que muestra el administrador de la actividad.</p>;
  if (!authenticated || (result && "error" in result && result.error.code === "authentication_required")) return <>
    <p>Inicia sesión con tu cuenta de deportista. Si el QR vence mientras ingresas, vuelve a escanearlo.</p>
    <LoginForm checkin={input} />
  </>;
  if (!result) return <p role="status">Registrando tu llegada…</p>;
  if ("error" in result) return <>
    <p role="alert">{result.error.message}</p>
    {result.error.code === "checkin_failed" && <button className="rounded-md border px-4 py-3" onClick={() => {
      request.current = null; setResult(null); setAttempt(value => value + 1);
    }}>Reintentar registro</button>}
    <Link href="/groups" className="block underline">Volver a mis grupos</Link>
  </>;
  return <div className="space-y-4" role="status">
    <h2 className="break-words text-xl font-medium">{result.receipt.activity_title}</h2>
    <p>{result.receipt.created ? "Llegada registrada" : "Ya tenías un registro"}: <strong>{ATTENDANCE_STATUS_LABELS[result.receipt.status]}</strong>.</p>
    {!result.receipt.created && <p>Se conservó tu asistencia anterior. Si necesitas corregirla, contacta al administrador.</p>}
    <Link href={`/groups/${result.receipt.group_id}/activities/${result.receipt.activity_id}`} className="block underline">Ver actividad</Link>
  </div>;
}
