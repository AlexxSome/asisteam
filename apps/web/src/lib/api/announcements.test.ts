import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),getAnnouncements:vi.fn(),publishAnnouncement:vi.fn(),updateAnnouncement:vi.fn(),deleteAnnouncement:vi.fn(),setAnnouncementPush:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error('404');}}));
vi.mock("next/cache",()=>({revalidatePath:mock.revalidate}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mock.rpc,from:mock.from})}));
vi.mock("@/lib/groups",()=>({getGroup:async(id:string)=>({id,roles:['ADMIN']})}));
vi.mock("./server",()=>({createServerApiClient:()=>mock}));
import { getAnnouncements } from "../announcements";
import { publishAnnouncement,updateAnnouncement,deleteAnnouncement,setAnnouncementPush } from "@/app/groups/[groupId]/announcements/actions";
const group='15900000-0000-4000-8000-000000000201',id='15900000-0000-4000-8000-000000000301',version='2026-10-07T15:00:00.123456Z',input={title:' Aviso ',body:' Texto '};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('ASISTEAM_TRANSPORT_ANNOUNCEMENTS','nest');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ASISTEAM_API_SUPABASE_URL','http://127.0.0.1:54321');});
afterEach(()=>vi.unstubAllEnvs());
it('muro/preferencias utiliza únicamente SDK y conserva página',async()=>{
 mock.getAnnouncements.mockResolvedValue({announcements:[],page:2,pushEnabled:false,hasDevices:true});expect(await getAnnouncements(group,'2')).toMatchObject({page:2,hasDevices:true});expect(mock.getAnnouncements).toHaveBeenCalledWith({params:{groupId:group},query:{page:2}});expect(mock.rpc).not.toHaveBeenCalled();expect(mock.from).not.toHaveBeenCalled();
});
it('cuatro writes conservan UUID/version completa y revalidan tras acuse',async()=>{
 for(const result of [await publishAnnouncement(group,id,input),await updateAnnouncement(group,id,version,input),await deleteAnnouncement(group,id,version),await setAnnouncementPush(false)])expect(result).toEqual({success:true});
 expect(mock.publishAnnouncement).toHaveBeenCalledWith({params:{groupId:group},body:{title:'Aviso',body:'Texto',request_id:id}});expect(mock.updateAnnouncement).toHaveBeenCalledWith({params:{groupId:group,announcementId:id},body:{title:'Aviso',body:'Texto',updated_at:version}});expect(mock.rpc).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledTimes(4);
});
it.each([409,503,504])('fallo%s no ejecuta fallback ni anuncia éxito',async status=>{
 mock.publishAnnouncement.mockRejectedValue(new ApiClientError(status,status===409?'announcement_request_conflict':'request_timeout'));expect(await publishAnnouncement(group,id,input)).toHaveProperty('error');expect(mock.publishAnnouncement).toHaveBeenCalledTimes(1);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.revalidate).not.toHaveBeenCalled();
});
it('muro ajeno conserva404 y no consulta transporte antiguo',async()=>{
 mock.getAnnouncements.mockRejectedValue(new ApiClientError(404,'group_not_found'));await expect(getAnnouncements(group)).rejects.toThrow('404');expect(mock.rpc).not.toHaveBeenCalled();
});
