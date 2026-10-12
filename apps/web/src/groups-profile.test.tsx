import { describe,it,expect,vi,beforeEach } from "vitest";
import { loader } from "./routes/group";
import { loader as settings } from "./routes/group-settings";
import { loader as visibility } from "./routes/visibility";
import { groupData } from "./group-data";
const mocked=vi.hoisted(()=>({api:{getGroup:vi.fn(),getHomeActivities:vi.fn(),getGroupBilling:vi.fn(),getMyAttendanceHistory:vi.fn(),getPendingSummary:vi.fn(),listMembershipOnboarding:vi.fn(),listManagedActivations:vi.fn()}}));
vi.mock("./api",()=>({browserApi:()=>mocked.api,requireSession:vi.fn(async()=>({user_id:"synthetic",accepted:true})),sessionError:(error:unknown)=>{throw error;},actionMessage:()=>"No disponible"}));
const id="21700000-0000-4000-8000-000000000001",request=new Request("http://localhost/groups/"+id),args={request,params:{groupId:id},context:{},url:new URL(request.url),pattern:"/groups/:groupId"};
beforeEach(()=>{vi.clearAllMocks();mocked.api.getHomeActivities.mockResolvedValue({next:null,previous:null,now:"2026-10-11T12:00:00Z"});mocked.api.getGroupBilling.mockResolvedValue({active_athletes:1,athlete_limit:10});mocked.api.getMyAttendanceHistory.mockResolvedValue({period:{from:"2026-10-01",to:"2026-10-31"},totals:{attendance_pct:77.8},records:[{note:"No debe aparecer en home"}]});mocked.api.getPendingSummary.mockResolvedValue({total:51});mocked.api.listMembershipOnboarding.mockResolvedValue({data:[]});mocked.api.listManagedActivations.mockResolvedValue({data:[]});});
describe("WEB-05 permisos y DTOs de inicio",()=>{
 for(const roles of [["ADMIN"],["COACH"],["ATHLETE"],["GUARDIAN"],["ADMIN","ATHLETE"],["ATHLETE","GUARDIAN"]])it("solicita solo secciones autorizadas para "+roles.join("+"),async()=>{
  mocked.api.getGroup.mockResolvedValue({id,name:"Club sintético",roles,access:roles.includes("ADMIN")?"admin":"member"});
  const result=await loader(args);
  expect(mocked.api.getGroupBilling).toHaveBeenCalledTimes(roles.includes("ADMIN")?1:0);
  expect(mocked.api.getPendingSummary).toHaveBeenCalledTimes(roles.includes("ADMIN")?1:0);
  expect(mocked.api.getMyAttendanceHistory).toHaveBeenCalledTimes(roles.includes("ATHLETE")?1:0);
  expect(mocked.api.listMembershipOnboarding).toHaveBeenCalledTimes(roles.includes("GUARDIAN")?1:0);
  expect(Boolean(result.personal && "records" in result.personal)).toBe(false);
  if(roles.includes("ADMIN"))expect(result.pending).toBe(51);
 });
 it("las tareas de apoderado cuentan todas las páginas",async()=>{
  mocked.api.getGroup.mockResolvedValue({id,roles:["GUARDIAN"],access:"member"});
  mocked.api.listMembershipOnboarding.mockResolvedValueOnce({data:Array.from({length:50},()=>({can_consent:true,total_count:51}))}).mockResolvedValueOnce({data:[{can_consent:true,total_count:51}]});
  expect((await loader(args)).guardianTasks?.consents).toBe(51);
 });
 it("configuración y visibilidad rechazan COACH sin enviar mutaciones",async()=>{
  mocked.api.getGroup.mockResolvedValue({id,roles:["COACH"],access:"member"});
  for(const load of [settings,visibility])await expect(load(args)).rejects.toMatchObject({status:403});
 });
 it("IDs inválidos y grupos ajenos no cargan agenda ni datos privados",async()=>{
  await expect(groupData(request,"invalid")).rejects.toMatchObject({status:404});expect(mocked.api.getGroup).not.toHaveBeenCalled();
  mocked.api.getGroup.mockRejectedValue(new Response(null,{status:404}));await expect(loader(args)).rejects.toMatchObject({status:404});expect(mocked.api.getHomeActivities).not.toHaveBeenCalled();
 });
 it("un error de transporte conserva el error, no produce totales vacíos",async()=>{
  mocked.api.getGroup.mockResolvedValue({id,roles:["ATHLETE"],access:"member"});const error=new Error("synthetic-network");mocked.api.getHomeActivities.mockRejectedValue(error);await expect(loader(args)).rejects.toBe(error);
 });
});
