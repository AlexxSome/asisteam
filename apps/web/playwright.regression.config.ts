import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({ ...config, testDir:'./e2e/regression', testIgnore:['**/faults.spec.ts'],
 outputDir:'.qa/regression-results', use:{...config.use,baseURL:'http://127.0.0.1:3120'},
 webServer:{...config.webServer,command:'node e2e/regression/server.mjs',url:'http://127.0.0.1:3120/legal/2026-09-21'} });
