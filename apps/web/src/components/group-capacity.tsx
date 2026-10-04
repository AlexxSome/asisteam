import Link from "next/link";
import { SUBSCRIPTION_CAPACITY_MESSAGES, type GroupCapacity } from "@asisteam/core";
import { ActionLink } from "@/components/ui/button";

/** Only rendered by a server-verified ADMIN route. No invoice data reaches this component. */
export function GroupCapacityNotice({ groupId, capacity }: { groupId: string; capacity: GroupCapacity | null }) {
  if (capacity && (capacity.athlete_limit === null || capacity.active_athletes < capacity.athlete_limit)) return null;
  const firstPayment = capacity?.athlete_limit === 0;
  return <section aria-label="Cupos de deportistas" className="space-y-3 rounded-lg border border-border bg-warning-subtle p-4 text-foreground">
    <h2 className="text-lg font-semibold">{!capacity ? "No pudimos comprobar los cupos" : firstPayment ? "Activa los cupos de tu grupo" : "Cupos de deportistas completos"}</h2>
    <p>{!capacity ? "Revisa la suscripción o recarga la página antes de incorporar deportistas. Puedes continuar la configuración."
      : firstPayment ? "0 cupos habilitados. Puedes configurar el grupo y crear actividades. Para activar deportistas, incluido tu propio rol de deportista, necesitas el primer pago aprobado de un plan mensual. No hay prueba gratuita."
      : `${capacity.active_athletes.toLocaleString("es-CL")} deportistas activos de ${capacity.athlete_limit!.toLocaleString("es-CL")} cupos habilitados. Revisa el plan antes de incorporar o reactivar deportistas. Los integrantes actuales y su historial se conservan.`}</p>
    {firstPayment && <p className="text-sm">Volver de Mercado Pago no confirma el pago. Los cupos se habilitan cuando el servidor verifica su aprobación.</p>}
    <ActionLink href={`/groups/${groupId}/billing`}>Revisar suscripción</ActionLink>
  </section>;
}

/** groupId is supplied only by an ADMIN surface; other roles receive no billing link. */
export function CapacityError({ error, groupId }: { error: { code?: string; message: string }; groupId?: string }) {
  const capacityError = error.code === "subscription_athlete_limit";
  return <div role="alert" className="space-y-2 text-destructive">
    <p>{capacityError ? SUBSCRIPTION_CAPACITY_MESSAGES[groupId ? "admin" : "member"] : error.message}</p>
    {capacityError && groupId && <Link href={`/groups/${groupId}/billing`} className="inline-flex min-h-11 items-center underline">Gestionar plan</Link>}
  </div>;
}
