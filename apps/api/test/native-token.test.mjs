import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {SignJWT} from 'jose';
import {TokenVerifier} from '../dist/auth.js';
import {loadConfig} from '../dist/config.js';
test('native JWT rejects wrong algorithm/key/audience, future or oversized lifetime and missing session',async()=>{
 const secret=randomBytes(32).toString('hex'),issuer='https://synthetic-auth.example.test',sub=randomUUID(),session=randomUUID(),now=Math.floor(Date.now()/1000);
 const verifier=new TokenVerifier(loadConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://asisteam_api:synthetic@127.0.0.1:54322/postgres',NATIVE_AUTH_DATABASE_URL:'postgresql://asisteam_auth:synthetic@127.0.0.1:54322/postgres',NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_ISSUER:issuer,NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120',NATIVE_AUTH_PROXY_SECRET:secret}));
 const signed=async(overrides={},alg='HS256',key=secret)=>new SignJWT({sub,session_id:session,iss:issuer,aud:'asisteam-api',iat:now,exp:now+900,...overrides}).setProtectedHeader({alg}).sign(new TextEncoder().encode(key));
 assert.equal((await verifier.verify('Bearer '+await signed())).provider,'nest');
 for(const token of [await signed({aud:'authenticated'}),await signed({iat:now+60,exp:now+900}),await signed({exp:now+901}),await signed({session_id:undefined}),await signed({},'HS384'),await signed({},'HS256',randomBytes(32).toString('hex'))])await assert.rejects(verifier.verify('Bearer '+token),error=>error.status===401);
});
