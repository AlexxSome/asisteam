// Synthetic browser fixture: isolated native authority, never switches source DB.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
export async function nativeBrowserDatabase(){
 const name='native_browser_'+randomUUID().replaceAll('-','');
 const base='postgresql://postgres:postgres@127.0.0.1:54322/';
 const root=new pg.Client({connectionString:base+'postgres'});await root.connect();
 const schema=execFileSync('docker',['exec','supabase_db_asisteam','pg_dump','-U','postgres','--schema-only','--no-owner',...['public','app_private','auth','storage'].flatMap(s=>['-n',s])],{encoding:'utf8',maxBuffer:64000000}).replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE (supabase_admin|supabase_auth_admin) [^\n]+;$/gm,'').replace(/^\\(?:un)?restrict .*$/gm,'');
 await root.query('create database '+name+' template template0');
 const db=new pg.Client({connectionString:base+name});
 try{
  await db.connect();await db.query('drop schema public;create schema extensions;create extension pgcrypto with schema extensions;');await db.query(schema);
  await db.query('insert into app_private.auth_authority(singleton) values(true)');
  await db.query("select app_private.auth_cutover('FREEZE')");await db.query('select app_private.import_auth_identities()');await db.query("select app_private.auth_cutover('ACTIVATE')");
  assert.equal((await db.query('select app_private.auth_is_native() as native')).rows[0].native,true);
 }catch(error){await root.query('drop database '+name+' with(force)');await root.end();throw error}finally{await db.end()}
 await root.end();
 return {url:base+name,async cleanup(){const owner=new pg.Client({connectionString:base+'postgres'});try{await owner.connect();await owner.query('drop database '+name+' with(force)')}finally{await owner.end()}}};
}
