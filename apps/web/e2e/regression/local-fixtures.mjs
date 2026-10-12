import { execFileSync } from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import { email, id, password, fixtureFlowCode } from './data.mjs';

// Server-side test utilities only: no credentials in browser, logs or reports.
/** @param {string} statement */
export function sql(statement) {
  try {
    return execFileSync('docker', ['exec', '-i', localConfig().name, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
      { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const code = String(error.stderr).match(/ERROR:\s+([a-z_]+)/)?.[1] ?? 'sql_error';
    throw new Error(`Fixture local: ${code}`);
  }
}
/** @param {string} value */
export const quote = (value) => `'${value.replaceAll("'", "''")}'`;
export const flowGroup = id(5000);
export const flowCode = fixtureFlowCode;
export const activityType = 'b2c3d4e5-0001-4b3c-8d4e-111111111111';

export function localConfig() {
  const config=JSON.parse(readFileSync('.qa/native-runtime.json','utf8'));
  if(!/^asisteam-native-[a-f0-9]+$/.test(config.name)||new URL(config.API_ORIGIN).hostname!=='127.0.0.1')throw new Error('Owned native QA fixture required');
  return config;
}

/** @param {string} role */
export async function actor(role) {
  const config = localConfig();
  const response=await fetch(config.API_ORIGIN+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json','x-asisteam-auth-proxy':'3'.repeat(64),'x-asisteam-client-ip':randomUUID()},body:JSON.stringify({email:email(role),password})});
  if(!response.ok)throw new Error('native_fixture_login_failed');
  const session=await response.json();
  const http=async(path,body)=>{const response=await fetch(config.API_ORIGIN+'/api/v1/'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});const value=await response.json();return response.ok?{data:value,error:null}:{data:null,error:value.error}};
  return{http,operation:async(name,input)=>{
    if(name==='create_activity'){const{p_group_id,...fields}=input;const body=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.slice(2),value]));body.description??='';body.location??='';body.starts_at=new Date(body.starts_at).toISOString();body.ends_at=new Date(body.ends_at).toISOString();const result=await http('groups/'+p_group_id+'/activities',body);if(!result.error)result.data=result.data.activityId;return result;}
    if(name==='issue_activity_checkin_qr')return http('activities/'+input.p_activity_id+'/check-in-qr',{});
    throw new Error('unmapped_native_fixture_endpoint');
  }};
}

export function prepareFlowGroup() {
  const owner = sql(`select id from public.users where email=${quote(email('admin'))}`);
  if (!owner) throw new Error('Ejecutar el servidor QA para preparar las cuentas');
  if (sql(`select count(*) from public.groups where id='${flowGroup}' and created_by<>'${owner}'`) !== '0') throw new Error('Namespace QA ocupado');
  sql(`insert into public.groups(id,name,sport,invite_code,created_by) values
    ('${flowGroup}','Club QA cierre de épica','Tenis','${flowCode}','${owner}') on conflict(id) do nothing;
    insert into public.memberships(user_id,group_id,role,status)
      select id,'${flowGroup}',case when email=${quote(email('admin'))} then 'ADMIN' else 'GUARDIAN' end,'ACTIVE'
      from public.users where email in (${quote(email('admin'))},${quote(email('guardian'))})
      on conflict(user_id,group_id,role) do nothing;
    insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at)
    values('${id(5001)}','${flowGroup}','ACADEMY',15990,1000,'${owner}','AUTHORIZED',now()) on conflict(id) do nothing;
    insert into public.memberships(user_id,group_id,role,status,joined_at)
      values('${id(1001)}','${flowGroup}','ATHLETE','ACTIVE',now()-interval '90 days')
      on conflict(user_id,group_id,role) do nothing;`);
}

export function lastEmail(){return JSON.parse(readFileSync('.qa/last-email.json','utf8'))}
export async function recoveryToken(address){
 const config=localConfig();
 const response=await fetch(config.API_ORIGIN+'/api/v1/auth/recovery',{method:'POST',headers:{'content-type':'application/json','x-asisteam-auth-proxy':'3'.repeat(64),'x-asisteam-client-ip':'qa-recovery-'+Date.now()},body:JSON.stringify({email:address})});
 if(!response.ok)throw new Error('native_recovery_failed');
 const message=lastEmail();if(message.to[0]!==address||!message.text.includes('60 minutos'))throw new Error('invalid_native_recovery_email');
 return new URL(message.text.match(/http:\/\/\S+/)[0]).searchParams.get('token');
}

export function fixtureAccount(address,password,fullName){
 const subject=randomUUID();
 sql(`insert into app_private.auth_subjects(id,email,native_owned) values('${subject}',${quote(address)},true);
 insert into app_private.auth_credentials(subject_id,password_hash) values('${subject}',extensions.crypt(${quote(password)},extensions.gen_salt('bf',4)));
 insert into public.users(auth_user_id,email,full_name,birthdate,account_status) values('${subject}',${quote(address)},${quote(fullName)},'1990-01-01','ACTIVE');`);
 return{data:{user:{id:subject}},error:null};
}
