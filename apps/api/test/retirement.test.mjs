import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {SignJWT} from 'jose';
import {loadConfig,ConfigurationError} from '../dist/config.js';
import {TokenVerifier} from '../dist/auth.js';
import {isVerifiedIdentity} from '../dist/identity.js';
const secret=randomBytes(32).toString('hex');
const environment={NODE_ENV:'test',DATABASE_URL:'postgresql://asisteam_api:synthetic@127.0.0.1:5432/synthetic',NATIVE_AUTH_DATABASE_URL:'postgresql://asisteam_auth:synthetic@127.0.0.1:5432/synthetic',NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://native.example.test',NATIVE_AUTH_WEB_URL:'https://web.example.test'};
test('production requires complete native configuration and rejects retired issuer/key/bridge',()=>{
 assert.throws(()=>loadConfig({NODE_ENV:'production',DATABASE_URL:environment.DATABASE_URL}),ConfigurationError);
 assert.equal(loadConfig({...environment,NODE_ENV:'production'}).NATIVE_AUTH_ISSUER,environment.NATIVE_AUTH_ISSUER);
 for(const name of ['SUPABASE_AUTH_URL','SUPABASE_AUTH_PUBLIC_KEY','INVITATION_AUTH_BRIDGE_SECRET'])assert.throws(()=>loadConfig({...environment,[name]:'synthetic'}),error=>error instanceof ConfigurationError&&error.fields.includes(name));
});
test('native-only verifier seals identity without HTTP and rejects legacy/malformed tokens',async()=>{
 const verifier=new TokenVerifier(loadConfig(environment)),now=Math.floor(Date.now()/1000);
 const claims={sub:randomUUID(),session_id:randomUUID(),iat:now,exp:now+900,iss:environment.NATIVE_AUTH_ISSUER,aud:'asisteam-api'};
 const token=async overrides=>new SignJWT({...claims,...overrides}).setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(secret));
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Verifier must not contact GoTrue/JWKS')};
 try{
  const identity=await verifier.verify('Bearer '+await token({}));assert.equal(isVerifiedIdentity(identity),true);assert.equal(identity.provider,'nest');assert.ok(Object.isFrozen(identity));
  for(const overrides of [{iss:'https://origin.example.test/auth/v1'},{aud:'authenticated'},{session_id:'invalid'},{exp:now+901},{iat:now+60},{exp:now-1}])await assert.rejects(verifier.verify('Bearer '+await token(overrides)),error=>error.getStatus()===401);
  for(const header of [undefined,'Basic synthetic','Bearer bad'])await assert.rejects(verifier.verify(header),error=>error.getStatus()===401);
 }finally{globalThis.fetch=originalFetch}
});
