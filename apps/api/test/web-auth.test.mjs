import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webReturnPath,WebAuth} from '../dist/web-auth.js';
import {loadConfig} from '../dist/config.js';

test('WEB-02 retorno solo local y sin queries arbitrarias',()=>{
 for(const value of [null,'https://outside.test','//outside.test','/\\outside.test','/profile\r\nLocation:outside','/reset-password?token=private','/login?return_to=//outside.test'])assert.equal(webReturnPath(value),'/welcome');
 assert.equal(webReturnPath('/profile?private=discarded'),'/profile');
 assert.equal(webReturnPath('/join?code=ABCD1234'),'/join?code=ABCD1234');
 assert.equal(webReturnPath('/join?code=bad'),'/join');
});
test('WEB-02 proxy confía solo en peer exacto y exige una IP reescrita',()=>{
 const config={WEB_TRUSTED_PROXY_IPS:'127.0.0.1'};
 const service=new WebAuth(config,{}, {}, {});
 assert.equal(service.clientIp({socket:{remoteAddress:'10.0.0.9'},headers:{'x-forwarded-for':'192.0.2.1'}}),'10.0.0.9');
 assert.equal(service.clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'192.0.2.1'}}),'192.0.2.1');
 for(const value of [undefined,'bad','192.0.2.1, 192.0.2.2'])assert.throws(()=>service.clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':value}}));
});
test('WEB-02 fachada opt-in y proxy inválido fallan configuración',()=>{
 const environment={DATABASE_URL:'postgresql://fixture@127.0.0.1/db'};
 assert.equal(loadConfig(environment).WEB_AUTH_ENABLED,undefined);
 assert.throws(()=>loadConfig({...environment,WEB_AUTH_ENABLED:'1'}));
 assert.throws(()=>loadConfig({...environment,WEB_TRUSTED_PROXY_IPS:'0.0.0.0/0'}));
});
