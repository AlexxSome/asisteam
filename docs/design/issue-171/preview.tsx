import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { reportAttendanceClass, attendanceStatusClasses } from "@/lib/attendance-presentation";
import { ATTENDANCE_STATUS_LABELS, reportPercentage, attendanceMetrics } from "@asisteam/core";

export const variants = ["ready", "loading", "empty", "no-data", "error", "long-name", "no-logo"] as const;
type Variant = typeof variants[number];
// The library is deliberately local to the design specimen until UI-02 adopts it.
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  calendar: "M5 3v4m14-4v4M3 9h18M3 5h18v16H3Z",
  people: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 10v-3a6 6 0 0 1 12 0v3m3-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v2",
  check: "m5 12 4 4L19 6M3 3h18v18H3Z",
  report: "M5 20V10m7 10V4m7 16v-7",
  notice: "M4 9h5l11-5v16L9 15H4Zm3 6 2 6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
};
function Icon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" focusable="false" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
function SampleLink({ children, href = "#activity", icon }: { children: React.ReactNode; href?: string; icon?: keyof typeof paths }) {
  return <a className="sample-link" href={href} aria-current={href === "#content" ? "page" : undefined}>{icon && <Icon name={icon} />}{children}</a>;
}
function Panel({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return <Card id={id} className="space-y-4 p-4 md:p-6"><CardTitle>{title}</CardTitle>{children}</Card>;
}
export function Preview({ variant = "ready" }: { variant?: Variant }) {
  const long = variant === "long-name";
  const name = long ? "Club de entrenamiento y preparación deportiva de la comunidad de Santiago con nombre extraordinariamente largo" : "Club de ejemplo sintético";
  const noData = variant === "no-data";
  const metric = attendanceMetrics(noData ? { present: 0, late: 0, absent: 0, excused: 0 } : { present: 6, late: 1, absent: 2, excused: 1 });
  return <div className="specimen">
    <a className="skip" href="#content">Saltar al contenido</a>
    <aside className="sidebar" aria-label="Contexto y navegación de la propuesta">
      <p className="text-h1">Asisteam</p>
      <label htmlFor="group" className="block">Grupo de demostración</label>
      <select id="group" className="min-h-control w-full rounded-md border px-3 py-2"><option>{name}</option></select>
      <p className="text-small text-neutral">{variant === "no-logo" ? "Sin logo · iniciales CL" : "CL · identidad textual del grupo"} · Administrador</p>
      <nav aria-label="Este grupo" className="space-y-1">
        <SampleLink href="#content" icon="home">Inicio</SampleLink>
        <SampleLink href="#activities" icon="calendar">Actividades</SampleLink>
        <details open><summary>Asistencia y consulta</summary><SampleLink href="#records" icon="report">Reportes</SampleLink><SampleLink href="#notice" icon="notice">Anuncios</SampleLink></details>
        <details open><summary>Integrantes</summary><SampleLink href="#tasks" icon="people">Aprobaciones</SampleLink></details>
        <details><summary>Gestión</summary><SampleLink href="#scope" icon="settings">Configuración del grupo</SampleLink></details>
      </nav>
      <p className="border-t pt-4 text-small text-neutral">Espacio personal</p>
      <SampleLink href="#scope">Mis grupos</SampleLink>
    </aside>
    <div className="workspace">
      <header className="topbar"><p className="min-w-0 break-words text-small">Mis grupos / {name}</p><a className="sample-link shrink-0" href="#scope">Mi cuenta</a></header>
      <details className="mobile-menu"><summary>Menú y grupo</summary><p className="break-words p-3">{name} · Administrador</p><nav aria-label="Navegación móvil de la propuesta"><SampleLink href="#activities">Actividades</SampleLink><SampleLink href="#tasks">Aprobaciones</SampleLink><SampleLink href="#records">Reportes</SampleLink><SampleLink href="#notice">Anuncios</SampleLink></nav></details>
      <main id="content" tabIndex={-1}>
        <Alert tone="info" role="note">Propuesta UI-01 · datos sintéticos · acciones sin conexión al producto.</Alert>
        <div className="heading"><PageHeader title="Inicio del grupo" description="Martes, 6 de octubre de 2026 · Horarios de Chile" /><a className="sample-primary" href="#activity"><Icon name="check" />Tomar asistencia</a></div>
        <nav className="variants" aria-label="Estados de la propuesta">{variants.map(item => <a key={item} href={`${item}.html`} aria-current={item === variant ? "page" : undefined}>{({ ready: "Con datos", loading: "Cargando", empty: "Vacío", "no-data": "Sin datos", error: "Error", "long-name": "Nombre largo", "no-logo": "Sin logo" })[item]}</a>)}</nav>
        {variant === "loading" ? <LoadingState label="Cargando resumen del grupo…" /> : variant === "error" ? <div className="space-y-4"><Alert>No pudimos cargar el resumen. Los valores anteriores no se muestran como actuales.</Alert><a className="sample-primary" href="ready.html">Volver a intentar (demostración)</a></div> : variant === "empty" ? <EmptyState title="Todavía no hay actividades" action={<Button disabled>Crear actividad · muestra</Button>}>Cuando el grupo tenga actividades, aparecerán aquí. No hay registros ni porcentajes que consultar.</EmptyState> : <>
          <div className="dashboard">
            <section className="activities" id="activities"><Panel title="Próximas actividades">{[
              ["8 OCT", long ? "Entrenamiento con nombreExtensoSinSeparaciónQueDebeAjustarseDentroDeLaTarjetaSinOcultarSuAcción" : "Entrenamiento", "18:00–19:30 · Pista de ejemplo"],
              ["10 OCT", "Competencia", "09:00–11:00 · Recinto de ejemplo"],
            ].map(([date, title, detail]) => <article key={date} className="activity-row"><div className="date-tile">{date}</div><div className="min-w-0"><h3>{title}</h3><p className="text-small text-neutral">{detail}</p><p className="text-caption text-neutral">Futura · sin resultado de asistencia</p></div><SampleLink href="#scope">Ver detalle</SampleLink></article>)}</Panel></section>
            <section className="tasks" id="tasks"><Panel title="Pendientes del grupo"><Alert tone="warning" role="note">2 incorporaciones por revisar. Verifica apoderado y consentimiento antes de activar a menores.</Alert><SampleLink href="#scope">Revisar aprobaciones</SampleLink></Panel></section>
          <section className="indicators" aria-label="Indicadores del grupo sintético">{[
            ["Deportistas activos", "10", "En este grupo", "people"],
            ["Actividades", "3", "Semana del 5 al 11 de octubre", "calendar"],
            ["Asistencia del mes", reportPercentage(metric.attendance_pct), "Octubre · total ponderado", "report"],
            ["Por aprobar", "2", "Incorporaciones pendientes", "people"],
          ].map(([label, value, detail, icon]) => <Card key={label} className="flex min-w-0 items-start gap-3 p-4"><span className="rounded-md bg-info-subtle p-3 text-info"><Icon name={icon as keyof typeof paths} /></span><div className="min-w-0"><h2 className="text-small">{label}</h2><p className={`text-display ${label === "Asistencia del mes" ? reportAttendanceClass(metric.attendance_pct) : ""}`}>{value}</p><p className="text-small text-neutral">{detail}</p></div></Card>)}</section>
            <section className="context" id="activity"><Panel title="Actividad realizada seleccionada"><h3>Entrenamiento · 5 oct, 18:00</h3><p className={`text-display ${reportAttendanceClass(metric.attendance_pct)}`}>{reportPercentage(metric.attendance_pct)}</p><p className="text-small text-neutral">{noData ? "Sin convocatorias computables. El denominador es cero." : "10 registros · (6 + 1) / 9 · Justificados no penalizan."}</p><dl className="space-y-2">{(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((status, i) => <div key={status} className="flex justify-between gap-3"><dt><Badge className={attendanceStatusClasses[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Badge></dt><dd>{noData ? "0" : [6, 1, 2, 1][i]}</dd></div>)}</dl><Button disabled className="w-full">Tomar asistencia · muestra</Button></Panel></section>
            <section className="records" id="records"><Panel title="Registros de la actividad seleccionada"><p className="text-small text-neutral">Tabla ADMIN · muestra de 4 de 10 registros. Desplaza la tabla si lo necesitas.</p><div className="table-region" role="region" aria-label="Registros sintéticos" tabIndex={0}><table><caption className="sr-only">Registros del entrenamiento del 5 de octubre · datos sintéticos</caption><thead><tr><th scope="col">Deportista</th><th scope="col">Actividad</th><th scope="col">Estado</th></tr></thead><tbody>{!noData && (["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((status, i) => <tr key={status}><th scope="row">{long ? `Deportista sintético ${i + 1} con nombre y apellidos muy extensos` : `Deportista sintético ${i + 1}`}</th><td>Entrenamiento</td><td><Badge className={attendanceStatusClasses[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Badge></td></tr>)}</tbody></table></div>{noData && <p>Sin registros para esta actividad.</p>}</Panel></section>
            <section className="notice" id="notice"><Panel title="Último anuncio"><h3 className="flex items-center gap-2"><Icon name="notice" />Entrenamiento del jueves</h3><p className="text-small text-neutral">Nos reuniremos a las 18:00 en la pista de ejemplo.</p><SampleLink href="#scope">Ver anuncios</SampleLink></Panel></section>
          </div>
        </>}
        <p id="scope" className="text-small text-neutral">Esta muestra fija composición y estados. UI-02…UI-05 conectarán las rutas y DTO autorizados. No contiene sesiones, personas reales, logos inventados ni valores fallback de producción.</p>
      </main>
    </div>
  </div>;
}
