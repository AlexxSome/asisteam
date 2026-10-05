import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/faults.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.next/qa/results',
  reporter: [['list'], ['html', { outputFolder: '.next/qa/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3120', browserName: 'chromium',
    viewport: { width: 375, height: 812 }, locale: 'es-CL', timezoneId: 'America/Santiago',
    reducedMotion: 'reduce', trace: 'off', video: 'off', screenshot: 'off',
  },
  webServer: {
    command: 'node e2e/server.mjs', url: 'http://127.0.0.1:3120/login',
    // Explicit opt-in for the supervised human pass on this same local QA server.
    reuseExistingServer: process.env.ASISTEAM_QA_REUSE === '1', timeout: 180_000, stdout: 'pipe', stderr: 'pipe',
  },
});
