import { useState } from "react";
import { ApiClientError } from "@asisteam/api-client";
import { httpSchemas } from "@asisteam/core/browser";
import { browserApi, actionMessage } from "../api";
import { CredentialsFields, changedSession } from "../auth-context";
import { Alert, Button, ActionLink } from "../ui";
// Login in place: the QR remains in the parent's memory, never storage or a redirect URL.
export function LoginForm({onAuthenticated}:{onAuthenticated:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[needsTerms,setNeedsTerms]=useState(false);
 return <form className="space-y-4" aria-label="Iniciar sesión para registrar llegada" onSubmit={async event=>{
  event.preventDefault();if(busy)return;
  const parsed=httpSchemas.AuthLogin.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
  if(!parsed.success){setError("Revisa tu email y contraseña.");return;}
  setBusy(true);setError("");
  try{await browserApi().webLogin({body:parsed.data});changedSession();const session=await browserApi().getWebSession();if(session.accepted)onAuthenticated();else setNeedsTerms(true);}catch(error){setError(error instanceof ApiClientError && error.status===401?"Email o contraseña incorrectos":actionMessage(error));}finally{setBusy(false);}
 }}><fieldset disabled={busy} className="space-y-4"><CredentialsFields/><Button busy={busy}>Ingresar</Button></fieldset>
 {error && <Alert>{error}</Alert>}{needsTerms && <Alert tone="warning">Acepta las condiciones de uso antes de registrar tu llegada. Luego vuelve a escanear el QR actual.<ActionLink href="/accept-terms?return_to=%2Fcheck-in">Aceptar condiciones</ActionLink></Alert>}
 <ActionLink href="/login?return_to=%2Fcheck-in">Usar otro método de acceso</ActionLink><p className="text-small">Si usas otro método de acceso, vuelve a escanear el QR actual después de ingresar.</p></form>;
}
