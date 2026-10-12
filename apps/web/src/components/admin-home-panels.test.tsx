// @vitest-environment jsdom
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { attendanceMetrics, httpSchemas } from "@asisteam/core/browser";
import { Component } from "../routes/group";
// jsdom supplies a DOM AbortSignal while Node Request requires its native one.
// These in-memory loaders do not use transport/cancellation; E2E covers transport.
const NativeRequest = globalThis.Request;
beforeAll(()=>vi.stubGlobal("Request",class extends NativeRequest {
 constructor(input:RequestInfo|URL,init?:RequestInit){super(input,{...init,signal:undefined});}
}));
afterAll(()=>vi.unstubAllGlobals());
const uuid = (n:number)=>`17400000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const group={id:uuid(1),name:"Club de prueba",roles:["ADMIN"],access:"admin",sport:null,description:null,invite_code:"UI040174"};
const activity={id:uuid(2),group_id:group.id,activity_type_id:uuid(3),title:"Entrenamiento",description:null,location:null,starts_at:"2026-10-12T12:00:00Z",ends_at:"2026-10-12T14:00:00Z",activity_type_name:"TRAINING",activity_type_color:"#2563eb",is_system_type:true,recurrence_rule:null,recurrence_source_id:null};
const period={from:"2026-10-01",to:"2026-10-31",from_utc:"2026-10-01T03:00:00Z",until_utc:"2026-11-01T03:00:00Z"};
function data(){const metric=attendanceMetrics({present:6,late:1,absent:2,excused:1});return httpSchemas.GroupDashboard.parse({
 group_id:group.id,now:"2026-10-12T13:00:00Z",access:"admin",periods:{month:period,week:{...period,from:"2026-10-12",to:"2026-10-18"},timezone:"America/Santiago"},indicators:{active_athletes:11,week_activities:3,monthly:metric},pending:2,guardian_tasks:null,latest_announcement:null,upcoming:[activity],previous:null,today:{data:[activity],page:1,total:1},selected_activity:activity,selected_activity_id:activity.id,context:{activity_id:activity.id,phase:"started",active_athletes:11,recorded:10,unmarked:1,counts:metric,records:{data:["PRESENT","LATE","ABSENT","EXCUSED"].map((status,i)=>({id:uuid(10+i),membership_id:uuid(20+i),full_name:`Persona ${i}`,status,note:"Nota que no se muestra en preview"})),total:10,page:1}},personal:null,wards:null});}
function mount(initial=data(), load=()=>initial){
 const router=createMemoryRouter([{id:"private",loader:()=>({user_id:uuid(99)}),HydrateFallback:()=>null,children:[{path:"/groups/:groupId",loader:()=>{const dashboard=load();return {group,dashboard,agenda:{next:dashboard.upcoming[0]??null,previous:dashboard.previous},capacity:{active_athletes:11,athlete_limit:20}};},Component}]}],{initialEntries:[`/groups/${group.id}`]});
 render(<RouterProvider router={router}/>);return router;
}
afterEach(cleanup);
describe("UI-04 ADMIN",()=>{
 it("relaciona CTA/tabla/resumen con el mismo ID, cuatro estados y denominador canónico",async()=>{
  mount();await screen.findByRole("heading",{name:"Inicio"});
  expect(screen.getByRole("link",{name:"Tomar asistencia"}).getAttribute("href")).toBe(`/groups/${group.id}/activities/${activity.id}/attendance`);
  const table=screen.getByRole("table");expect(within(table).getAllByRole("row")).toHaveLength(5);
  for(const label of ["Presente","Atrasado","Ausente","Justificado"])expect(within(table).getByText(label)).toBeTruthy();
  expect(screen.getByRole("region",{name:"Registros de la actividad"}).textContent).toContain("Mostrando 4 de 10 registros");
  expect(table.textContent).not.toContain("Nota que");expect(screen.queryByText(/recientes/i)).toBeNull();
  const summary=screen.getByRole("region",{name:"Resumen de la actividad"});expect(summary.textContent).toContain("77,8 %");expect(summary.textContent).toContain("(6 + 1) / 9");expect(summary.textContent).toContain("Sin marcar: 1");
  expect(screen.getByRole("region",{name:"Indicadores del grupo"}).querySelectorAll("dt")).toHaveLength(4);
  expect(screen.getByRole("link",{name:"Más registros"}).getAttribute("href")).toContain(`activity_id=${activity.id}`);
  expect(screen.getByText("Lugar por confirmar")).toBeTruthy();
 });
 it("futura presenta preparación sin porcentaje y null permanece Sin datos",async()=>{
  const initial=data();initial.context!.phase="preparation";initial.context!.counts.attendance_pct=null;initial.context!.counts.late_rate=null;initial.indicators!.monthly=attendanceMetrics({present:0,late:0,absent:0,excused:1});
  mount(initial);await screen.findByRole("heading",{name:"Inicio"});
  const summary=screen.getByRole("region",{name:"Resumen de la actividad"});expect(summary.textContent).toContain("No hay porcentaje realizado");expect(summary.textContent).not.toContain("77,8 %");expect(screen.getByRole("region",{name:"Indicadores del grupo"}).textContent).toContain("Sin datos");
 });
 it("fallos secundarios muestran desconocido y reintento recupera sin perder la actividad",async()=>{
  const failed=data();failed.secondary_errors=["pending","latest_announcement"];failed.pending=null;
  let current=failed;mount(failed,()=>current);await screen.findByRole("button",{name:"Reintentar anuncio"});
  expect(screen.getByRole("region",{name:"Indicadores del grupo"}).textContent).toContain("No disponible");expect(screen.queryByText("No hay anuncios publicados.")).toBeNull();expect(screen.getByRole("table")).toBeTruthy();
  current=data();await userEvent.click(screen.getByRole("button",{name:"Reintentar anuncio"}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Reintentar anuncio"})).toBeNull());expect(screen.getByText("No hay anuncios publicados.")).toBeTruthy();expect(screen.getByRole("table")).toBeTruthy();
 });
 it("sin actividad concreta permite crear o ver actividades y conserva primeros pasos",async()=>{
  const initial=data();initial.upcoming=[];initial.selected_activity=null;initial.selected_activity_id=null;initial.context=null;initial.today={data:[],page:1,total:0};
  mount(initial);await screen.findByRole("heading",{name:"Inicio"});expect(screen.queryByRole("link",{name:"Tomar asistencia"})).toBeNull();expect(within(document.querySelector("header")!).getByRole("link",{name:"Crear actividad"}).getAttribute("href")).toBe(`/groups/${group.id}/activities/new`);expect(screen.getByRole("heading",{name:"Primeros pasos"})).toBeTruthy();expect(screen.queryByRole("table")).toBeNull();
  cleanup();initial.previous=activity;mount(initial);await screen.findByRole("heading",{name:"Inicio"});expect(within(document.querySelector("header")!).queryByRole("link",{name:"Crear actividad"})).toBeNull();expect(screen.getAllByRole("link",{name:"Ver actividades"}).length).toBeGreaterThan(0);expect(screen.getByRole("link",{name:"Revisar asistencia anterior"}).getAttribute("href")).toContain(activity.id);
 });
});
