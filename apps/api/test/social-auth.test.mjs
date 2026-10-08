import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {SocialAuth} from '../dist/social-auth.js';
import {loadConfig} from '../dist/config.js';
const config=()=>loadConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://api:synthetic@127.0.0.1/test',NATIVE_AUTH_DATABASE_URL:'postgresql://auth:synthetic@127.0.0.1/test',NATIVE_AUTH_SECRET:'synthetic-secret-'.repeat(4),NATIVE_AUTH_PROXY_SECRET:'synthetic-proxy-'.repeat(4),NATIVE_AUTH_ISSUER:'https://auth.example.test',NATIVE_AUTH_WEB_URL:'https://web.example.test',OAUTH_GOOGLE_CLIENT_ID:'google-client',OAUTH_GOOGLE_CLIENT_SECRET:'synthetic-google',OAUTH_APPLE_CLIENT_ID:'apple-client',OAUTH_APPLE_CLIENT_SECRET:'synthetic-apple'});
test('OIDC signed claims, fixed issuer/audience, nonce/state/browser binding, provider callbacks and PKCE',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'synthetic',alg:'RS256',use:'sig'};
 const calls=[],fetchCalls=[],original=globalThis.fetch;let expected,overrides={},badSignature=false;
 const auth={call:async(op,data)=>{calls.push({op,data});return {};},tokens:async()=>({access_token:'synthetic-access',refresh_token:'a'.repeat(64),expires_in:900})};
 const service=new SocialAuth(config(),auth);
 globalThis.fetch=async(url,init)=>{
   fetchCalls.push(String(url));
   if(String(url).includes('/certs')||String(url).includes('/keys'))return Response.json({keys:[jwk]});
   const body=new URLSearchParams(init.body);assert.equal(body.get('code'),'synthetic-code');assert.equal(body.get('redirect_uri'),'https://web.example.test/auth/callback/'+expected.provider);
   if(expected.provider==='google')assert.ok(body.get('code_verifier'));else assert.equal(body.get('code_verifier'),null);
   const claims={sub:'provider-user',email:expected.provider==='apple'?'synthetic@privaterelay.appleid.com':'synthetic@example.test',email_verified:true,nonce:expected.nonce,...overrides};
   const key=badSignature?(await generateKeyPair('RS256')).privateKey:privateKey;
   const token=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setIssuer(overrides.iss??expected.issuer).setAudience(overrides.aud??expected.audience).setIssuedAt().setExpirationTime('5m').sign(key);
   return Response.json({access_token:'provider-access',token_type:'Bearer',id_token:token});
 };
 try{
  for(const provider of ['google','apple']){
   const start=await service.start({provider,context:{invite_code:'ABCD1234'}}),url=new URL(start.authorization_url);
   expected={provider,issuer:provider==='google'?'https://accounts.google.com':'https://appleid.apple.com',audience:provider+'-client',nonce:url.searchParams.get('nonce')};
   assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('redirect_uri'),'https://web.example.test/auth/callback/'+provider);
   assert.ok(!start.transaction.includes('ABCD1234'));assert.equal(url.searchParams.get('code_challenge_method'),provider==='google'?'S256':null);
   assert.equal(url.searchParams.get('response_mode'),provider==='apple'?'form_post':null);
   const callback={provider,code:'synthetic-code',state:url.searchParams.get('state'),transaction:start.transaction};
   const count=fetchCalls.length;
   await assert.rejects(service.complete({...callback,state:'forged'}),{status:401});
   await assert.rejects(service.complete({...callback,provider:provider==='google'?'apple':'google'}),{status:401});
   await assert.rejects(service.complete({...callback,transaction:start.transaction.slice(0,-2)+'xx'}),{status:401});
   assert.equal(fetchCalls.length,count);
   for(const bad of [{nonce:'forged'},{iss:'https://attacker.example.test'},{aud:'another-client'},{email_verified:false}]){
     overrides=bad;await assert.rejects(service.complete(callback),{status:401});
   }
   overrides={};badSignature=true;await assert.rejects(service.complete(callback),{status:401});badSignature=false;
   const result=await service.complete(callback);assert.equal(result.context.invite_code,'ABCD1234');assert.equal(result.linked,false);
   const completion=calls.findLast(c=>c.op==='oauth_complete');assert.equal(completion.data.provider_subject,'provider-user');assert.equal(completion.data.provider,provider);
  }
  await assert.rejects(service.start({provider:'google',context:{}},{identity:{provider:'supabase'}}),{status:401});
  const identity={provider:'nest',authUserId:randomUUID(),sessionId:randomUUID()};await service.start({provider:'google',context:{}},{identity});
  assert.deepEqual(calls.findLast(c=>c.op==='oauth_begin').data.link,{subject_id:identity.authUserId,session_id:identity.sessionId});
 }finally{globalThis.fetch=original;}
});
test('OAuth configuration requires complete Auth and Apple HTTPS; only public flags escape',()=>{
 const complete=config();assert.deepEqual(new SocialAuth(complete,{}).availability(),{google:true,apple:true});
 assert.throws(()=>loadConfig({...complete,OAUTH_GOOGLE_CLIENT_SECRET:undefined}));
 assert.throws(()=>loadConfig({...complete,NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120'}));
});
