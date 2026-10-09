// Historical origin harness. Never imported by src or included in product dist.
import './legacy-src/build.mjs';
import { createApplication as product } from '../dist/application.js';
import { TokenVerifier } from '../dist/auth.js';
import { Database } from '../dist/database.js';
import { NativeAuth } from '../dist/native-auth.js';
import { InvitationsController } from '../dist/invitations.js';
import { TokenVerifier as OriginVerifier } from './.ci-legacy/auth.js';
import { Database as OriginDatabase } from './.ci-legacy/database.js';
import { NativeAuth as OriginAuth } from './.ci-legacy/native-auth.js';
import { InvitationsController as OriginInvitations } from './.ci-legacy/invitations.js';
export {loadConfig,ConfigurationError} from './.ci-legacy/config.js';
export {OriginVerifier as TokenVerifier, OriginDatabase};
export async function createApplication(config, logger) {
  const url=new URL(config.DATABASE_URL);
  if (config.NODE_ENV==='production'||!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Historical fixture requires a local nonproduction database');
  const app=await product(config,logger);
  app.get(TokenVerifier).verify=new OriginVerifier(config).verify.bind(new OriginVerifier(config));
  const db=app.get(Database);db.authenticated=OriginDatabase.prototype.authenticated.bind(db);db.ready=OriginDatabase.prototype.ready.bind(db);
  const auth=app.get(NativeAuth);auth.call=OriginAuth.prototype.call.bind(auth);
  const invitations=app.get(InvitationsController);invitations.createAccount=OriginInvitations.prototype.createAccount.bind(invitations);
  return app;
}
