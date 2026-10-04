import Link from "next/link";
import type { GroupCapacity } from "@asisteam/core";

export function GettingStarted({ groupId, capacity, hasActivities }: {
  groupId: string; capacity: GroupCapacity | null; hasActivities: boolean | null;
}) {
  const capacityReady = capacity !== null && (capacity.athlete_limit === null || capacity.athlete_limit > 0);
  const steps = [
    { title: "Configurar el grupo", ready: true, detail: "Grupo creado. Puedes completar los datos opcionales cuando quieras.", href: "settings", action: "Continuar configuración" },
    { title: "Revisar suscripción", ready: capacityReady, detail: !capacity ? "No pudimos comprobar los cupos. Revisa la suscripción."
      : capacityReady ? "El grupo ya tiene capacidad habilitada. Revisa sus cupos antes de nuevas altas." : "El primer pago aprobado habilita los cupos de deportistas.", href: "billing", action: "Ver suscripción" },
    { title: "Incorporar integrantes", ready: !!capacity && capacity.active_athletes > 0, detail: capacity?.active_athletes ? `${capacity.active_athletes.toLocaleString("es-CL")} deportistas activos.`
      : "Invita o registra deportistas. Los menores también requieren apoderado y consentimiento.", href: "members", action: "Gestionar integrantes" },
    { title: "Crear una actividad", ready: hasActivities === true, detail: hasActivities === null ? "No pudimos comprobar las actividades. Puedes revisarlas."
      : hasActivities ? "Ya tienes actividades creadas." : "Prepara tu primer entrenamiento; puedes hacerlo mientras se confirma el pago.", href: hasActivities === false ? "activities/new" : "activities", action: hasActivities === false ? "Crear primera actividad" : "Ver actividades" },
  ];
  const completed = steps.filter(step => step.ready).length;
  if (completed === steps.length) return null;
  return <section aria-labelledby="getting-started-heading" className="space-y-4 rounded-lg border p-4 sm:p-5">
    <div><h2 id="getting-started-heading" className="text-xl font-semibold">Primeros pasos</h2>
      <p className="text-sm text-muted-foreground">{completed} de 4 pasos listos. Puedes avanzar a tu ritmo.</p></div>
    <ol className="grid gap-3 sm:grid-cols-2">{steps.map((step, index) => <li key={step.href} className="min-w-0 space-y-2 rounded-md border p-3">
      <h3 className="font-semibold">{index + 1}. {step.title}</h3>
      <p className="text-sm font-medium">{step.ready ? "Listo" : "Por completar"}</p>
      <p className="text-sm text-muted-foreground">{step.detail}</p>
      <Link href={`/groups/${groupId}/${step.href}`} className="inline-flex min-h-11 items-center text-sm underline">{step.action}</Link>
    </li>)}</ol>
  </section>;
}
