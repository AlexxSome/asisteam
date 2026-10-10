import { randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';

// Every test has a distinct synthetic client. Native Auth rate limits remain
// enabled and are independently exercised by the backend security tests.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': `qa-${randomUUID()}` });
    await use(context);
  },
});
export { expect } from '@playwright/test';
