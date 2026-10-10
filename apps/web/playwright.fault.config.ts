import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testMatch: '**/faults.spec.ts', testIgnore: [],
  outputDir: '.qa/fault-results',
  reporter: [['list']],
  use: { ...config.use, baseURL: 'http://127.0.0.1:3130' },
  webServer: { gracefulShutdown:{signal:'SIGTERM',timeout:10000}, command: 'node e2e/fault-server.mjs', url: 'http://127.0.0.1:3130/login',
    reuseExistingServer: false, timeout: 120_000, stdout: 'pipe', stderr: 'pipe' },
});
