import { beforeEach,describe,expect,it,vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
import { loader as members } from "./routes/members";
import { loader as pending } from "./routes/members-pending";
import { loader as consent } from "./routes/members-consent";
import { loader as guardians } from "./routes/guardians";
import { loader as invitations } from "./routes/invitations-admin";
import { createManagedMember,createGuardianship,changeMemberStatus,reviewMembership,consentManagedMember,reviewManagedActivation,sendInvitation,requestManagedActivation } from "./member-mutations";
const mocked=vi.hoisted(()=>({api:{getGroup:vi.fn(),listGroupMembers:vi.fn(),listMembershipOnboarding:vi.fn(),listManagedActivations:vi.fn(),listGuardianshipAthletes:vi.fn(),listInvitations:vi.fn(),createManagedMember:vi.fn(),createGuardianship:vi.fn(),sendInvitation:vi.fn(),deactivateMembership:vi.fn(),reactivateMembership:vi.fn(),approveMembership:vi.fn(),rejectMembership:vi.fn(),consentMembershipData:vi.fn(),reviewManagedActivation:vi.fn(),requestManagedActivation:vi.fn()}}));
vi.mock("./api",()=>({browserApi:()=>mocked.api,requireSession:vi.fn(async()=>({user_id:"synthetic",accepted:true})),sessionError:(error:unknown)=>{throw error;}}));
const groupId="21800000-0000-4000-8000-000000000001",membershipId="21800000-0000-4000-8000-000000000002",guardianId="21800000-0000-4000-8000-000000000003";
const identity={group_id:groupId,membership_id:membershipId};
const args=(query="")=>{const request=new Request(`http://localhost/groups/${groupId}/members${query}`);return {request,params:{groupId},context:{},url:new URL(request.url),pattern:"/groups/:groupId/members"};};
const minor={full_name:"Menor sintético",birthdate:"2014-01-01",email:"",guardian:{full_name:"Apoderado sintético",email:"guardian@example.test",relationship:"Tutor",authorized:true}};
beforeEach(()=>{vi.resetAllMocks();mocked.api.getGroup.mockResolvedValue({id:groupId,name:"Club sintético",roles:["ADMIN"],access:"admin"});mocked.api.listGroupMembers.mockResolvedValue({data:[],total:51});mocked.api.listMembershipOnboarding.mockResolvedValue({data:[]});mocked.api.listManagedActivations.mockResolvedValue({data:[]});mocked.api.listInvitations.mockResolvedValue({data:[],total:11});});
describe("WEB-06 contratos de lectura y permisos",()=>{
 for(const roles of [["ATHLETE"],["GUARDIAN"],["COACH"]])it("rechaza gestión para "+roles,async()=>{
  mocked.api.getGroup.mockResolvedValue({id:groupId,roles,access:"member"});
  for(const load of [members,pending,guardians,invitations])await expect(load(args())).rejects.toMatchObject({status:403});
  expect(mocked.api.listGroupMembers).not.toHaveBeenCalled();expect(mocked.api.listInvitations).not.toHaveBeenCalled();
 });
 it("conserva total de página vacía, filtros y búsqueda literal",async()=>{
  const result=await members(args("?page=3&role=COACH&status=INACTIVE&search=%25"));expect(result.total).toBe(51);expect(result.members).toEqual([]);
  expect(mocked.api.listGroupMembers).toHaveBeenCalledWith({params:{groupId},query:{page:3,role:"COACH",status:"INACTIVE",search:"%"}});
 });
 it("filtrado inválido no solicita nómina",async()=>{expect((await members(args("?role=SUPERADMIN"))).invalid).toBe(true);expect(mocked.api.listGroupMembers).not.toHaveBeenCalled();});
 it("grupo ajeno no carga contactos, invitaciones ni menores",async()=>{mocked.api.getGroup.mockRejectedValue(new ApiClientError(404,"group_not_found"));for(const load of [members,pending,guardians,invitations])await expect(load(args())).rejects.toMatchObject({status:404});expect(mocked.api.listGroupMembers).not.toHaveBeenCalled();});
 it("consentimientos requieren GUARDIAN incluso siendo ADMIN",async()=>{await expect(consent(args())).rejects.toMatchObject({status:403});expect(mocked.api.listManagedActivations).not.toHaveBeenCalled();});
 it("pupilo concreto ausente conserva 404 y as_guardian",async()=>{
  mocked.api.getGroup.mockResolvedValue({id:groupId,roles:["GUARDIAN"],access:"member"});await expect(consent(args("?athlete="+guardianId))).rejects.toMatchObject({status:404});expect(mocked.api.listMembershipOnboarding).toHaveBeenCalledWith({query:{group_id:groupId,athlete_user_id:guardianId,as_guardian:true,page:1}});
 });
 it("fallo de transporte no se transforma en nómina vacía",async()=>{const error=new ApiClientError(503,"service_unavailable");mocked.api.listGroupMembers.mockRejectedValue(error);await expect(members(args())).rejects.toBe(error);});
});
describe("WEB-06 escritura una vez y recuperación parcial",()=>{
 it("alta confirmada PENDING conserva ID cuando email falla",async()=>{mocked.api.createManagedMember.mockResolvedValue({membership_id:membershipId,membership_status:"PENDING"});mocked.api.sendInvitation.mockRejectedValue(new ApiClientError(503,"email_delivery_failed"));expect(await createManagedMember(groupId,minor)).toEqual({member:{membership_id:membershipId,membership_status:"PENDING"},guardianInvitation:"retry_required"});expect(mocked.api.createManagedMember).toHaveBeenCalledTimes(1);});
 it("no envía correo ni repite alta ante respuesta incierta",async()=>{mocked.api.createManagedMember.mockRejectedValue(new ApiClientError(504,"request_timeout"));const result=await createManagedMember(groupId,minor);expect(result).toMatchObject({error:{code:"request_timeout",message:expect.stringContaining("comprueba el estado")}});expect(mocked.api.createManagedMember).toHaveBeenCalledTimes(1);expect(mocked.api.sendInvitation).not.toHaveBeenCalled();});
 it("vínculo confirmado no se registra dos veces ante fallo de email",async()=>{mocked.api.createGuardianship.mockResolvedValue({guardianship_id:guardianId});mocked.api.sendInvitation.mockRejectedValue(new ApiClientError(503,"service_unavailable"));expect(await createGuardianship(groupId,{athlete_user_id:membershipId,full_name:"Tutor sintético",email:"guardian@example.test",relationship:"Tutor"})).toEqual({guardianshipId:guardianId,invitation:"retry_required"});expect(mocked.api.createGuardianship).toHaveBeenCalledTimes(1);});
 for(const [code,status] of [["LAST_ADMIN",409],["guardian_has_active_wards",422],["minor_requires_guardian_consent",422]] as const)it("preserva error de dominio "+code,async()=>{mocked.api.deactivateMembership.mockRejectedValue(new ApiClientError(status,code));expect(await changeMemberStatus({...identity,action:"deactivate"})).toMatchObject({error:{code}});expect(mocked.api.deactivateMembership).toHaveBeenCalledTimes(1);});
 it("R1 rechazada no concede aprobación local",async()=>{mocked.api.approveMembership.mockRejectedValue(new ApiClientError(422,"minor_requires_guardian_consent"));expect(await reviewMembership({...identity,decision:"approve"})).toMatchObject({error:{code:"minor_requires_guardian_consent"}});expect(mocked.api.approveMembership).toHaveBeenCalledTimes(1);});
 it("no hay consentimiento sin aceptación explícita",async()=>{expect(await consentManagedMember({membership_id:membershipId,accepted:false})).toMatchObject({error:{code:"consent_required"}});expect(mocked.api.consentMembershipData).not.toHaveBeenCalled();});
 it("autorización confirmada permanece registrada cuando correo falla",async()=>{mocked.api.reviewManagedActivation.mockResolvedValue(identity);mocked.api.sendInvitation.mockRejectedValue(new ApiClientError(503,"email_delivery_failed"));expect(await reviewManagedActivation({request_id:guardianId,accepted:true})).toMatchObject({approvalRecorded:true,error:{message:expect.stringContaining("autorización quedó registrada")}});expect(mocked.api.reviewManagedActivation).toHaveBeenCalledTimes(1);});
 it("activación menor CONSENT_PENDING no envía invitación",async()=>{mocked.api.requestManagedActivation.mockResolvedValue({status:"CONSENT_PENDING"});expect(await requestManagedActivation(identity)).toEqual({success:true,consentPending:true});expect(mocked.api.sendInvitation).not.toHaveBeenCalled();});
 it("email incierto no se reenvía automáticamente",async()=>{mocked.api.sendInvitation.mockRejectedValue(new ApiClientError(503,"email_delivery_failed"));expect(await sendInvitation({action:"send",group_id:groupId,email:"synthetic@example.test",role:"ATHLETE"})).toMatchObject({error:{code:"email_delivery_failed"}});expect(mocked.api.sendInvitation).toHaveBeenCalledTimes(1);});
});
