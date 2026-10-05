"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setAvatarPermission, type ProfileResult } from "./actions";
export type AvatarPermission = { guardianship_id: string; full_name: string; allows_avatar: boolean };

function AvatarPermissionRow({ permission }: { permission: AvatarPermission }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [allowed, setAllowed] = useState(permission.allows_avatar);
  const submitting = useRef(false);
  useEffect(() => setAllowed(permission.allows_avatar), [permission.allows_avatar]);
  return <div className="space-y-3 rounded-lg border p-4" role="group" aria-label={`Permiso de imagen de ${permission.full_name}`} aria-busy={busy}>
    <p className="break-words">{permission.full_name}: {allowed ? "imagen autorizada" : "imagen no autorizada"}</p>
    <Button variant="outline" loading={busy} onClick={async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); setResult(null);
      try {
        const response = await setAvatarPermission(permission.guardianship_id, !allowed);
        setResult(response);
        if (response.ok) { setAllowed(!allowed); router.refresh(); }
      } catch { setResult({ ok: false, message: "No pudimos guardar la decisión. Inténtalo nuevamente." }); }
      finally { submitting.current = false; setBusy(false); }
    }}>{busy ? "Guardando permiso…" : allowed ? "Retirar mi autorización de imagen" : "Autorizar el uso de su foto de perfil"}</Button>
    {result && <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert>}
    <p role="status" className="text-small text-muted-foreground">{busy ? "Guardando la decisión para este pupilo…" : ""}</p>
  </div>;
}

export function AvatarPermissions({ permissions }: { permissions: AvatarPermission[] }) {
  if (!permissions.length) return null;
  return <section className="space-y-4 border-t pt-6" aria-labelledby="permissions-title">
    <h2 id="permissions-title" className="text-lg font-semibold">Fotos de mis pupilos</h2>
    <p className="text-small">Cada autorización es opcional y se aplica solo al pupilo indicado. Permite usar su foto de perfil para identificarlo en sus grupos y actualiza la cláusula de imagen de tu consentimiento vigente, conservando el historial.</p>
    <p className="text-small text-muted-foreground">Retirar tu permiso de imagen no revoca el consentimiento de tratamiento de datos. Si otro apoderado mantiene una autorización de imagen vigente, la foto puede seguir disponible.</p>
    {permissions.map(permission => <AvatarPermissionRow key={permission.guardianship_id} permission={permission} />)}
  </section>;
}
