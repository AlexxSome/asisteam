import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../../api/dist/application.js';
import { loadConfig } from '../../api/dist/config.js';
import { SafeLogger } from '../../api/dist/logger.js';

/** Local QA only: one Nest runtime shares the same synthetic Supabase database. */
export async function startQaNest(config) {
  if (config.API_URL !== 'http://127.0.0.1:54321') throw new Error('QA Nest requiere el stack local.');
  const sql = statement => execFileSync('docker',['exec','-i','supabase_db_asisteam','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const previous = JSON.parse(sql("select json_build_object('login',rolcanlogin,'password',rolpassword) from pg_authid where rolname='asisteam_api';"));
  const password = randomUUID();
  let app, stopped = false;
  const stop = async () => {
    if (stopped) return; stopped = true;
    try { if(app)await app.close(); }
    finally {
      const old = previous.password === null ? 'null' : "'"+previous.password.replaceAll("'","''")+"'";
      sql('alter role asisteam_api '+(previous.login?'login':'nologin')+' password '+old+';');
    }
  };
  try {
    sql("alter role asisteam_api login password '"+password+"';");
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+password+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:config.API_URL+'/auth/v1',SUPABASE_AUTH_PUBLIC_KEY:config.ANON_KEY}),new SafeLogger(()=>{}));
    await app.listen(0,'127.0.0.1');
    return { env: { ASISTEAM_API_ORIGIN: await app.getUrl(), ASISTEAM_API_SUPABASE_URL: config.API_URL, ASISTEAM_TRANSPORT_GROUPS:'nest',ASISTEAM_TRANSPORT_PROFILE:'nest' }, stop };
  } catch(error) { await stop(); throw new Error('No se pudo iniciar Nest para QA.',{cause:error}); }
}
