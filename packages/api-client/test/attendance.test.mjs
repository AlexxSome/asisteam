import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../dist/index.js';
const groupId='30000000-0000-4000-8000-000000000201',activityId='30000000-0000-4000-8000-000000000501',membershipId='30000000-0000-4000-8000-000000000303';
const params={groupId,activityId},record={membership_id:membershipId,status:'PRESENT'};
function client(payload){const requests=[];return{requests,api:new ApiClient({origin:'http://127.0.0.1:4000',accessToken:async()=>'synthetic',fetch:async(url,options)=>{requests.push({url:String(url),...options});return new Response(JSON.stringify(payload));}})};}
test('attendance SDK keeps strict batch, only_unmarked and partial correction',async()=>{
 const {api,requests}=client({records:[{...record,note:null}]});await api.saveAttendance({params,body:{records:[record],only_unmarked:true}});assert.equal(requests[0].method,'PUT');assert.deepEqual(JSON.parse(requests[0].body),{records:[record],only_unmarked:true});
 await api.updateAttendance({params:{...params,membershipId},body:{status:'LATE'}});assert.equal(requests[1].method,'PATCH');assert.deepEqual(JSON.parse(requests[1].body),{status:'LATE'});assert.equal(requests[1].cache,'no-store');
});
test('attendance rejects empty/oversize/duplicate/fake actor before HTTP',async()=>{
 const {api,requests}=client({records:[]});for(const records of [[],Array.from({length:501},()=>record),[record,{...record,membership_id:membershipId.toUpperCase()}],[{...record,recorded_by:membershipId}]])await assert.rejects(api.saveAttendance({params,body:{records}}),{status:400});
 await assert.rejects(api.updateAttendance({params:{...params,membershipId},body:{}}),{status:400});assert.equal(requests.length,0);
});
test('attendance roster is paged and excludes foreign PII; clear is explicit',async()=>{
 const response={roster:[{...record,full_name:'Nombre sintético',avatar_url:null,note:null}],canEditNotes:false,hasNext:false};const valid=client(response);await valid.api.getAttendanceRoster({params,query:{page:2}});assert.equal(new URL(valid.requests[0].url).searchParams.get('page'),'2');
 await assert.rejects(client({...response,roster:[{...response.roster[0],email:'private@example.test'}]}).api.getAttendanceRoster({params}),{status:502});const clear=client({cleared:true});await clear.api.clearAttendance({params:{...params,membershipId}});assert.equal(clear.requests[0].method,'DELETE');assert.equal(clear.requests[0].body,undefined);
});
