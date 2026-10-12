import {createHash} from 'node:crypto';
import {fixtureSecret} from '../../../api/test/fixture-config.mjs';
import {sql} from './local-fixtures.mjs';
import { test as base } from '@playwright/test';

// Every test has a distinct synthetic client. Native Auth rate limits remain
// enabled and are independently exercised by the backend security tests.
export const test = base.extend({
  context: async ({ context }, use) => {
    // Rate security is tested by backend. Reset only this owned fixture's counters per scenario.
    const key=createHash('sha256').update(fixtureSecret+':login:ip:127.0.0.1').digest('hex');
    sql(`select app_private.auth_operation('rate_success','{"key":"${key}"}'::jsonb)`);
    await use(context);
  },
});
export { expect } from '@playwright/test';
