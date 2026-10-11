import { Form, Link, useNavigation } from "react-router";
import { ACCOUNT_TERMS_VERSION, httpSchemas, SOCIAL_PROVIDER_LABELS } from "@asisteam/core/browser";
import { Button, Field, Input } from "./ui";
import { safeReturn } from "./api";

export function inviteCode(url: URL) {
  if (url.searchParams.getAll("invite_code").length !== 1) return undefined;
  const parsed = httpSchemas.JoinByCode.shape.code.safeParse(url.searchParams.get("invite_code"));
  return parsed.success ? parsed.data : undefined;
}
export function destination(url: URL) {
  const code = inviteCode(url);
  return code ? `/join?code=${code}` : safeReturn(url.searchParams.getAll("return_to").length === 1 ? url.searchParams.get("return_to") : null);
}
export function authPath(path: string, url: URL) {
  const code = inviteCode(url), target = destination(url);
  return code ? `${path}?invite_code=${code}` : target !== "/groups" ? `${path}?return_to=${encodeURIComponent(target)}` : path;
}
export { changedSession } from "./session-events";
export function TermsField() {
  return <div className="space-y-2">
    <input type="hidden" name="terms_version" value={ACCOUNT_TERMS_VERSION} />
    <p>Lee las <Link to="/legal/2026-09-21" target="_blank" rel="noopener noreferrer" className="underline">condiciones de uso y privacidad</Link> antes de aceptar.</p>
    <label className="flex min-h-control items-center gap-3"><input type="checkbox" name="terms_accepted" required />Acepto las condiciones de uso y privacidad</label>
  </div>;
}
export function CredentialsFields({ creating = false, profile = false }: { creating?: boolean; profile?: boolean }) {
  return <>
    <Field id="email" label="Email"><Input name="email" type="email" autoComplete={creating ? "email" : "username"} maxLength={254} required /></Field>
    {profile && <>
      <Field id="full_name" label="Nombre completo"><Input name="full_name" autoComplete="name" minLength={2} maxLength={120} required /></Field>
      <Field id="birthdate" label="Fecha de nacimiento"><Input name="birthdate" type="date" required /></Field>
      <Field id="phone" label="Teléfono (opcional)"><Input name="phone" type="tel" autoComplete="tel" placeholder="+56912345678" /></Field>
    </>}
    <Field id="password" label="Contraseña" help={creating ? "Entre 10 y 128 caracteres." : undefined}><Input name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 10 : undefined} maxLength={128} required /></Field>
    {creating && <TermsField />}
  </>;
}
export function registration(form: FormData, claim = false) {
  return { email: form.get("email"), password: form.get("password"), terms_accepted: form.get("terms_accepted") === "on", terms_version: form.get("terms_version"),
    ...(claim ? {} : { full_name: form.get("full_name"), birthdate: form.get("birthdate"), phone: form.get("phone") || undefined }) };
}
export function SocialButtons({ providers }: { providers: { google: boolean; apple: boolean } | null }) {
  const nav = useNavigation();
  return <div role="group" aria-label="Acceso con cuenta social" className="space-y-3">
    {(["google", "apple"] as const).map(provider => <Form key={provider} method="post">
      <input type="hidden" name="provider" value={provider} />
      <Button busy={nav.state !== "idle"} disabled={providers?.[provider] === false} aria-describedby={providers?.[provider] === false ? `${provider}-unavailable` : undefined}>Continuar con {SOCIAL_PROVIDER_LABELS[provider]}</Button>
      {providers?.[provider] === false && <p id={`${provider}-unavailable`}>{SOCIAL_PROVIDER_LABELS[provider]} no está disponible en este momento. Puedes usar tu email.</p>}
    </Form>)}
    {!providers && <p>No pudimos comprobar la disponibilidad del acceso social. Puedes intentarlo o usar tu email.</p>}
  </div>;
}
