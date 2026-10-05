import { spawn } from 'node:child_process';

if (!process.env.INVITATION_PROXY_SECRET) throw new Error('Falta INVITATION_PROXY_SECRET del runtime Edge local. Ver docs/qa/issue-100.');
const modules = ['ACCOUNT_CONSENT', 'SIGN_OUT', 'GROUP', 'GUARDIANSHIP', 'ACTIVITY_TYPE',
  'WEEKLY_ACTIVITY', 'HISTORY', 'REPORT', 'MEMBER_MANAGEMENT', 'MANAGED_MEMBER',
  'MEMBERSHIP_REVIEW', 'WARD_HISTORY', 'SEND_INVITATION', 'INVITATION', 'CHECKIN', 'ANNOUNCEMENT', 'BILLING'];
const flags = Object.fromEntries(modules.map(name => [`RUN_${name}_INTEGRATION`, '1']));
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'integration.test.ts', '--maxWorkers=1', ...process.argv.slice(2)],
  { env: { ...process.env, ...flags }, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
