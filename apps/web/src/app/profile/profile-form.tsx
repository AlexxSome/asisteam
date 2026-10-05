"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarFileSchema, profileSchema, type OwnProfile, type ProfileInput } from "@asisteam/core";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { saveProfile, uploadAvatar, type ProfileResult } from "./actions";

type FieldErrors = Partial<Record<keyof ProfileInput, string>>;
const sameFields = (a: OwnProfile, b: OwnProfile) => a.full_name === b.full_name
  && (a.phone ?? "") === (b.phone ?? "") && (a.birthdate ?? "") === (b.birthdate ?? "");

export function ProfileForm({ profile, avatarAllowed }: { profile: OwnProfile; avatarAllowed: boolean }) {
  const router = useRouter();
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [saved, setSaved] = useState(profile);
  const [current, setCurrent] = useState(profile);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [avatarResult, setAvatarResult] = useState<ProfileResult | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const profileSubmitting = useRef(false);
  const avatarSubmitting = useRef(false);
  const profileDirty = !sameFields(current, saved);
  useUnsavedChanges(profileDirty || avatar !== null);

  useEffect(() => {
    if (!avatar) { setPreview(null); return; }
    const url = URL.createObjectURL(avatar);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  function change(field: keyof ProfileInput, value: string) {
    setCurrent(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
    setProfileResult(null);
  }
  function clearAvatar() {
    setAvatar(null);
    if (avatarInput.current) avatarInput.current.value = "";
  }

  return <div className="space-y-8">
    <section aria-labelledby="profile-data-title" className="space-y-4">
      <h2 id="profile-data-title" className="text-lg font-semibold">Datos personales</h2>
      <form className="space-y-4" aria-labelledby="profile-data-title" aria-busy={profileBusy} data-unsaved-activity="true" noValidate onSubmit={async event => {
        event.preventDefault();
        if (profileSubmitting.current) return;
        const form = event.currentTarget;
        const parsed = profileSchema.safeParse({ full_name: current.full_name, phone: current.phone?.trim() || null, birthdate: current.birthdate || null });
        setProfileResult(null);
        if (!parsed.success) {
          const nextErrors: FieldErrors = {};
          for (const issue of parsed.error.issues) nextErrors[issue.path[0] as keyof ProfileInput] ??= issue.message;
          setErrors(nextErrors);
          (form.elements.namedItem(parsed.error.issues[0]?.path[0] as string) as HTMLElement | null)?.focus();
          return;
        }
        profileSubmitting.current = true; setProfileBusy(true); setErrors({});
        try {
          const response = await saveProfile(parsed.data);
          setProfileResult(response);
          if (response.ok && response.profile) {
            setSaved(response.profile); setCurrent(response.profile); router.refresh();
          }
        } catch { setProfileResult({ ok: false, message: "No pudimos conectar. Tus cambios no se han confirmado; inténtalo otra vez." }); }
        finally { profileSubmitting.current = false; setProfileBusy(false); }
      }}>
        <Field id="email" label="Email (solo lectura)" help="Este es el email de tu cuenta. Puedes consultarlo y copiarlo; no se puede cambiar desde este formulario.">
          <Input type="email" value={profile.email ?? ""} readOnly autoComplete="email" />
        </Field>
        <Field id="full_name" label="Nombre completo" error={errors.full_name}>
          <Input name="full_name" value={current.full_name} onChange={event => change("full_name", event.target.value)} required minLength={2} maxLength={120} autoComplete="name" disabled={profileBusy} />
        </Field>
        <Field id="phone" label="Teléfono (opcional)" help="Usa el formato internacional: +56912345678. Puedes dejarlo vacío." error={errors.phone}>
          <Input name="phone" type="tel" value={current.phone ?? ""} onChange={event => change("phone", event.target.value)} autoComplete="tel" disabled={profileBusy} />
        </Field>
        <Field id="birthdate" label="Fecha de nacimiento" error={errors.birthdate}
          help="Es obligatoria para deportistas. Si la corrección cambia tu condición de menor a mayor de edad, otro ADMIN de cada grupo debe confirmarla. Mientras esperas, se conserva la fecha actual y la protección del menor.">
          <Input name="birthdate" type="date" value={current.birthdate ?? ""} onChange={event => change("birthdate", event.target.value)} autoComplete="bday" disabled={profileBusy} />
        </Field>
        {profileResult && <Alert tone={profileResult.ok ? "success" : "error"}>{profileResult.message}</Alert>}
        <p role="status" className="text-small text-muted-foreground">{profileBusy ? "Guardando tus datos personales…" : ""}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={profileBusy}>{profileBusy ? "Guardando perfil…" : "Guardar perfil"}</Button>
          <Button type="button" variant="outline" disabled={profileBusy || !profileDirty} onClick={() => {
            if (!window.confirm("¿Descartar los cambios sin guardar de tus datos personales? La foto seleccionada se conserva.")) return;
            setCurrent(saved); setErrors({}); setProfileResult(null);
          }}>Descartar cambios del perfil</Button>
        </div>
      </form>
    </section>
    <section aria-labelledby="avatar-title" className="space-y-4 border-t pt-6">
      <h2 id="avatar-title" className="text-lg font-semibold">Foto de perfil</h2>
      {profile.avatar_url && avatarAllowed && <img src={profile.avatar_url} alt="Tu foto de perfil actual" width={96} height={96} className="size-24 rounded-full object-cover" />}
      <p id="avatar-help" className="text-small text-muted-foreground">JPEG, PNG o WebP, máximo 2 MB. La foto se almacena de forma privada. Seleccionarla permite revisarla antes de subirla; Guardar perfil solo guarda tus datos personales.</p>
      {!avatarAllowed && <p id="avatar-restriction" className="text-small">Para subir una foto, registra tu fecha de nacimiento. Si eres menor, tu apoderado debe autorizar el uso de tu imagen en su consentimiento vigente. Guardar tus datos no otorga esa autorización.</p>}
      <form className="space-y-4" aria-labelledby="avatar-title" aria-busy={avatarBusy} data-unsaved-activity="true" onSubmit={async event => {
        event.preventDefault();
        if (avatarSubmitting.current || !avatar || !avatarAllowed) return;
        const data = new FormData(); data.set("avatar", avatar);
        avatarSubmitting.current = true; setAvatarBusy(true); setAvatarResult(null);
        try {
          const response = await uploadAvatar(data); setAvatarResult(response);
          if (response.ok) { clearAvatar(); router.refresh(); }
        } catch { setAvatarResult({ ok: false, message: "No pudimos subir la imagen. La selección se conserva; inténtalo nuevamente." }); }
        finally { avatarSubmitting.current = false; setAvatarBusy(false); }
      }}>
        <Field id="avatar" label="Seleccionar foto">
          <Input ref={avatarInput} name="avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={!avatarAllowed || avatarBusy}
            aria-describedby={`avatar-help${!avatarAllowed ? " avatar-restriction" : ""}${avatarResult && !avatarResult.ok ? " avatar-result" : ""}`} aria-invalid={avatarResult && !avatarResult.ok ? true : undefined}
            onChange={event => {
              const file = event.target.files?.[0]; setAvatarResult(null);
              if (!file) { clearAvatar(); return; }
              const parsed = avatarFileSchema.safeParse({ type: file.type, size: file.size });
              if (!parsed.success) { clearAvatar(); setAvatarResult({ ok: false, message: parsed.error.issues[0]?.message ?? "Selecciona una imagen válida." }); return; }
              setAvatar(file);
            }} />
        </Field>
        {preview && <figure className="space-y-2"><img src={preview} alt="Vista previa de la foto seleccionada" width={128} height={128} className="size-32 rounded-full object-cover" /><figcaption className="break-words text-small">Vista previa. Esta foto todavía no está guardada.</figcaption></figure>}
        {avatarResult && <Alert id="avatar-result" tone={avatarResult.ok ? "success" : "error"}>{avatarResult.message}</Alert>}
        <p role="status" className="text-small text-muted-foreground">{avatarBusy ? "Subiendo la foto…" : ""}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="outline" loading={avatarBusy} disabled={!avatarAllowed || !avatar}>{avatarBusy ? "Subiendo foto…" : "Subir foto"}</Button>
          {avatar && <Button type="button" variant="tertiary" disabled={avatarBusy} onClick={() => {
            if (window.confirm("¿Descartar la foto seleccionada sin subirla? Tus datos personales se conservan.")) { clearAvatar(); setAvatarResult(null); }
          }}>Descartar foto seleccionada</Button>}
        </div>
      </form>
    </section>
  </div>;
}
