import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../dist/index.js';

test('MIG-08 optional onboarding filters are omitted; false and defaults survive', async () => {
  let requests = 0;
  const api = new ApiClient({ origin: 'http://127.0.0.1:3001', accessToken: async () => 'synthetic', fetch: async url => {
    requests++;
    assert.equal(url.searchParams.has('athlete_user_id'), false);
    assert.equal(url.searchParams.has('membership_id'), false);
    assert.equal(url.searchParams.get('as_guardian'), 'false');
    assert.equal(url.searchParams.get('page'), '1');
    return new Response(JSON.stringify({data:[]}), {status:200});
  }});
  assert.deepEqual(await api.listMembershipOnboarding({query:{athlete_user_id:undefined,membership_id:undefined,as_guardian:false}}),{data:[]});
  assert.equal(requests,1);
});
