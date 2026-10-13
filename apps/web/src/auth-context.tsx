import {useEffect,useRef,useState} from "react";
import { Form, Link, useNavigation } from "react-router";
import { ACCOUNT_TERMS_VERSION, httpSchemas, SOCIAL_PROVIDER_LABELS } from "@asisteam/core/browser";
import { Button, Field, Input } from "./ui";
import {PasswordInput} from "./components/ui/password-input";
import { safeReturn } from "./api";

export function inviteCode(url: URL) {
  if (url.searchParams.getAll("invite_code").length !== 1) return undefined;
  const parsed = httpSchemas.JoinByCode.shape.code.safeParse(url.searchParams.get("invite_code"));
  return parsed.success ? parsed.data : undefined;
}
export function destination(url: URL) {
  const code = inviteCode(url);
  return code ? `/join?code=${code}` : url.searchParams.has("return_to") ? safeReturn(url.searchParams.getAll("return_to").length === 1 ? url.searchParams.get("return_to") : null) : "/";
}
export function authPath(path: string, url: URL) {
  const code = inviteCode(url), target = destination(url);
  return code ? `${path}?invite_code=${code}` : target !== "/groups" && target !== "/" ? `${path}?return_to=${encodeURIComponent(target)}` : path;
}
export { changedSession } from "./session-events";
export function TermsField({legalLink=true}:{legalLink?:boolean}={}) {
  const [invalid,setInvalid]=useState(false),nav=useNavigation();
  return <div className="space-y-2">
    <input type="hidden" name="terms_version" value={ACCOUNT_TERMS_VERSION} />
    {legalLink && <p>Lee las <Link to="/legal/2026-09-21" target="_blank" rel="noopener noreferrer" className="underline">condiciones de uso y privacidad</Link> antes de aceptar.</p>}
    <label className="flex min-h-control items-center gap-3"><input id="terms_accepted" type="checkbox" name="terms_accepted" required disabled={nav.state!=="idle"} aria-invalid={invalid||undefined} aria-describedby={invalid?"terms_accepted-error":undefined} onInvalid={event=>{const first=Array.from(event.currentTarget.form?.elements??[]).find(control=>"validity" in control&&!(control as HTMLInputElement).validity.valid) as HTMLInputElement|undefined;first?.focus();setInvalid(true);}} onChange={()=>setInvalid(false)}/>Acepto las condiciones de uso y privacidad</label>{invalid && <p id="terms_accepted-error" role="alert">Debes aceptar las condiciones de uso y privacidad.</p>}
  </div>;
}
export function CredentialsFields({ creating = false, profile = false }: { creating?: boolean; profile?: boolean }) {
  const [errors,setErrors]=useState<Record<string,string>>({});
  const validation=(field:string)=>({onInvalid:(event:React.InvalidEvent<HTMLInputElement>)=>{const first=Array.from(event.currentTarget.form?.elements??[]).find(control=>"validity" in control&&!(control as HTMLInputElement).validity.valid) as HTMLInputElement|undefined;first?.focus();setErrors(current=>({...current,[field]:"Revisa este campo antes de continuar."}));},onChange:()=>setErrors(current=>({...current,[field]:""}))});
  return <>
    <Field id="email" label="Email" error={errors.email}><Input {...validation("email")} name="email" type="email" autoComplete={creating ? "email" : "username"} maxLength={254} required /></Field>
    {profile && <>
      <Field id="full_name" label="Nombre completo" error={errors.full_name}><Input {...validation("full_name")} name="full_name" autoComplete="name" minLength={2} maxLength={120} required /></Field>
      <Field id="birthdate" label="Fecha de nacimiento" error={errors.birthdate}><Input {...validation("birthdate")} name="birthdate" type="date" required /></Field>
      <Field id="phone" label="Teléfono (opcional)"><Input name="phone" type="tel" autoComplete="tel" placeholder="+56912345678" /></Field>
    </>}
    <Field id="password" label="Contraseña" error={errors.password} help={creating ? "Entre 10 y 128 caracteres." : undefined}><PasswordInput {...validation("password")} name="password" autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 10 : undefined} maxLength={128} required /></Field>
    {creating && <TermsField />}
  </>;
}
export function registration(form: FormData, claim = false) {
  return { email: form.get("email"), password: form.get("password"), terms_accepted: form.get("terms_accepted") === "on", terms_version: form.get("terms_version"),
    ...(claim ? {} : { full_name: form.get("full_name"), birthdate: form.get("birthdate"), phone: form.get("phone") || undefined }) };
}
export function SocialButtons({ providers, linking = false }: { providers: { google: boolean; apple: boolean } | null; linking?: boolean }) {
  const nav = useNavigation();
  return <div role="group" aria-label={linking ? "Vincular cuenta social" : "Acceso con cuenta social"} className="space-y-3">
    {(["google", "apple"] as const).map(provider => <SubmissionForm key={provider} method="post">
      <input type="hidden" name="provider" value={provider} />
      <Button variant="secondary" className="w-full" busy={nav.state !== "idle"} disabled={providers?.[provider] === false} aria-describedby={providers?.[provider] === false ? `${provider}-unavailable` : undefined}>{linking ? "Vincular" : "Continuar con"} {SOCIAL_PROVIDER_LABELS[provider]}</Button>
      {providers?.[provider] === false && <p id={`${provider}-unavailable`}>{SOCIAL_PROVIDER_LABELS[provider]} no está disponible en este momento. Puedes usar tu email.</p>}
    </SubmissionForm>)}
    {!providers && <p>No pudimos comprobar la disponibilidad del acceso social. Puedes intentarlo o usar tu email.</p>}
  </div>;
}

export function SubmissionForm({onSubmit,...props}:React.ComponentProps<typeof Form>){
 const navigation=useNavigation(),pending=useRef(false);
 useEffect(()=>{if(navigation.state==="idle")pending.current=false;},[navigation.state]);
 return <Form {...props} onSubmit={event=>{if(pending.current||navigation.state!=="idle"){event.preventDefault();return;}onSubmit?.(event);if(!event.defaultPrevented)pending.current=true;}}/>;
}
export function useFieldValidation(){
 const [errors,setErrors]=useState<Record<string,string>>({});
 const validation=(name:string)=>({onInvalid:(event:React.InvalidEvent<HTMLInputElement>)=>{const first=Array.from(event.currentTarget.form?.elements??[]).find(control=>"validity" in control&&!(control as HTMLInputElement).validity.valid) as HTMLInputElement|undefined;first?.focus();setErrors(current=>({...current,[name]:"Revisa este campo antes de continuar."}));},onChange:()=>setErrors(current=>({...current,[name]:""}))});
 return {errors,validation};
}
