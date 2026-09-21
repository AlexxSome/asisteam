"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation } from "./actions";

export function InvitationForm({ token, signedInEmail }: { token: string; signedInEmail?: string }) {
  const [mode, setMode] = useState<"session" | "login" | "register">(signedInEmail ? "session" : "login");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  if (pending) return <p role="status">Tu incorporación está pendiente. Tu apoderado debe estar vinculado y otorgar su consentimiento; después, el ADMIN podrá confirmar tu ingreso.</p>;
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="Cómo aceptar la invitación">
      {signedInEmail && <Button type="button" variant={mode === "session" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("session"); setError(undefined); }}>Usar mi sesión</Button>}
      <Button type="button" variant={mode === "login" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("login"); setError(undefined); }}>Ya tengo cuenta</Button>
      <Button type="button" variant={mode === "register" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("register"); setError(undefined); }}>Crear mi cuenta</Button>
    </div>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError(undefined); setBusy(true);
      const form = new FormData(event.currentTarget);
      try {
        const result = await acceptInvitation(token, mode, {
          email: form.get("email"), password: form.get("password"), full_name: form.get("full_name"),
          birthdate: form.get("birthdate"), phone: form.get("phone") || undefined,
          terms_accepted: form.get("terms_accepted") === "on",
        });
        if (result && "error" in result) setError(result.error);
        if (result && "pending" in result) setPending(true);
      } finally { setBusy(false); }
    }}>
      {mode === "session" ? <p className="break-words text-sm">Sesión actual: {signedInEmail}</p> : <>
        <div className="space-y-2"><Label htmlFor="email">Email que recibió la invitación</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
        {mode === "register" && <>
          <div className="space-y-2"><Label htmlFor="full_name">Nombre completo</Label>
            <Input id="full_name" name="full_name" autoComplete="name" minLength={2} maxLength={120} required /></div>
          <div className="space-y-2"><Label htmlFor="birthdate">Fecha de nacimiento</Label>
            <Input id="birthdate" name="birthdate" type="date" required /></div>
          <div className="space-y-2"><Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+56912345678" /></div>
        </>}
        <div className="space-y-2"><Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 10 : undefined} maxLength={128} required />
          {mode === "register" && <p className="text-sm text-muted-foreground">Mínimo 10 caracteres.</p>}</div>
        {mode === "register" && <>
          <details className="text-sm"><summary className="cursor-pointer underline">Uso y privacidad de tus datos</summary>
            <p className="mt-2">Asisteam usa tus datos de perfil y asistencia para gestionar tu participación en los grupos deportivos.
              Los administradores del grupo gestionan tus registros. Tus datos de contacto y fecha de nacimiento no se muestran a otros integrantes.</p>
            <p className="mt-2">Si eres menor de edad, tu apoderado debe consentir el tratamiento de tus datos antes de activar tu cuenta.
              Puedes solicitar acceso, rectificación o eliminación de tus datos al responsable de tu grupo.</p>
          </details>
          <label className="flex items-start gap-3 text-sm"><input name="terms_accepted" type="checkbox" required className="mt-1 size-4 shrink-0" />
            Acepto las condiciones de uso y privacidad indicadas.</label>
        </>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={busy}>{busy ? "Procesando…" : mode === "register" ? "Activar cuenta y aceptar" : mode === "login" ? "Iniciar sesión y aceptar" : "Aceptar invitación"}</Button>
    </form>
  </div>;
}
