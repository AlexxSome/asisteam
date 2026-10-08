import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ApiClientError} from '@asisteam/api-client';
const fixture=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),values:new Map<string,string>()}));
vi.mock('server-only',()=>({}));
vi.mock('@supabase/ssr',()=>({createServerClient:fixture.client}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>fixture.values.has(name)?{value:fixture.values.get(name)}:undefined,getAll:()=>[]})}));
vi.mock('./native-auth',()=>({nativeUser:fixture.user}));
import {createClient} from '../supabase/server';
import {TRANSPORT_MODULES} from './config';
beforeEach(()=>{
 vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','nest');for(const module of TRANSPORT_MODULES)vi.stubEnv('ASISTEAM_TRANSPORT_'+module.toUpperCase(),'nest');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ASISTEAM_API_SUPABASE_URL','http://127.0.0.1:54321');
 fixture.client.mockReset();fixture.user.mockReset().mockResolvedValue(null);fixture.values.clear();
});
afterEach(()=>vi.unstubAllEnvs());
it('anonymous native mode never falls back to legacy cookies or SDK',async()=>{
 const client=await createClient();expect(await client.auth.getUser()).toEqual({data:{user:null},error:null});
 expect(await client.auth.getSession()).toEqual({data:{session:null},error:null});expect(fixture.client).not.toHaveBeenCalled();
 expect(()=>client.from('users')).toThrow(ApiClientError);expect(()=>client.rpc('has_account_consent')).toThrow(ApiClientError);
});
it('verified native session exposes only server compatibility identity',async()=>{
 fixture.user.mockResolvedValue({id:'synthetic-subject'});fixture.values.set('asisteam-access','synthetic-access');
 const client=await createClient();expect((await client.auth.getSession()).data.session?.access_token).toBe('synthetic-access');expect(fixture.client).not.toHaveBeenCalled();
});
