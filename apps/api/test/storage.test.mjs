import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAvatar, AVATAR_KEY, AvatarStorage } from '../dist/storage.js';
import { loadConfig, ConfigurationError } from '../dist/config.js';
const png=Buffer.from([137,80,78,71,13,10,26,10]);
test('avatar byte/type/size boundaries and safe server-only S3 configuration',()=>{
  validateAvatar(png,'image/png');
  for(const [bytes,type] of [[png,'image/jpeg'],[Buffer.alloc(0),'image/png'],[Buffer.alloc(2097153),'image/png'],[Buffer.from('<svg>'),'image/svg+xml']])assert.throws(()=>validateAvatar(bytes,type));
  assert.equal(AVATAR_KEY.test('../foreign/image.png'),false);
  const base={DATABASE_URL:'postgresql://runtime:synthetic@127.0.0.1/db'};
  assert.throws(()=>loadConfig({...base,S3_LOCAL_POLICY_ONLY:'1',S3_ENDPOINT:'https://a.test'}),ConfigurationError);
  assert.throws(()=>loadConfig({...base,NODE_ENV:'production',S3_LOCAL_POLICY_ONLY:'1',S3_ENDPOINT:'http://127.0.0.1:9000'}),ConfigurationError);
  assert.throws(()=>loadConfig({...base,S3_ACCESS_KEY_ID:'one'}),ConfigurationError);
  for(const endpoint of ['http://foreign.test','https://a.test/x','https://a.test?secret=x','https://user:pass@a.test'])assert.throws(()=>loadConfig({...base,S3_ENDPOINT:endpoint}),ConfigurationError);
  assert.throws(()=>loadConfig({...base,NODE_ENV:'production',S3_ENDPOINT:'http://127.0.0.1:9000'}),ConfigurationError);
});

test('production privacy gate requires owner-only ACL, enforced ownership and all public blocking flags',async()=>{
  const storage=new AvatarStorage(loadConfig({DATABASE_URL:'postgresql://runtime:synthetic@127.0.0.1/db',S3_AVATAR_BUCKET:'private-avatars'}));
  const good={acl:{Owner:{ID:'owner'},Grants:[{Grantee:{Type:'CanonicalUser',ID:'owner'}}]},ownership:{OwnershipControls:{Rules:[{ObjectOwnership:'BucketOwnerEnforced'}]}},blocking:{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}}};
  let values=structuredClone(good);
  storage.client.send=async command=>{switch(command.constructor.name){case 'GetBucketAclCommand':return values.acl;case 'GetBucketOwnershipControlsCommand':return values.ownership;case 'GetPublicAccessBlockCommand':return values.blocking;case 'GetBucketPolicyCommand':throw Object.assign(new Error(),{name:'NoSuchBucketPolicy'});default:throw new Error('unexpected command');}};
  await storage.assertPrivate();
  for(const flag of Object.keys(good.blocking.PublicAccessBlockConfiguration)){values=structuredClone(good);values.blocking.PublicAccessBlockConfiguration[flag]=false;await assert.rejects(storage.assertPrivate());}
  values=structuredClone(good);values.ownership.OwnershipControls.Rules[0].ObjectOwnership='ObjectWriter';await assert.rejects(storage.assertPrivate());
  values=structuredClone(good);values.acl.Grants.push({Grantee:{Type:'Group',URI:'public'}});await assert.rejects(storage.assertPrivate());
  storage.client.destroy();
});
