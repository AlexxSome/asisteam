import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storageFixture } from '../../api/test/storage-fixture.mjs';
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
  let app, edge, edgeDir, stopPromise, storage;
  const withStorage=process.env.ASISTEAM_QA_STORAGE === "1";
  const invitations = process.env.ASISTEAM_QA_INVITATIONS === "1";
  const proxySecret = "qa-invitation-proxy-"+randomUUID(), bridgeSecret = "qa-invitation-bridge-"+randomUUID();
  const previousInvitation = invitations ? JSON.parse(sql("select json_build_object('login',rolcanlogin,'password',rolpassword) from pg_authid where rolname='asisteam_invitation';")) : null;
  const stop = () => stopPromise ??= (async () => {
    // Restore credentials before awaiting HTTP shutdown: Playwright can kill the
    // web-server group while keep-alive sockets drain.
    if(previousInvitation){const oldInvitation=previousInvitation.password===null?'null':"'"+previousInvitation.password.replaceAll("'","''")+"'";sql('alter role asisteam_invitation '+(previousInvitation.login?'login':'nologin')+' password '+oldInvitation+';');}
    const old = previous.password === null ? 'null' : "'"+previous.password.replaceAll("'","''")+"'";
    sql('alter role asisteam_api '+(previous.login?'login':'nologin')+' password '+old+';');
    try { if(app)await app.close(); }
    finally {
      if(edge?.pid){try{process.kill(-edge.pid,'SIGTERM');}catch{/* Already stopped. */}await new Promise(resolve=>setTimeout(resolve,500));try{process.kill(-edge.pid,'SIGKILL');}catch{/* Already stopped. */}}
      if(storage){storage.storage.client.destroy();storage.stop();}
      if(edgeDir)rmSync(edgeDir,{recursive:true,force:true});

    }
  })();
  try {
    sql("alter role asisteam_api login password '"+password+"';");
    if(invitations){
      sql("alter role asisteam_invitation login password '"+password+"';");
      edgeDir=mkdtempSync(join(tmpdir(),'asisteam-qa-invitation-'));writeFileSync(edgeDir+'/env',`INVITATION_AUTH_BRIDGE_SECRET=${bridgeSecret}\n`,{mode:0o600});
      let ready=false;edge=spawn('pnpm',['exec','supabase','functions','serve','invitation-auth','--env-file',edgeDir+'/env'],{cwd:new URL('../../../',import.meta.url),detached:true,stdio:['ignore','pipe','pipe']});
      for(const stream of [edge.stdout,edge.stderr])stream.on('data',chunk=>{ready||=/Serving functions/i.test(chunk.toString());});
      const deadline=Date.now()+90000;while(!ready&&Date.now()<deadline&&edge.exitCode===null)await new Promise(resolve=>setTimeout(resolve,100));if(!ready)throw new Error('Bridge QA no disponible.');
    }
    if(withStorage)storage=await storageFixture();
    app=await createApplication(loadConfig({...storage?.config,DATABASE_URL:'postgresql://asisteam_api:'+password+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:config.API_URL+'/auth/v1',SUPABASE_AUTH_PUBLIC_KEY:config.ANON_KEY,...(invitations?{INVITATION_DATABASE_URL:"postgresql://asisteam_invitation:"+password+"@127.0.0.1:54322/postgres",INVITATION_PROXY_SECRET:proxySecret,INVITATION_AUTH_BRIDGE_SECRET:bridgeSecret,HTTP_TIMEOUT_MS:"30000"}:{})}),new SafeLogger(()=>{}));
    await app.listen(0,'127.0.0.1');
    return { env: { ASISTEAM_API_ORIGIN: await app.getUrl(), ASISTEAM_API_SUPABASE_URL: config.API_URL, ASISTEAM_TRANSPORT_GROUPS:'nest',ASISTEAM_TRANSPORT_PROFILE:'nest',ASISTEAM_TRANSPORT_MEMBERS:'nest',ASISTEAM_TRANSPORT_ACTIVITIES:'nest',ASISTEAM_TRANSPORT_ATTENDANCE:'nest',ASISTEAM_TRANSPORT_REPORTS:'nest',ASISTEAM_TRANSPORT_ANNOUNCEMENTS:'nest',ASISTEAM_TRANSPORT_BILLING:'nest',ASISTEAM_TRANSPORT_QR:'nest',...(withStorage?{ASISTEAM_TRANSPORT_STORAGE:'nest'}:{}),...(invitations?{ASISTEAM_TRANSPORT_INVITATIONS:'nest',INVITATION_PROXY_SECRET:proxySecret,ASISTEAM_API_TIMEOUT_MS:'30000'}:{}) }, stop };
  } catch(error) { await stop(); throw new Error('No se pudo iniciar Nest para QA.',{cause:error}); }
}
