import {loadConfig} from '../dist/config.js';
import {fixtureConnection} from './native-browser-database.mjs';
export {fixtureConnection};
export const fixtureSecret='3'.repeat(64);
export const fixtureIssuer='https://synthetic-auth.example.test';
export function loadFixtureConfig(environment){
 const auth=new URL(environment.DATABASE_URL);auth.username='asisteam_auth';
 return loadConfig({NATIVE_AUTH_DATABASE_URL:auth.toString(),NODE_ENV:'test',NATIVE_AUTH_SECRET:fixtureSecret,NATIVE_AUTH_PROXY_SECRET:fixtureSecret,NATIVE_AUTH_ISSUER:fixtureIssuer,NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120',...environment});
}
