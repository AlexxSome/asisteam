import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import pg from 'pg';

// Operator-only maintenance tooling. Neither API nor worker receives these grants.
export const writers=['asisteam_migrator','asisteam_api','asisteam_jobs','asisteam_auth','asisteam_invitation','asisteam_billing'];
const identifier=value=>{assert.match(value,/^[a-z_][a-z_0-9]*$/);return '"'+value+'"';};
const tableName=value=>value.split('.').map(identifier).join('.');
const hash=value=>createHash('sha256').update(value).digest('hex');
const catalogSql=await readFile(new URL('./catalog.sql',import.meta.url),'utf8');
const expectedCatalog=JSON.parse(await readFile(new URL('../source-catalog.json',import.meta.url),'utf8'));
const expectedTables=expectedCatalog.rls.map(([schema,table])=>schema+'.'+table).sort();

export async function assertFrozen(client) {
 const db=(await client.query('select current_database() as name')).rows[0].name;
 const grants=(await client.query("select rolname,has_database_privilege(rolname,$1,'CONNECT') as allowed from pg_roles where rolname=any($2::text[])",[db,writers])).rows;
 const additional=(await client.query("select count(*)::int as n from pg_roles where rolcanlogin and not rolsuper and rolname<>current_user and has_database_privilege(rolname,$1,'CONNECT')",[db])).rows[0].n;
 if(grants.length!==writers.length||grants.some(row=>row.allowed)||additional|| (await client.query("select count(*)::int as n from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()",[db])).rows[0].n!==0)throw new Error('writers_not_frozen');
}

async function authorities(client) {
 for(const [table,mode] of [['auth_authority','NATIVE'],['billing_transport','NEST'],['majority_executor','WORKER'],['announcement_executor','WORKER']]){
  const rows=(await client.query('select mode from app_private.'+identifier(table))).rows;
  if(rows.length!==1||rows[0].mode!==mode)throw new Error('authority_not_ready');
 }
}

async function rowsSnapshot(client) {
 const actual=(await client.query("select schemaname||'.'||tablename as name from pg_tables where schemaname in ('public','app_private') order by 1")).rows.map(row=>row.name);
 assert.deepEqual(actual,expectedTables,'business_table_inventory_changed');
 const tables=[];
 for(const name of actual){
  const rows=(await client.query('select to_jsonb(t)::text as row from '+tableName(name)+' t order by to_jsonb(t)::text')).rows.map(row=>row.row);
  tables.push({name,rows,sha256:hash(rows.join('\n'))});
 }
 return tables;
}

export async function snapshotFrozen(client) {
 await client.query('begin isolation level repeatable read read only');
 try {
  await assertFrozen(client);await authorities(client);
  const catalog=(await client.query(catalogSql)).rows[0].jsonb_build_object;
  assert.deepEqual(catalog,expectedCatalog,'portable_catalog_required');
  const tables=await rowsSnapshot(client);
  const snapshot={version:1,catalog,tables};
  await client.query('commit');return snapshot;
 }catch(error){await client.query('rollback');throw error;}
}

async function invariants(client) {
 const fks=(await client.query(`select n.nspname as schema,c.relname as table,pn.nspname as parent_schema,p.relname as parent,
   x.confmatchtype as match,array(select a.attname::text from unnest(x.conkey) with ordinality k(id,pos) join pg_attribute a on a.attrelid=c.oid and a.attnum=k.id order by k.pos) as keys,
   array(select a.attname::text from unnest(x.confkey) with ordinality k(id,pos) join pg_attribute a on a.attrelid=p.oid and a.attnum=k.id order by k.pos) as parent_keys
   from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_class p on p.oid=x.confrelid join pg_namespace pn on pn.oid=p.relnamespace
   where x.contype='f' and n.nspname in ('public','app_private')`)).rows;
 for(const fk of fks){
  assert.equal(fk.match,'s','unsupported_foreign_key_match');
  const nonNull=fk.keys.map(key=>'c.'+identifier(key)+' is not null').join(' and ');
  const equal=fk.keys.map((key,i)=>'c.'+identifier(key)+'=p.'+identifier(fk.parent_keys[i])).join(' and ');
  const count=(await client.query('select count(*)::int as n from '+tableName(fk.schema+'.'+fk.table)+' c where '+nonNull+' and not exists(select 1 from '+tableName(fk.parent_schema+'.'+fk.parent)+' p where '+equal+')')).rows[0].n;
  if(count!==0)throw new Error('foreign_key_reconciliation_failed');
 }
 const badAttendance=(await client.query(`select count(*)::int as n from public.attendance_records r join public.memberships m on m.id=r.membership_id
   join public.activities a on a.id=r.activity_id where m.role<>'ATHLETE' or m.group_id<>a.group_id`)).rows[0].n;
 const badMinors=(await client.query(`select count(*)::int as n from public.memberships m join public.users u on u.id=m.user_id
   where m.role='ATHLETE' and m.status='ACTIVE' and (u.birthdate is null or (u.birthdate>app_private.chile_today()-interval '18 years'
   and not exists(select 1 from public.guardianships g join public.consents c on c.guardianship_id=g.id
   where g.athlete_user_id=u.id and g.status='ACTIVE' and c.consent_type='DATA_PROCESSING_MINOR' and c.revoked_at is null)))`)).rows[0].n;
 if(badAttendance||badMinors)throw new Error('domain_reconciliation_failed');
 return {foreignKeys:fks.length,attendance:true,minors:true};
}

