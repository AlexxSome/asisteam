import { describe, expect, it } from "vitest";
import { dashboardHttpSchemas } from "./http-dashboard-contract";
import { attendanceMetrics } from "./schemas/report";
const id="17300000-0000-4000-8000-000000000001",now="2026-10-12T12:00:00Z";
const period={from:"2026-10-12",to:"2026-10-18",from_utc:now,until_utc:"2026-10-19T03:00:00Z"};
const counts=attendanceMetrics({present:0,late:0,absent:0,excused:0});
const data={group_id:id,now,access:"member",periods:{week:period,month:period,timezone:"America/Santiago"},indicators:null,pending:null,upcoming:[],previous:null,latest_announcement:null,today:{data:[],total:0,page:1},selected_activity_id:null,selected_activity:null,guardian_tasks:null,context:null,personal:null,wards:null};
describe("UI-03 contrato fail-closed",()=>{
 it("valida query acotada y rechaza actor y páginas inválidas",()=>{
  expect(dashboardHttpSchemas.DashboardQuery.parse({})).toEqual({records_page:1,day_page:1,wards_page:1});
  for(const query of [{actor:id},{records_page:0},{activity_id:"bad"},{wards_page:1000001}])expect(dashboardHttpSchemas.DashboardQuery.safeParse(query).success).toBe(false);
 });
 it("ausencia de permiso mantiene null, y no acepta PII inesperada",()=>{
  expect(dashboardHttpSchemas.GroupDashboard.parse(data).indicators).toBe(null);
  for(const extra of [{email:"private"},{phone:"private"},{birthdate:"private"}])expect(dashboardHttpSchemas.GroupDashboard.safeParse({...data,...extra}).success).toBe(false);
  expect(dashboardHttpSchemas.GroupDashboard.safeParse({...data,pending:0}).success).toBe(false);
 });
 it("COACH no admite preview ADMIN y futuro nunca tiene porcentaje realizado",()=>{
  const context={activity_id:id,phase:"preparation",active_athletes:1,recorded:0,unmarked:1,counts,records:null};
  expect(dashboardHttpSchemas.GroupDashboard.safeParse({...data,access:"coach",context}).success).toBe(true);
  expect(dashboardHttpSchemas.GroupDashboard.safeParse({...data,access:"coach",context:{...context,records:{data:[],total:0,page:1}}}).success).toBe(false);
  expect(dashboardHttpSchemas.GroupDashboard.safeParse({...data,access:"admin",context:{...context,counts:{...counts,attendance_pct:0}}}).success).toBe(false);
 });
});
