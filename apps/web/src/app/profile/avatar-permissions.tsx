"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAvatarPermission, type ProfileResult } from "./actions";
export type AvatarPermission = { guardianship_id: string; full_name: string; allows_avatar: boolean };
export function AvatarPermissions({ permissions }: { permissions: AvatarPermission[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [result, setResult] = useState<ProfileResult | null>(null);
  if (!permissions.length) return null;
  return <section className="space-y-4 border-t pt-6" aria-labelledby="permissions-title">
    <h2 id="permissions-title" className="text-lg font-semibold">Fotos de mis pupilos</h2>
    <p className="text-sm">Puedes autorizar el uso de la foto de perfil para identificar a tu pupilo en sus grupos. Esta decisión actualiza la cláusula de imagen de tu consentimiento vigente y conserva su historial.</p>
    {permissions.map((permission) => <div key={permission.guardianship_id} className="space-y-2 rounded-lg border p-3">
      <p>{permission.full_name}: {permission.allows_avatar ? "imagen autorizada" : "imagen no autorizada"}</p>
      <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setResult(null);
        try { setResult(await setAvatarPermission(permission.guardianship_id, !permission.allows_avatar)); router.refresh(); }
        catch { setResult({ ok: false, message: "No pudimos guardar la decisión. Inténtalo nuevamente." }); }
        finally { setBusy(false); }
      }}>{permission.allows_avatar ? "Retirar mi autorización de imagen" : "Autorizar el uso de su foto de perfil"}</Button>
    </div>)}
    {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
  </section>;
}
