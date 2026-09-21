"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnProfile } from "@asisteam/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfile, uploadAvatar, type ProfileResult } from "./actions";

export function ProfileForm({ profile, avatarAllowed }: { profile: OwnProfile; avatarAllowed: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(profile);

  return <div className="space-y-8">
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setResult(null);
      const form = new FormData(event.currentTarget);
      try {
        const response = await saveProfile({ full_name: String(form.get("full_name") ?? ""), phone: String(form.get("phone") ?? "").trim() || null, birthdate: String(form.get("birthdate") ?? "") || null });
        setResult(response);
        if (response.ok && response.profile) { setCurrent(response.profile); router.refresh(); }
      } catch { setResult({ ok: false, message: "No pudimos conectar. Tus cambios no se han confirmado; inténtalo otra vez." }); }
      finally { setBusy(false); }
    }}>
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={profile.email ?? ""} readOnly aria-describedby="email-note" /><p id="email-note" className="text-sm text-muted-foreground">El email no se puede cambiar en esta versión.</p></div>
      <div className="space-y-2"><Label htmlFor="full_name">Nombre completo</Label><Input id="full_name" name="full_name" value={current.full_name} onChange={(e) => setCurrent({ ...current, full_name: e.target.value })} required minLength={2} maxLength={120} autoComplete="name" /></div>
      <div className="space-y-2"><Label htmlFor="phone">Teléfono (opcional)</Label><Input id="phone" name="phone" type="tel" value={current.phone ?? ""} onChange={(e) => setCurrent({ ...current, phone: e.target.value })} autoComplete="tel" placeholder="+56912345678" /></div>
      <div className="space-y-2"><Label htmlFor="birthdate">Fecha de nacimiento</Label><Input id="birthdate" name="birthdate" type="date" value={current.birthdate ?? ""} onChange={(e) => setCurrent({ ...current, birthdate: e.target.value })} aria-describedby="birthdate-note" /><p id="birthdate-note" className="text-sm text-muted-foreground">Si eres deportista menor y la corrección te hace mayor de edad, solicitaremos confirmación de otro ADMIN de cada grupo. La fecha no cambiará hasta recibirlas todas.</p></div>
      <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</Button>
    </form>
    <section aria-labelledby="avatar-title" className="space-y-3 border-t pt-6">
      <h2 id="avatar-title" className="text-lg font-semibold">Foto de perfil</h2>
      {profile.avatar_url && avatarAllowed && <img src={profile.avatar_url} alt="Tu foto de perfil" width={96} height={96} className="size-24 rounded-full object-cover" />}
      <p className="text-sm text-muted-foreground">JPEG, PNG o WebP, máximo 2 MB. La foto se guarda de forma privada.</p>
      {!avatarAllowed && <p className="text-sm">Para subir una foto, registra tu fecha de nacimiento. Si eres menor, tu apoderado debe autorizar el uso de imágenes en su consentimiento vigente.</p>}
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setResult(null);
        try { const response = await uploadAvatar(data); setResult(response); if (response.ok) { form.reset(); router.refresh(); } }
        catch { setResult({ ok: false, message: "No pudimos subir la imagen. Inténtalo nuevamente." }); }
        finally { setBusy(false); }
      }}>
        <Label htmlFor="avatar">Seleccionar foto</Label><Input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required disabled={!avatarAllowed || busy} />
        <Button type="submit" variant="outline" disabled={!avatarAllowed || busy}>Subir foto</Button>
      </form>
    </section>
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm" : "text-sm text-destructive"}>{result.message}</p>}
  </div>;
}
