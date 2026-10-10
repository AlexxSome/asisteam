import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ApiClientError} from '@asisteam/api-client';
const fixture=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),values:new Map<string,string>()}));
vi.mock('server-only',()=>({}));

vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>fixture.values.has(name)?{value:fixture.values.get(name)}:undefined,getAll:()=>[]})}));
vi.mock('./native-auth',()=>({nativeUser:fixture.user}));
import {createSessionClient} from './session';
import {TRANSPORT_MODULES} from './config';
import {middleware} from '@/middleware';
import {NextRequest} from 'next/server';
beforeEach(()=>{
 vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','nest');for(const module of TRANSPORT_MODULES)vi.stubEnv('ASISTEAM_TRANSPORT_'+module.toUpperCase(),'nest');
 fixture.client.mockReset();fixture.user.mockReset().mockResolvedValue(null);fixture.values.clear();
});
afterEach(()=>vi.unstubAllEnvs());
it('anonymous native mode never falls back to legacy cookies or SDK',async()=>{
 const client=await createSessionClient();expect(await client.auth.getUser()).toEqual({data:{user:null},error:null});
 expect(await client.auth.getSession()).toEqual({data:{session:null},error:null});expect(fixture.client).not.toHaveBeenCalled();
 expect('from' in client).toBe(false);expect('rpc' in client).toBe(false);
});
it('verified native session exposes only server compatibility identity',async()=>{
 fixture.user.mockResolvedValue({id:'synthetic-subject'});fixture.values.set('asisteam-access','synthetic-access');
 const client=await createSessionClient();expect((await client.auth.getSession()).data.session?.access_token).toBe('synthetic-access');expect(fixture.client).not.toHaveBeenCalled();
});
it.each(['/login','/register','/forgot-password','/reset-password'])('anonymous %s middleware uses Nest without legacy key or cookies',async path=>{
 const response=await middleware(new NextRequest('https://web.example.test'+path,{headers:{cookie:'sb-retired-auth-token=synthetic-old'}}));
 expect(response.status).toBe(200);expect(fixture.client).not.toHaveBeenCalled();
});
it('anonymous native middleware keeps private group anti-enumeration',async()=>{
 const response=await middleware(new NextRequest('https://web.example.test/groups/64000000-0000-4000-8000-000000000001'));
 expect(response.status).toBe(404);expect(fixture.client).not.toHaveBeenCalled();
});
