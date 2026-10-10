import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock=vi.hoisted(()=>({ getUser:vi.fn(), from:vi.fn(), rpc:vi.fn(), cookie:vi.fn(), listMyGroups:vi.fn(),getGroup:vi.fn(), createGroup:vi.fn(), updateGroup:vi.fn(), updateGroupSettings:vi.fn(),rotateInviteCode:vi.fn(), joinByCode:vi.fn(),joinAsAthlete:vi.fn(),updateOwnProfile:vi.fn(),getOwnProfile:vi.fn(),getProfileContext:vi.fn(),revalidate:vi.fn() }));
vi.mock("react",async original=>({...await original<typeof import("react")>(),cache:(fn:unknown)=>fn}));
vi.mock("next/headers",()=>({cookies:async()=>({get:mock.cookie})}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error('redirect:'+path);},notFound:()=>{throw new Error('404');},forbidden:()=>{throw new Error('403');}}));
vi.mock("next/cache",()=>({revalidatePath:mock.revalidate}));
vi.mock("@/lib/api/session",()=>({createSessionClient:async()=>({auth:{getUser:mock.getUser},from:mock.from,rpc:mock.rpc})}));
vi.mock("./server",()=>({createServerApiClient:()=>mock}));
import { getMyGroups, getGroup, groupHomePath } from "../groups";
import { getProfilePageData } from "../profile";
import { createGroup } from "@/app/groups/new/actions";
import { updateGroup, updateGroupSettings, rotateInviteCode, joinByCode, joinAsAthlete } from "@/app/groups/[groupId]/actions";
import { saveProfile } from "@/app/profile/actions";
const id='17000000-0000-4000-8000-000000000201';
const group={id,name:'Grupo sintético',sport:'Tenis',logo_url:null,roles:['ADMIN' as const,'ATHLETE' as const]};
const profile={id,full_name:'Persona sintética',email:null,phone:null,birthdate:'2014-01-01',avatar_url:null};
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('ASISTEAM_TRANSPORT_GROUPS','nest');vi.stubEnv('ASISTEAM_TRANSPORT_PROFILE','nest');
  mock.getUser.mockResolvedValue({data:{user:{id}}});mock.listMyGroups.mockResolvedValue({data:[group],pagination:{page:1,page_size:100,total:1}});mock.getGroup.mockResolvedValue({...group,access:'admin',invite_code:'CODE0001',description:null,settings:{athletes_can_view_group_stats:false,guardians_can_view_group_stats:false},can_view_group_stats:true,settings_updated_at:null,settings_updated_by_name:null});
});
afterEach(()=>vi.unstubAllEnvs());
it('selector conserva cookie y grupo autorizado usando SDK; no consulta SQL de origen',async()=>{
  mock.cookie.mockReturnValue({value:id});expect(await groupHomePath()).toBe('/groups/'+id);expect((await getMyGroups()).groups).toEqual([group]);expect((await getGroup(id)).roles).toEqual(group.roles);expect(mock.from).not.toHaveBeenCalled();
});
it('membresía revocada entre lista y detalle mantiene404',async()=>{
  mock.getGroup.mockRejectedValue(new ApiClientError(404,'group_not_found'));await expect(getGroup(id)).rejects.toThrow('404');expect(mock.from).not.toHaveBeenCalled();
});
it('crea, configura y guarda un solo write por SDK',async()=>{
  mock.createGroup.mockResolvedValue({group_id:id});mock.updateGroup.mockResolvedValue({success:true});
  expect(await createGroup({name:'Grupo nuevo',sport:'Tenis',actor:'ignored'})).toEqual({groupId:id});expect(await updateGroup(id,{name:'Grupo editado',sport:'Tenis'})).toEqual({success:true});
  expect(mock.createGroup).toHaveBeenCalledTimes(1);expect(mock.updateGroup).toHaveBeenCalledTimes(1);expect(mock.from).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it('toggles y rotación envían únicamente campos editables',async()=>{
  const settings={athletes_can_view_group_stats:true,guardians_can_view_group_stats:false};mock.updateGroupSettings.mockResolvedValue({settings});mock.rotateInviteCode.mockResolvedValue({code:'CODE0002'});
  expect(await updateGroupSettings(id,{athletes_can_view_group_stats:true})).toEqual({settings});expect(await rotateInviteCode(id)).toEqual({code:'CODE0002'});expect(mock.rpc).not.toHaveBeenCalled();
});
it('403 de edición conserva superficie forbidden sin otro ejecutor',async()=>{
  mock.updateGroup.mockRejectedValue(new ApiClientError(403,'admin_required'));await expect(updateGroup(id,{name:'Grupo',sport:'Tenis'})).rejects.toThrow('403');expect(mock.from).not.toHaveBeenCalled();
});
it('ingreso minor PENDING no abre detalle privado; ADMIN multirol usa SDK',async()=>{
  mock.joinByCode.mockResolvedValue({membership:{group_id:id,status:'PENDING'}});const form=new FormData();form.set('code','CODE0001');await expect(joinByCode(form)).rejects.toThrow('redirect:/join?pending=1');
  mock.joinAsAthlete.mockResolvedValue({success:true});expect(await joinAsAthlete(id)).toEqual({success:true});expect(mock.rpc).not.toHaveBeenCalled();
});
it('perfil conserva fecha vigente y mensaje de solicitud pendiente',async()=>{
  mock.updateOwnProfile.mockResolvedValue({profile,birthdate_change_pending:true});expect(await saveProfile({full_name:profile.full_name,phone:null,birthdate:'1990-01-01'})).toMatchObject({ok:true,profile,message:expect.stringContaining('conservamos tu fecha actual')});expect(mock.from).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it('estado/permisos del perfil no mezclan transportes',async()=>{
  mock.getOwnProfile.mockResolvedValue(profile);mock.getProfileContext.mockResolvedValue({avatar_allowed:false,has_admin_role:false,birthdate_request:null,avatar_permissions:[]});
  expect(await getProfilePageData(id)).toMatchObject({profile,allowed:false,hasAdminRole:false});expect(mock.from).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([503,504])('error%s no confirma write ni cambia a Supabase',async status=>{
  mock.createGroup.mockRejectedValue(new ApiClientError(status,'request_timeout'));expect(await createGroup({name:'Grupo',sport:'Tenis'})).toHaveProperty('error');expect(mock.createGroup).toHaveBeenCalledTimes(1);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.revalidate).not.toHaveBeenCalled();
});
