// WEB-05: preserves the existing presentation with Router/HTTP adapters.

import { useEffect, useState } from "react";
import { useRouter } from "../navigation";
import { GROUP_STATS_PRIVACY_NOTICE, GROUP_VISIBILITY_LABELS, type GroupSettings } from "@asisteam/core/browser";
import { updateGroupSettings } from "../mutations";

export function VisibilityForm({ groupId, initialSettings }: { groupId: string; initialSettings: GroupSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSettings(initialSettings); }, [initialSettings.athletes_can_view_group_stats, initialSettings.guardians_can_view_group_stats]);

  async function change(key: keyof GroupSettings, value: boolean) {
    setPending(true); setError(null); setSaved(false);
    try {
      const result = await updateGroupSettings(groupId, { [key]: value });
      if ("error" in result) setError(result.error.message);
      else {
        setSettings(result.settings); setSaved(true); router.refresh();
      }
    } catch {
      setError("No pudimos confirmar el cambio. Actualiza la página antes de volver a intentarlo.");
    } finally { setPending(false); }
  }
  return <section className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6" aria-label="Opciones de visibilidad" aria-busy={pending}>
    <h2 className="text-h2">Estadísticas compartidas</h2>
    <p>Ambas opciones están desactivadas al crear el grupo. Cada cambio se guarda de inmediato.</p>
    {(Object.keys(GROUP_VISIBILITY_LABELS) as (keyof GroupSettings)[]).map((key) => <label key={key} className="flex min-h-11 items-center gap-3">
      <input type="checkbox" role="switch" checked={settings[key]} disabled={pending} onChange={(event) => void change(key, event.currentTarget.checked)} aria-describedby="privacy-notice" className="size-5 shrink-0" />
      {GROUP_VISIBILITY_LABELS[key]}
    </label>)}
    <section aria-label="Vista previa de permisos" className="space-y-3 rounded-lg border border-border bg-background p-4">
      <h3 className="text-h3">Vista previa de permisos</h3>
      <dl className="space-y-3 text-small">
        <div><dt className="font-medium">Deportistas</dt><dd>{settings.athletes_can_view_group_stats ? "Pueden consultar nombres y métricas agregadas del grupo." : "Las estadísticas agregadas del grupo están ocultas."} Siempre conservan su asistencia e historial propios.</dd></div>
        <div><dt className="font-medium">Apoderados</dt><dd>{settings.guardians_can_view_group_stats ? "Pueden consultar nombres y métricas agregadas del grupo." : "Las estadísticas agregadas del grupo están ocultas."} Siempre conservan la consulta de sus pupilos vigentes.</dd></div>
      </dl>
      <p className="text-small text-muted-foreground">Esta vista describe los permisos confirmados. Las notas, contactos y registros por actividad de terceros permanecen privados.</p>
    </section>
    <p id="privacy-notice" className="rounded-md bg-muted p-4 text-sm">{GROUP_STATS_PRIVACY_NOTICE}</p>
    <p role="status" aria-live="polite">{pending ? "Guardando visibilidad…" : saved ? "Visibilidad guardada. El cambio ya está disponible en Reportes." : ""}</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
