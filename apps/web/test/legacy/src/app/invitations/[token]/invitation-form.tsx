// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
"use client";

import { useState } from "react";
import { ACCOUNT_TERMS_VERSION } from "@asisteam/core";
import { AccountTermsField } from "@/components/account-terms-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation } from "@legacy/app/invitations/[token]/actions";

export function InvitationForm({ token, signedInEmail, managedActivation = false }: { token: string; signedInEmail?: string; managedActivation?: boolean }) {
  const [mode, setMode] = useState<"session" | "login" | "register" | "claim">(managedActivation ? "claim" : signedInEmail ? "session" : "login");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const creatingCredentials = mode === "register" || mode === "claim";
  if (pending) return <p role="status">{managedActivation
    ? "Tu cuenta está activada y tu historial se conserva. Tu ingreso a este grupo sigue pendiente de la confirmación del ADMIN."
    : "Tu incorporación está pendiente. Tu apoderado debe estar vinculado y otorgar su consentimiento; después, el ADMIN podrá confirmar tu ingreso."}</p>;
  return <div className="space-y-5">
    {managedActivation ? <p className="text-sm">Crea tu contraseña para acceder al perfil que gestiona tu ADMIN. Si eres menor de edad, tu apoderado debe mantener vigente su autorización para activar la cuenta.</p> :
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cómo aceptar la invitación">
      {signedInEmail && <Button type="button" variant={mode === "session" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("session"); setError(undefined); }}>Usar mi sesión</Button>}
      <Button type="button" variant={mode === "login" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("login"); setError(undefined); }}>Ya tengo cuenta</Button>
      <Button type="button" variant={mode === "register" ? "default" : "outline"} disabled={busy}
        onClick={() => { setMode("register"); setError(undefined); }}>Crear mi cuenta</Button>
    </div>}
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError(undefined); setBusy(true);
      const form = new FormData(event.currentTarget);
      try {
        const result = await acceptInvitation(token, mode, {
          email: form.get("email"), password: form.get("password"),
          terms_accepted: form.get("terms_accepted") === "on",
          terms_version: ACCOUNT_TERMS_VERSION,
          ...(mode === "claim" ? {} : { full_name: form.get("full_name"),
            birthdate: form.get("birthdate"), phone: form.get("phone") || undefined }),
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
          <Input id="password" name="password" type="password" autoComplete={creatingCredentials ? "new-password" : "current-password"}
            minLength={creatingCredentials ? 10 : undefined} maxLength={128} required />
          {creatingCredentials && <p className="text-sm text-muted-foreground">Mínimo 10 caracteres.</p>}</div>
        {creatingCredentials && <AccountTermsField disabled={busy} />}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={busy}>{busy ? "Procesando…" : mode === "claim" ? "Activar mi cuenta y ver mi historial" : mode === "register" ? "Activar cuenta y aceptar" : mode === "login" ? "Iniciar sesión y aceptar" : "Aceptar invitación"}</Button>
    </form>
  </div>;
}