export async function restoreFrozen(client,snapshot) {
 // Only a fresh baseline with no business history is eligible. Recovery never
 // replaces an existing writer: restore into a new quarantined database.
 if(snapshot.version!==1)throw new Error('snapshot_version');
 assert.deepEqual(snapshot.catalog,expectedCatalog,'snapshot_catalog_changed');
 assert.deepEqual(snapshot.tables.map(table=>table.name),expectedTables,'snapshot_tables_changed');
 for(const table of snapshot.tables){if(table.sha256!==hash(table.rows.join('\n')))throw new Error('snapshot_checksum_changed');for(const row of table.rows)JSON.parse(row);}
 let phase='target-preflight';
 await client.query('begin');
 try {
  await assertFrozen(client);
  if((await client.query('select rolsuper from pg_roles where rolname=current_user')).rows[0]?.rolsuper!==true)throw new Error('isolated_restore_operator_required');
  assert.deepEqual((await client.query(catalogSql)).rows[0].jsonb_build_object,expectedCatalog,'target_catalog_changed');
  const ledger=(await client.query('select name,sha256 from db_migrations.ledger order by name')).rows;
  if(ledger.length!==1||ledger[0].name!=='0001_baseline.sql'||ledger[0].sha256!==hash(await readFile(new URL('../migrations/0001_baseline.sql',import.meta.url))))throw new Error('target_migrations_changed');
  const seedCounts=new Map([['public.activity_types',4],['public.billing_plans',3],['app_private.auth_authority',1],['app_private.billing_transport',1],['app_private.majority_executor',1],['app_private.announcement_executor',1]]);
  const before=await rowsSnapshot(client);
  if(before.some(table=>table.rows.length!==(seedCounts.get(table.name)??0)))throw new Error('target_has_business_history');
  // Bulk copy must not re-run side effects or reorder import of cyclic FKs.
  // Replica is SET LOCAL, confined to this administrator's atomic restore;
  // CHECK/unique constraints stay active; every FK and R1 is checked below.
  await client.query("set local session_replication_role='replica'");
  await client.query('truncate '+expectedTables.map(tableName).join(','));
  phase='copy-rows';
  for(const table of snapshot.tables){
   const columns=(await client.query("select a.attname from pg_attribute a where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='' order by a.attnum",[table.name])).rows.map(row=>identifier(row.attname));
   for(const row of table.rows)await client.query('insert into '+tableName(table.name)+'('+columns.join(',')+') select '+columns.join(',')+' from jsonb_populate_record(null::'+tableName(table.name)+',$1::jsonb)',[row]);
  }
  await client.query("set local session_replication_role='origin'");
  phase='validate-invariants';
  await authorities(client);const validation=await invariants(client);
  assert.deepEqual(await rowsSnapshot(client),snapshot.tables,'restored_rows_changed');
  await client.query('commit');return {tables:snapshot.tables.length,rows:snapshot.tables.reduce((sum,table)=>sum+table.rows.length,0),...validation};
 }catch(error){error.cutoverPhase=phase;await client.query('rollback');throw error;}
}

export function deltaSummary(before,after) {
 return after.tables.filter((table,i)=>table.sha256!==before.tables[i].sha256).map(table=>({table:table.name,rows:table.rows.length}));
}

if(process.argv[1]===new URL(import.meta.url).pathname){
 let client;
 try {
  if(process.env.CUTOVER_ACK!=='isolated-target-all-writers-frozen')throw new Error('maintenance_ack_required');
  const [mode]=process.argv.slice(2),path=resolve(process.env.CUTOVER_SNAPSHOT_PATH??'');
  if(!['export','restore','verify'].includes(mode)||!process.env.CUTOVER_SNAPSHOT_PATH||!process.env.CUTOVER_OPERATOR_URL)throw new Error('configuration_required');
  if((await stat(dirname(path))).mode&0o077)throw new Error('snapshot_directory_not_private');
  client=new pg.Client({connectionString:process.env.CUTOVER_OPERATOR_URL});await client.connect();
  let result;
  if(mode==='export'){const snapshot=await snapshotFrozen(client),serialized=JSON.stringify(snapshot);if(Buffer.byteLength(serialized)>64_000_000)throw new Error('snapshot_too_large');await writeFile(path,serialized,{flag:'wx',mode:0o600});result={tables:snapshot.tables.length};}
  else {
   const file=await stat(path);if(file.mode&0o077||file.size>64_000_000)throw new Error('snapshot_not_private_or_too_large');
   const snapshot=JSON.parse(await readFile(path,'utf8'));
   if(mode==='restore')result=await restoreFrozen(client,snapshot);
   else {assert.deepEqual(await snapshotFrozen(client),snapshot);result={tables:snapshot.tables.length};}
  }
  console.log(JSON.stringify({status:'PASS',check:'frozen-database-'+mode,...result}));
 }catch{console.error(JSON.stringify({status:'FAIL',check:'frozen-database-transfer'}));process.exitCode=1;}
 finally{await client?.end();}
}
