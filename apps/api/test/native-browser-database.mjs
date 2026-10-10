// Every fixture owns a vanilla PostgreSQL container; no shared source cluster.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {command,quote} from '../../../packages/db/scripts/local.mjs';
import {migrate} from '../../../packages/db/scripts/migrate.mjs';
export async function nativeBrowserDatabase(){
 const name='asisteam-native-'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
 let created=false,owner,deploy;
 const cleanup=async()=>{if(created){await command('docker',['rm','-fv',name]);created=false}};
 try{
  await command('docker',['build','-f',new URL('../../../packages/db/Dockerfile.test',import.meta.url).pathname,'-t','asisteam-db165-test',new URL('../../../',import.meta.url).pathname]);
  await command('docker',['run','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'asisteam-db165-test']);created=true;
  for(let n=0;n<100;n++){try{await command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break}catch{if(n===99)throw new Error('fixture_not_ready');await new Promise(resolve=>setTimeout(resolve,100))}}
  const info=JSON.parse(await command('docker',['inspect',name]))[0],binding=info.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  const url='postgresql://postgres:'+password+'@127.0.0.1:'+binding.HostPort+'/postgres';
  owner=new pg.Client({connectionString:url});await owner.connect();await owner.query(await readFile(new URL('../../../packages/db/bootstrap.sql',import.meta.url),'utf8'));
  for(const role of ['asisteam_migrator','asisteam_api','asisteam_auth','asisteam_invitation','asisteam_jobs','asisteam_billing'])await owner.query('alter role '+role+' login password '+quote(password));
  deploy=new pg.Client({connectionString:url.replace('postgres:','asisteam_migrator:')});await deploy.connect();await migrate(deploy);
  assert.equal((await owner.query('select app_private.auth_is_native() as native')).rows[0].native,true);
  return {url,name,password,cleanup};
 }catch(error){await cleanup();throw error}finally{await deploy?.end();await owner?.end()}
}
export function fixtureConnection(role='postgres',password,database='postgres'){
 const result=new URL(process.env.TEST_DATABASE_URL);result.username=role;if(password)result.password=password;result.pathname='/'+database;return result.toString();
}
export async function runWithNativeDatabase(program,args,env={}){
 const fixture=await nativeBrowserDatabase();
 try{return await command(program,args,undefined,{...env,TEST_DATABASE_URL:fixture.url,INDEPENDENT_PG_TEST_URL:fixture.url})}finally{await fixture.cleanup()}
}
