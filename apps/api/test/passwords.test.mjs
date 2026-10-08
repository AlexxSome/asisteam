import assert from 'node:assert/strict';
import {test} from 'node:test';
import bcrypt from 'bcryptjs';
import {Passwords} from '../dist/passwords.js';

test('Argon2id parameters, distinct Unicode, supported legacy bcrypt and truncation boundary',async()=>{
 const passwords=new Passwords(),unicode='🧭áñ-日本語-very-long-synthetic-password';
 const hash=await passwords.hash(unicode);assert.match(hash,/^\$argon2id\$v=19\$/);for(const part of ['m=19456','t=2','p=1'])assert.ok(hash.split('$')[3].split(',').includes(part));
 assert.equal(await passwords.verify(hash,unicode),true);assert.equal(await passwords.verify(hash,unicode+'!'),false);assert.equal(passwords.needsRehash(hash),false);
 const legacy=await bcrypt.hash('Synthetic-bcrypt-password!',12);
 for(const prefix of ['2a','2b','2y']){const encoded=legacy.replace(/^\$2[a-z]\$/,`$${prefix}$`);assert.equal(await passwords.verify(encoded,'Synthetic-bcrypt-password!'),true);assert.equal(await passwords.verify(encoded,'wrong'),false);assert.equal(passwords.needsRehash(encoded),true);}
 const seventyTwo='é'.repeat(36),encoded=await bcrypt.hash(seventyTwo,4);
 assert.equal(await passwords.verify(encoded,seventyTwo),true);assert.equal(await passwords.verify(encoded,seventyTwo+'x'),false);
 for(const malformed of [null,'$2a$','$argon2id$synthetic','$argon2id$v=19$m=4294967295,t=2,p=1$xxx$xxx'])assert.equal(await passwords.verify(malformed,'password'),false);
 const wide=await passwords.hash('🧭'.repeat(40));assert.equal(await passwords.verify(wide,'🧭'.repeat(40)),true);
});
