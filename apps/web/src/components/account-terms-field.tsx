import type { ComponentProps } from "react";
import { ACCOUNT_PRIVACY_URL, ACCOUNT_TERMS_URL, ACCOUNT_TERMS_VERSION } from "@asisteam/core";

/** Aviso y control compartidos por email, invitación y onboarding OAuth. */
export function AccountTermsField({ error, versionError, disabled, ...input }: ComponentProps<"input"> & { error?: string; versionError?: string }) {
  const id = input.id ?? "terms_accepted";
  const message = error ?? versionError;
  return <fieldset className="min-w-0 space-y-2" disabled={disabled}>
    <legend className="text-small font-medium">Condiciones de uso y privacidad</legend>
    <p id={`${id}-help`} className="text-small text-muted-foreground">
      Revisa las <a href={ACCOUNT_TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">condiciones de uso</a>{" "}
      y la <a href={ACCOUNT_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">privacidad de tus datos</a>{" "}
      antes de aceptar. Los enlaces se abren en otra pestaña. Versión {ACCOUNT_TERMS_VERSION}.
    </p>
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 text-small">
      <input {...input} id={id} name="terms_accepted" type="checkbox" required
        aria-invalid={!!message} aria-describedby={`${id}-help ${id}-scope${message ? ` ${id}-error` : ""}`}
        className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      <span>Acepto las condiciones de uso y privacidad de mi cuenta.</span>
    </label>
    <p id={`${id}-scope`} className="text-small text-muted-foreground">Esta aceptación no autoriza el tratamiento de datos ni las fotos de un menor. El consentimiento de su apoderado se solicita por separado.</p>
    {message && <p id={`${id}-error`} role="alert" className="text-small text-destructive">{message}</p>}
  </fieldset>;
}
