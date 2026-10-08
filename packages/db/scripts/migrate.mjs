import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function migrate(client,directory=new URL('../migrations/',import.meta.url)) {
 await client.query('BEGIN');
 try {
  await client.query("select pg_advisory_xact_lock(hashtextextended('asisteam-schema',0))");
  const role=(await client.query("select current_user='asisteam_migrator' and not rolsuper and not rolbypassrls as safe from pg_roles where rolname=current_user")).rows[0];
  if(!role?.safe)throw new Error('deployment_role_required');
  await client.query('create schema if not exists db_migrations authorization asisteam_migrator');
  await client.query('create table if not exists db_migrations.ledger(name text primary key,sha256 text not null,applied_at timestamptz not null default now())');
  for(const name of (await readdir(directory)).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort()) {
   const content=await readFile(new URL(name,directory),'utf8'),hash=createHash('sha256').update(content).digest('hex');
   const row=(await client.query('select sha256 from db_migrations.ledger where name=$1',[name])).rows[0];
   if(row){if(row.sha256!==hash)throw new Error('migration_history_changed');continue;}
   await client.query(content);
   await client.query('insert into db_migrations.ledger(name,sha256) values($1,$2)',[name,hash]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const client=new pg.Client({connectionString:process.env.DB_DEPLOY_URL});
 try{if(!process.env.DB_DEPLOY_URL)throw new Error('deployment_connection_required');await client.connect();await migrate(client);console.log('database_migrations PASS');}
 catch{console.error('database_migrations FAIL');process.exitCode=1;}finally{await client.end();}
}
