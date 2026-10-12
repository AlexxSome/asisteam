import { defineConfig } from '@playwright/test';
import config from './playwright.regression.config';
export default defineConfig({ ...config, testMatch:'**/faults.spec.ts',testIgnore:[],outputDir:'.qa/fault-results',
 use:{...config.use,baseURL:'http://127.0.0.1:3130'},webServer:{...config.webServer,command:'node e2e/regression/fault-server.mjs',url:'http://127.0.0.1:3130/legal/2026-09-21'} });
