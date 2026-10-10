import {SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {fixtureSecret,fixtureIssuer} from './fixture-config.mjs';
export async function authFixture(){
 const secret=new TextEncoder().encode(fixtureSecret);
 return {issuer:fixtureIssuer,secret:fixtureSecret,
 async token(sub=randomUUID(),session=randomUUID(),overrides={},algorithm='HS256'){
  const now=Math.floor(Date.now()/1000);
  return new SignJWT({sub,session_id:session,iat:now,exp:now+900,iss:fixtureIssuer,aud:'asisteam-api',role:'service_role',group_id:randomUUID(),...overrides}).setProtectedHeader({alg:algorithm}).sign(secret);
 },async close(){}};
}
