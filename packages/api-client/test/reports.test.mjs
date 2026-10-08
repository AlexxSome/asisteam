import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient, ApiClientError } from '../dist/index.js';
const id='17000000-0000-4000-8000-000000000201',other='17000000-0000-4000-8000-000000000202';
const params={groupId:id};
const stats={group_id:id,members:[],totals:{athletes:0,convened:0,present:0,late:0,absent:0,excused:0,attendance_pct:null,late_rate:null},page:1,page_size:50};
test('MIG-12 SDK validates CSV/date/pages and defaults, preserves null and never retries',async()=>{
 let calls=0,url,options;
 const client=new ApiClient({origin:'https://api.example.test',accessToken:async()=>'synthetic',fetch:async(u,o)=>{calls++;url=u;options=o;return Response.json(stats);}});
 assert.deepEqual(await client.getGroupStats({params}),stats);assert.equal(url.pathname,'/api/v1/groups/'+id+'/stats');assert.equal(url.searchParams.get('page_size'),'50');assert.equal(options.cache,'no-store');
 for(const query of [{period:'custom'},{period:'custom',from:'2026-02-30',to:'2026-03-31'},{page_size:101},{activity_type_ids:'bad'},{include_inactive:'false'},{actor:other}])await assert.rejects(client.getGroupAttendanceReport({params,query}),error=>error instanceof ApiClientError&&error.status===400);
 assert.equal(calls,1);
 const denied=new ApiClient({origin:'https://api.example.test',accessToken:async()=>'synthetic',fetch:async(u)=>{calls++;url=u;return Response.json({error:{code:'group_stats_disabled',message:'Privado',details:{}}},{status:403});}});
 await assert.rejects(denied.getGroupAttendanceReport({params,query:{period:'custom',from:'2026-03-01',to:'2026-03-31',activity_type_ids:id+','+other,include_inactive:true,sort:'name',page:2}}),{status:403});
 assert.equal(url.searchParams.get('activity_type_ids'),id+','+other);assert.equal(url.searchParams.get('include_inactive'),'true');assert.equal(calls,2);
 const invalid=new ApiClient({origin:'https://api.example.test',accessToken:async()=>'synthetic',fetch:async()=>Response.json({...stats,members:[{email:'private@example.test'}]})});
 await assert.rejects(invalid.getGroupStats({params}),{status:502});
});
