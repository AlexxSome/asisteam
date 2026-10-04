"use client";

import { useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { ACCOUNT_TERMS_VERSION, accountConsentSchema } from "@asisteam/core";
import { AccountTermsField } from "@/components/account-terms-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signOutUser } from "@/app/login/actions";
import { consentReturnPath } from "@/lib/account-consent-routing";
import { acceptAccountTerms } from "./actions";

export function AcceptTermsForm({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const parsed = accountConsentSchema.safeParse({ terms_accepted: new FormData(form).get("terms_accepted") === "on", terms_version: ACCOUNT_TERMS_VERSION });
    setError(undefined); setFieldError(undefined);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      form.querySelector<HTMLInputElement>("input[type=checkbox]")?.focus();
      return;
    }
    submitting.current = true; setBusy(true);
    try {
      const result = await acceptAccountTerms(parsed.data);
      if ("error" in result) setError(result.error);
      else {
        const path = consentReturnPath(returnTo);
        window.location.assign(path + (path === "/check-in" ? window.location.hash : ""));
      }
    } catch {
      setError("No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <div className="space-y-4">
    <form noValidate onSubmit={submit} aria-busy={busy} className="space-y-4">
      <AccountTermsField error={fieldError} disabled={busy} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">Aceptar y continuar</Button>
      <p role="status" className="text-small text-muted-foreground">{busy ? "Registrando aceptación…" : ""}</p>
    </form>
    <Button type="button" variant="tertiary" disabled={busy} className="w-full" onClick={async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); setError(undefined);
      try { const result = await signOutUser(); setError(result.error); }
      catch (cause) { unstable_rethrow(cause); setError("No pudimos cerrar la sesión. Vuelve a intentarlo."); }
      finally { submitting.current = false; setBusy(false); }
    }}>Salir sin aceptar</Button>
  </div>;
}
