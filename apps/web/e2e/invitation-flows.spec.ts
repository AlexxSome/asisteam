import { test, expect } from './test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { password } from './data.mjs';
import { checkAccessibility, login } from './helpers';
import { flowGroup, localConfig, prepareFlowGroup, quote, sql, actor, lastEmail } from './local-fixtures.mjs';

// Uses the actual Nest invitation controller and synthetic email transport.
test.skip(process.env.RUN_INVITATION_E2E !== '1', 'Activar RUN_INVITATION_E2E=1 con Nest local');
test.beforeAll(() => prepareFlowGroup());
test.beforeEach(async ({ context }) => {
  localConfig(); // Guard: synthetic proxy identities are only sent to the local stack.
  // Isolate each browser's rate-limit budget without weakening the real limiter.
  const suffix = randomBytes(8).toString('hex').match(/.{4}/g)!.join(':');
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `2001:db8:0:0:${suffix}` });
});

async function issue(address: string) {
  const service=await actor('admin');
  const result=await service.http('invitations/send',{action:'send',group_id:flowGroup,email:address,role:'ATHLETE'});
  if(result.error)throw new Error('native_invitation_send_failed');
  const token=lastEmail().text.match(/\/invitations\/([a-f0-9]{64})/)[1];
  const hash=createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

test('@extended invitación: registro real, términos versionados y rechazo de replay', async ({ page, context }, info) => {
  const address = `qa100-${randomUUID()}@qa100.example.test`;
  const { token, hash } = await issue(address);
  await page.goto(`/invitations/${token}`);
  await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
  await checkAccessibility(page, info);
  await page.getByLabel('Email que recibió la invitación').fill(address);
  await page.getByLabel('Nombre completo', { exact: true }).fill('Adulto QA invitado');
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('1990-01-01');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Activar cuenta y aceptar' }).click();
  await expect.poll(() => new URL(page.url()).pathname === `/groups/${flowGroup}`).toBe(true);
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe('ACCEPTED');
  expect(sql(`select c.terms_version||':'||c.channel from public.account_consents c join public.users u on u.id=c.user_id where u.email=${quote(address)}`)).toBe('2026-09-21:INVITATION');
  await context.clearCookies();
  await page.goto(`/invitations/${token}`);
  await expect(page.getByRole('button', { name: 'Activar cuenta y aceptar' })).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText(/invitación.*(?:no|utilizada|disponible)/i);
});

test('@extended invitación: email ajeno no consume token y enlace vencido permite recuperarse', async ({ page, context }) => {
  const { token, hash } = await issue(`qa100-${randomUUID()}@qa100.example.test`);
  await login(page, 'athlete');
  await page.goto(`/invitations/${token}`);
  await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe('PENDING');
  sql(`update public.invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where token='${hash}'`);
  await context.clearCookies();
  await page.goto(`/invitations/${token}`);
  await expect(page.getByRole('main')).toContainText(/expir|venci/i);
  expect(sql(`select status from public.invitations where token='${hash}'`)).toBe('EXPIRED');
});
