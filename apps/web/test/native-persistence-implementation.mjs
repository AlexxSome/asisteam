// Test-only driver. It verifies native sessions before exercising canonical SQL
// with the real API role/RLS; invitation/Auth operations use the Nest HTTP API.
// It is never bundled with the web or exposed as an HTTP database gateway.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const requireApi=createRequire(new URL('../../api/package.json',import.meta.url));
const pg=requireApi('pg');
import {jwtVerify} from '../../api/node_modules/jose/dist/webapi/index.js';
let app, config, sendEmail=async()=>Response.json({id:randomUUID()});
const realFetch=globalThis.fetch;
export function syntheticEmailTransport(send){sendEmail=send}
const identifier=value=>{if(!/^[a-z_][a-z_0-9]*$/i.test(value))throw new Error('invalid_fixture_identifier');return '"'+value+'"'};
export function nativeSql(statement){
 if(!process.env.NATIVE_TEST_CONTAINER)throw new Error('owned_native_fixture_required');
 return execFileSync('docker',['exec','-i',process.env.NATIVE_TEST_CONTAINER,'psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
async function connection(role='postgres'){
 const url=new URL(process.env.TEST_DATABASE_URL);url.username=role;
 const client=new pg.Client({connectionString:url.toString()});await client.connect();return client;
}
export async function nativeIntegrationConfig(){
 if(config)return config;
 const [{createApplication},{loadFixtureConfig},{SafeLogger}]=await Promise.all([import('../../api/dist/application.js'),import('../../api/test/fixture-config.mjs'),import('../../api/dist/logger.js')]);
 const url=role=>{const value=new URL(process.env.TEST_DATABASE_URL);value.username=role;return value.toString()};
 globalThis.fetch=async(input,init)=>String(input).startsWith('https://api.resend.com/')?sendEmail(input,init):String(input).startsWith('https://api.mercadopago.com/')?nativeBillingTransport(input,init):realFetch(input,init);
 app=await createApplication(loadFixtureConfig({DATABASE_URL:url('asisteam_api'),INVITATION_DATABASE_URL:url('asisteam_invitation'),INVITATION_PROXY_SECRET:process.env.INVITATION_PROXY_SECRET,BILLING_DATABASE_URL:url('asisteam_billing'),MERCADOPAGO_ACCESS_TOKEN:'synthetic',MERCADOPAGO_WEBHOOK_SECRET:'fixture-only',MERCADOPAGO_COLLECTOR_ID:'123',BILLING_WEB_URL:'https://asisteam.test',BILLING_WEBHOOK_URL:'https://native.test/api/v1/billing/mercadopago-webhook',RESEND_API_KEY:'synthetic',EMAIL_FROM:'Asisteam <synthetic@example.test>',INVITATION_WEB_URL:'http://localhost:3000',INVITATION_EMAIL_FROM:'Asisteam <synthetic@example.test>'}),new SafeLogger(()=>{}));
 await app.listen(0,'127.0.0.1');
 config={API_ORIGIN:await app.getUrl(),GUEST_TOKEN:'synthetic-guest',OPERATOR_TOKEN:process.env.NATIVE_TEST_OPERATOR};return config;
}
export async function closeNativeIntegration(){globalThis.fetch=realFetch;await app?.close();app=undefined;config=undefined}
export function attachNativeIntegrationConfig(runtime){config=runtime;process.env.TEST_DATABASE_URL=runtime.url;process.env.NATIVE_TEST_CONTAINER=runtime.name;process.env.NATIVE_TEST_OPERATOR=runtime.OPERATOR_TOKEN;process.env.INVITATION_PROXY_SECRET=runtime.INVITATION_PROXY_SECRET}
const a_fullName=a=>a.full_name??a.guardian_full_name;
const failure=error=>({data:null,error:{code:error.error?.code??error.code,message:error.error?.code??error.message??'unavailable'},status:error.status??(/^PT\d{3}$/.test(error.code??'')?Number(error.code.slice(2)):['42501'].includes(error.code)?403:['23505','23514'].includes(error.code)?409:503)});
async function request(path,body,token,secret=true){
 const response=await realFetch(config.API_ORIGIN+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(secret?{'x-asisteam-auth-proxy':'3'.repeat(64),'x-asisteam-proxy':process.env.INVITATION_PROXY_SECRET,'x-asisteam-client-ip':randomUUID()}: {})},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw {status:response.status,error:data.error};return data;
}
export function nativeInvitationRequest(body,token,ip,proxy){
 const {action,...input}=body;
 return realFetch(config.API_ORIGIN+'/api/v1/invitations/'+(action==='preview'?'preview':action==='register'?'register':action==='claim'?'claim':'accept'),{method:'POST',headers:{'content-type':'application/json','x-asisteam-proxy':proxy,'x-asisteam-client-ip':ip,...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(input)});
}
export class NativePersistenceClient{
 constructor(origin,key){this.origin=origin;this.operator=key===process.env.NATIVE_TEST_OPERATOR;this.session=null;
  this.auth={signInWithPassword:async body=>{try{const session=await request('/api/v1/auth/login',body);this.session={...session,user:{id:(await this.identity(session.access_token)).sub}};return{data:{session:this.session,user:this.session.user},error:null}}catch(error){return failure(error)}},
   getSession:async()=>({data:{session:this.session},error:null}),
   getUser:async token=>{try{const payload=await this.identity(token??this.session?.access_token);return{data:{user:{id:payload.sub}},error:null}}catch(error){return{data:{user:null},error}}},
   signUp:async body=>{try{const {account_terms,...metadata}=body.options.data;await request('/api/v1/auth/register',{email:body.email,password:body.password,...metadata,terms_accepted:account_terms?.accepted,terms_version:account_terms?.version});return await this.auth.signInWithPassword({email:body.email,password:body.password})}catch(error){return failure(error)}},
  };
 }
 async identity(token){
  if(!token)throw{status:401,message:'authentication_required'};
  const {payload}=await jwtVerify(token,new TextEncoder().encode('3'.repeat(64)),{issuer:'https://synthetic-auth.example.test',audience:'asisteam-api'});
  const check=await realFetch(this.origin+'/api/v1/auth/session',{headers:{authorization:'Bearer '+token}});if(!check.ok)throw{status:401,message:'authentication_required'};
  return payload;
 }
 async fixtureAccount(body){
  if(!this.operator)return failure({status:403,message:'fixture_operator_required'});
  const db=await connection();try{
   await db.query('begin');const subject=randomUUID(),metadata=body.profile??{};
   const passwordHash=(await db.query("select extensions.crypt($1,extensions.gen_salt('bf',4)) as hash",[body.password])).rows[0].hash;
    await db.query('insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true)',[subject,body.email]);
    const profile=(await db.query("insert into public.users(auth_user_id,email,full_name,birthdate,phone,account_status) values($1,$2,$3,$4,$5,'ACTIVE') returning id",[subject,body.email,metadata.full_name??'Fixture nativo',metadata.birthdate??null,metadata.phone??null])).rows[0];
    await db.query('insert into app_private.auth_credentials(subject_id,password_hash) values($1,$2)',[subject,passwordHash]);
    if(metadata.account_terms?.accepted)await db.query("select app_private.record_account_consent($1,$2,'EMAIL_SIGNUP')",[profile.id,metadata.account_terms.version]);
   await db.query('commit');return{data:{user:{id:subject}},error:null};
  }catch(error){await db.query('rollback');return failure(error)}finally{await db.end()}
 }
 async transaction(operation,role){
  const payload=this.operator?null:await this.identity(this.session?.access_token);
  const db=await connection(role??(this.operator?'postgres':'asisteam_api'));try{
   await db.query('begin');
   if(payload){await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...payload,auth_provider:'nest'})]);const valid=(await db.query('select app_private.native_session_user_id($1) as id',[payload.session_id])).rows[0].id;if(!valid)throw{status:401,message:'authentication_required'}}
   const data=await operation(db);await db.query('commit');return{data,error:null,status:200};
  }catch(error){await db.query('rollback');return failure(error)}finally{await db.end()}
 }
 async http(path,body,method='POST'){
  try{const response=await realFetch(this.origin+'/api/v1/'+path,{method,headers:{'content-type':'application/json',...(this.session?.access_token?{authorization:'Bearer '+this.session.access_token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});const data=await response.json();return response.ok?{data,error:null,status:response.status}:failure({status:response.status,error:data.error});}catch(error){return failure(error)}
 }
 async operation(name,args={}){
  // Explicit endpoint map: no dynamic HTTP SQL gateway or fallback for writes.
  const a=Object.fromEntries(Object.entries(args).map(([key,value])=>[key.replace(/^p_/,''),value]));
  const group='groups/'+a.group_id,member=group+'/memberships/'+a.membership_id;
  const query=(path,keys)=>path+'?'+new URLSearchParams(Object.fromEntries(keys.filter(key=>a[key]!==undefined&&a[key]!==null).map(key=>[key,Array.isArray(a[key])?a[key].join(','):String(a[key])])));
  let path,body={},method='POST',extract=data=>data;
  switch(name){
   case 'create_group':path='groups';body=a;extract=d=>d.group_id;break;
   case 'join_group_as_athlete':path=group+'/memberships/self';break;
   case 'rotate_invite_code':path=group+'/invite-code/rotate';extract=d=>d.code;break;
   case 'join_group_by_code':path='groups/join';body={code:a.invite_code};break;
   case 'update_group_settings':path=group+'/settings';method='PATCH';body=a.changes;extract=d=>d.settings;break;
   case 'create_managed_member':path=group+'/managed-members';body={email:'',...Object.fromEntries(Object.entries(a).filter(([k])=>k!=='group_id'))};break;
   case 'update_managed_member':path=member+'/managed-profile';method='PATCH';body={full_name:a.full_name,birthdate:a.birthdate,email:a.email??'',phone:a.phone??null};extract=d=>d.status;break;
   case 'create_guardianship':path=group+'/guardianships';body={athlete_user_id:a.athlete_user_id,full_name:a_fullName(a),email:a.email,relationship:a.relationship};extract=d=>d.guardianship_id;break;
   case 'deactivate_membership':case 'reactivate_membership':case 'approve_membership':case 'reject_pending_membership':case 'assign_member_coach':path=member+'/'+({deactivate_membership:'deactivate',reactivate_membership:'reactivate',approve_membership:'approve',reject_pending_membership:'reject',assign_member_coach:'coach'}[name]);break;
   case 'list_group_members':path=query(group+'/memberships',['search','role','status','page']);method='GET';extract=d=>d.data;break;
   case 'list_guardianship_athletes':path=query(group+'/guardianships/eligible-athletes',['search','page']);method='GET';extract=d=>d.data;break;
   case 'list_pending_memberships':path=query(group+'/memberships',['role','status','page']);method='GET';extract=d=>d.data;break;
   case 'has_account_consent':path='account-consents/current';method='GET';extract=d=>d.accepted;break;
   case 'accept_account_terms':path='account-consents';body={terms_accepted:a.accepted,terms_version:a.terms_version};break;
   case 'consent_managed_member':path='memberships/'+a.membership_id+'/data-consents';body={accepted:a.accepted};extract=d=>d.status;break;
   case 'list_managed_member_consents':a.as_guardian=true;path=query('memberships/onboarding',['group_id','athlete_user_id','membership_id','page','as_guardian']);method='GET';extract=d=>d.data;break;
   case 'request_managed_activation':path=member+'/activation';extract=d=>d.status;break;
   case 'list_managed_activation_requests':path=query(group+'/activation-requests',['page','athlete_user_id']);method='GET';extract=d=>d.data;break;
   case 'review_managed_activation':path='activation-requests/'+a.request_id;body={accepted:a.accepted};break;
   case 'create_activity':path=group+'/activities';body={description:'',location:'',...Object.fromEntries(Object.entries(a).filter(([k])=>k!=='group_id')),starts_at:new Date(a.starts_at).toISOString(),ends_at:new Date(a.ends_at).toISOString()};extract=d=>d.activityId;break;
   case 'update_activity':case 'delete_activity':path=group+'/activities/'+a.activity_id;method=name==='update_activity'?'PATCH':'DELETE';body=Object.fromEntries(Object.entries(a).filter(([k])=>!['group_id','activity_id'].includes(k)));body.scope??='single';if(method==='DELETE')body.confirm_attendance??=false;else{body.description??='';body.location??='';body.starts_at=new Date(a.starts_at).toISOString();body.ends_at=new Date(a.ends_at).toISOString();delete body.recurrence_rule;}extract=d=>d.affected;break;
   case 'issue_activity_checkin_qr':path='activities/'+a.activity_id+'/check-in-qr';break;
   case 'self_checkin':path='me/check-in';body=a;break;
   case 'set_qr_checkin_settings':path=group+'/check-in-settings';method='PUT';body=a.settings;break;
   case 'record_attendance_bulk':case 'clear_attendance_record':case 'update_attendance_record':{
    const lookup=name==='update_attendance_record'?nativeSql("select jsonb_build_object('group_id',act.group_id,'activity_id',r.activity_id,'membership_id',r.membership_id) from public.attendance_records r join public.activities act on act.id=r.activity_id where r.id='"+a.record_id+"'"):nativeSql("select jsonb_build_object('group_id',group_id) from public.activities where id='"+a.activity_id+"'");
    const ids=JSON.parse(lookup);path='groups/'+ids.group_id+'/activities/'+(ids.activity_id??a.activity_id)+'/attendance';method=name==='record_attendance_bulk'?'PUT':name==='clear_attendance_record'?'DELETE':'PATCH';body=name==='record_attendance_bulk'?{records:a.records,only_unmarked:a.only_unmarked??false}:a.changes;if(method!=='PUT')path+='/'+(ids.membership_id??a.membership_id);break;
   }
   case 'get_my_attendance_history':case 'get_ward_attendance_history':case 'get_group_attendance_report':case 'get_group_stats':path=query(group+'/'+({get_my_attendance_history:'me/history',get_ward_attendance_history:'wards/'+a.athlete_user_id+'/history',get_group_attendance_report:'reports',get_group_stats:'stats'}[name]),['period','from','to','activity_type_ids','page','page_size','include_inactive','sort']);method='GET';break;
   case 'publish_group_announcement':path=group+'/announcements';body={title:a.title,body:a.body,request_id:a.request_id};extract=d=>d.id;break;
   case 'list_group_announcements':path=query(group+'/announcements',['page']);method='GET';extract=d=>d.announcements;break;
   case 'update_group_announcement':case 'delete_group_announcement':path=group+'/announcements/'+a.announcement_id;method=name==='update_group_announcement'?'PATCH':'DELETE';body={updated_at:a.updated_at,...(method==='PATCH'?{title:a.title,body:a.body}:{})};break;
   case 'set_announcement_push_enabled':path='me/announcement-push';method='PATCH';body={enabled:a.enabled};break;
   case 'register_announcement_push_token':path='me/announcement-push/tokens';body={token:a.token,platform:a.platform};extract=d=>d.id;break;
   case 'get_group_billing':path=group+'/billing';method='GET';break;
   default:throw new Error('unmapped_native_endpoint:'+name);
  }
  const result=await this.http(path,body,method);if(result.error)return result;
  result.data=extract(result.data);
  // These assertions check the persisted identifiers, after the HTTP mutation.
  if(['join_group_as_athlete','assign_member_coach','accept_account_terms'].includes(name)){
   const check=await this.sqlFunction(name==='accept_account_terms'?'has_account_consent':'auth_user_id');if(check.error)return check;
   const payload=await this.identity(this.session.access_token);
   result.data=nativeSql(name==='accept_account_terms'?"select c.id from public.account_consents c join public.users u on u.id=c.user_id where u.auth_user_id='"+payload.sub+"' order by granted_at desc limit 1":"select m.id from public.memberships m join public.users u on u.id=m.user_id where m.group_id='"+a.group_id+"' and m.role='"+(name==='assign_member_coach'?'COACH':'ATHLETE')+"' and "+(name==='assign_member_coach'?"m.user_id=(select user_id from public.memberships where id='"+a.membership_id+"')":"u.auth_user_id='"+payload.sub+"'"));
  }
  return result;
 }
 async sqlFunction(name,args={}){
  try{return await this.transaction(async db=>{
   const nativeBilling=['begin_subscription_checkout','claim_subscription_creation','get_subscription_context','lookup_billing_subscription','reject_subscription_creation','sync_group_subscription','sync_subscription_invoice'];
   const worker={claim_announcement_push:'worker_claim_announcement_push',complete_announcement_push:'worker_complete_announcement_push',record_announcement_push_run:'worker_record_announcement_push_run'};
   const schema=nativeBilling.includes(name)||worker[name]?'app_private':'public';
   const target=worker[name]??name;
   const values=Object.values(args).map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value);
   const call=identifier(schema)+'.'+identifier(target)+'('+Object.keys(args).map((key,index)=>identifier(key)+'=> $'+(index+1)).join(',')+')';
   const rows=(await db.query('select * from '+call,values)).rows;
   const signatures=(await db.query('select p.proretset,t.typtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype where n.nspname=$1 and p.proname=$2 limit 1',[schema,target])).rows[0];
   return signatures?.proretset?rows:rows[0]?.[target]??null;
  })}catch(error){return failure(error)}
 }
 sqlTable(table){return new NativeQuery(this,table)}
}
export const createNativeClient=(origin,key,_options)=>new NativePersistenceClient(origin,key);
class NativeQuery{
 constructor(client,table){this.client=client;this.table=table;this.columns='*';this.conditions=[];this.values=[];this.mode='select'}
 select(columns){this.columns=columns;return this}
 eq(column,value){this.values.push(value);this.conditions.push(identifier(column)+'=$'+this.values.length);return this}
 or(expression){const parts=expression.split(',').map(part=>{const [column,op,...items]=part.split('.');if(op!=='eq')throw new Error('unsupported_fixture_predicate');this.values.push(items.join('.'));return identifier(column)+'=$'+this.values.length});this.conditions.push('('+parts.join(' or ')+')');return this}
 neq(column,value){this.values.push(value);this.conditions.push(identifier(column)+'<>$'+this.values.length);return this}
 in(column,items){this.values.push(items);this.conditions.push(identifier(column)+'=any($'+this.values.length+')');return this}
 gte(column,value){this.values.push(value);this.conditions.push(identifier(column)+'>=$'+this.values.length);return this}
 is(column,value){this.conditions.push(identifier(column)+' is '+(value===null?'null':'not null'));return this}
 order(column,{ascending=true}={}){this.orderBy=identifier(column)+(ascending?' asc':' desc');return this}
 limit(count){this.limitBy=Number(count);return this}
 range(from,to){this.offsetBy=Number(from);this.limitBy=Number(to)-Number(from)+1;return this}
 insert(data){this.mode='insert';this.body=data;return this}
 update(data){this.mode='update';this.body=data;return this}
 delete(){this.mode='delete';return this}
 single(){this.singleRow=true;return this}
 maybeSingle(){this.singleRow=true;return this}
 then(resolve,reject){return this.execute().then(resolve,reject)}
 async execute(){try{return await this.client.transaction(async db=>{
  const table='public.'+identifier(this.table),columns=this.columns==='*'?'*':this.columns.split(',').map(value=>identifier(value.trim())).join(',');
  const where=this.conditions.length?' where '+this.conditions.join(' and '):'';
  let text='select '+columns+' from '+table+where;
  const values=[...this.values];
  if(this.mode!=='select'){
   const keys=Object.keys(this.body??{});const items=Object.values(this.body??{}).map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value);const params=items.map((_,index)=>'$'+(values.length+index+1));values.push(...items);
   text=this.mode==='insert'?'insert into '+table+'('+keys.map(identifier).join(',')+') values('+params.join(',')+')':this.mode==='update'?'update '+table+' set '+keys.map((key,index)=>identifier(key)+'='+params[index]).join(',')+where:'delete from '+table+where;
   text+=' returning '+columns;
  }
  if(this.orderBy)text+=' order by '+this.orderBy;
  if(this.limitBy!==undefined)text+=' limit '+this.limitBy;
  if(this.offsetBy!==undefined)text+=' offset '+this.offsetBy;
  const rows=JSON.parse(JSON.stringify((await db.query(text,values)).rows));return this.singleRow?(rows[0]??null):rows;
 })}catch(error){return failure(error)}}
}
// Requests reach the actual Nest controller; only external email/MP transports
// are synthetic, so permission/schema/transaction errors are observed as HTTP.
export function createNativeSendInvitationHandler({sendEmail}){
 syntheticEmailTransport(sendEmail);
 return async incoming=>realFetch(config.API_ORIGIN+'/api/v1/invitations/send',{method:'POST',headers:{'content-type':'application/json',authorization:incoming.headers.get('authorization')??''},body:await incoming.text()});
}
let billingProvider;
export function createNativeBillingHandler({provider}){
 billingProvider=provider;
 return async incoming=>realFetch(config.API_ORIGIN+'/api/v1/billing/subscriptions',{method:'POST',headers:{'content-type':'application/json',authorization:incoming.headers.get('authorization')??''},body:await incoming.text()});
}
async function nativeBillingTransport(input,init){
 if(!billingProvider)throw new Error('unexpected_fixture_provider_request');
 const url=new URL(String(input)),provider=billingProvider;
 const body=init?.body?JSON.parse(init.body):undefined;
 if(url.pathname==='/preapproval'&&init.method==='POST')return Response.json(await provider.create(body));
 if(url.pathname==='/preapproval/search'){try{return Response.json({results:[await provider.recover(url.searchParams.get('external_reference'))]})}catch(error){if(error.code==='checkout_uncertain')return Response.json({results:[]});throw error;}}
 if(url.pathname.startsWith('/preapproval/'))return Response.json(init.method==='PUT'?await provider.cancel(url.pathname.split('/').at(-1)):await provider.subscription(url.pathname.split('/').at(-1)));
 if(url.pathname==='/authorized_payments/search'){const results=await provider.invoices(url.searchParams.get('preapproval_id'));return Response.json({paging:{total:results.length},results:results.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+100)});}
 if(url.pathname.startsWith('/authorized_payments/'))return Response.json(await provider.invoice(url.pathname.split('/').at(-1)));
 if(url.pathname.startsWith('/v1/payments/'))return Response.json(await provider.payment(url.pathname.split('/').at(-1)));
 throw new Error('unexpected_fixture_provider_resource');
}
export async function nativeAnnouncementTick(send){
 const [{WorkerStore},{runAnnouncementPush}]=await Promise.all([import('../../worker/dist/store.js'),import('@asisteam/core/runtime')]);
 const url=new URL(process.env.TEST_DATABASE_URL);url.username='asisteam_jobs';
 const store=new WorkerStore({DATABASE_URL:url.toString()});
 try{return await runAnnouncementPush({send,client:{rpc:async(name,args)=>{
  const rows=name==='claim_announcement_push'?await store.call('pushClaim',[args.p_receipts]):name==='complete_announcement_push'?await store.call('pushComplete',[args.p_delivery_id,args.p_claim_token,args.p_outcome,args.p_ticket_id]):await store.call('pushRun',[args.p_processed]);return{data:name==='claim_announcement_push'?rows:null,error:null};
 }}})}finally{await store.onApplicationShutdown()}
}
export async function registerNativeInvitation(token,registration,claim=false){
 const response=await nativeInvitationRequest({action:claim?'claim':'register',token,registration},undefined,randomUUID(),process.env.INVITATION_PROXY_SECRET);
 if(!response.ok)return failure({status:response.status,error:(await response.json()).error});
 const subject=nativeSql("select id from app_private.auth_subjects where email='"+registration.email.replaceAll("'","''")+"'");
 return{data:{user:{id:subject}},error:null,status:response.status};
}
