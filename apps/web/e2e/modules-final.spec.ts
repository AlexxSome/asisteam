import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { email, groups, id } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';
import { actor, activityType, flowGroup, prepareFlowGroup, quote, sql } from './local-fixtures.mjs';

test.beforeAll(() => prepareFlowGroup());

test('@extended QR: vencimiento, recuperación, éxito y segundo escaneo idempotente', async ({ page }, info) => {
  sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
    select id,'${flowGroup}','ATHLETE','ACTIVE',now()-interval '1 day' from public.users where email=${quote(email('athlete'))}
    on conflict(user_id,group_id,role) do nothing;`);
  const admin = await actor('admin');
  const created = await admin.operation('create_activity', { p_group_id: flowGroup, p_activity_type_id: activityType,
    p_title: 'QR QA final', p_starts_at: new Date(Date.now()-60000).toISOString(), p_ends_at: new Date(Date.now()+3600000).toISOString() });
  expect(created.error).toBeNull();
  const activityId = created.data;
  expect((await admin.operation('issue_activity_checkin_qr', { p_activity_id: activityId })).error).toBeNull();
  // Produce a correctly signed token for a past minute; never export the key.
  const expired = sql(`select app_private.qr_checkin_token(activity_id,secret,now()-interval '2 minutes') from app_private.qr_checkin_keys where activity_id='${activityId}'`);
  await login(page, 'athlete');
  await page.goto(`/check-in#activity_id=${activityId}&token=${expired}`);
  await expect(page.getByRole('heading', { name: 'QR vencido o no válido' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('0');
  let token = '';
  await expect.poll(async () => {
    const result = await admin.operation('issue_activity_checkin_qr', { p_activity_id: activityId });
    if (result.error) return false;
    token = result.data.token;
    return Date.parse(result.data.expires_at)-Date.parse(result.data.server_time)>5000;
  }, { timeout: 15000 }).toBe(true);
  await page.goto(`/check-in#activity_id=${activityId}&token=${token}`);
  await expect(page.getByRole('heading', { name: 'Llegada confirmada' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.goto(`/check-in#activity_id=${activityId}&token=${token}`);
  await expect(page.getByRole('heading', { name: 'Ya tenías un registro' })).toBeVisible();
  expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('1');
  await checkAccessibility(page, info);
});

test('@extended anuncios: publicar, editar, lectura GUARDIAN y borrador ante fallo de red', async ({ page, context }, info) => {
  const title = `Anuncio QA ${randomUUID().slice(0, 8)}`;
  await login(page, 'admin');
  await visit(page, `/groups/${flowGroup}/announcements`);
  await page.getByRole('button', { name: 'Publicar anuncio', exact: true }).click();
  const form = page.getByRole('form', { name: 'Publicar anuncio' });
  await expect(form.getByLabel('Título', { exact: true })).toBeFocused();
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('Contenido', { exact: true }).fill('Información sintética para la prueba local.');
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Publicar anuncio', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('No pudimos confirmar');
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue(title);
  await context.setOffline(false);
  await form.getByRole('button', { name: 'Publicar anuncio', exact: true }).click();
  const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(article).toBeVisible();
  await article.getByRole('button', { name: 'Editar anuncio', exact: true }).click();
  await article.getByLabel('Título', { exact: true }).fill(`${title} actualizado`);
  await article.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${title} actualizado`, exact: true })).toBeVisible();
  await checkAccessibility(page, info);
  await context.clearCookies();
  await login(page, 'guardian');
  await visit(page, `/groups/${flowGroup}/announcements`);
  await expect(page.getByRole('heading', { name: `${title} actualizado`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar anuncio', exact: true })).toHaveCount(0);
});

test('@extended perfil: validación, confirmación nativa y descarte sin persistir', async ({ page }) => {
  // Separate actor from the human pass (ADMIN), avoiding changes to its profile.
  await login(page, 'coach');
  await visit(page, '/profile');
  const name = page.getByLabel('Nombre completo', { exact: true });
  const initial = await name.inputValue();
  await page.getByLabel('Teléfono (opcional)', { exact: true }).fill('incorrecto');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByLabel('Teléfono (opcional)', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Teléfono (opcional)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Teléfono (opcional)', { exact: true }).fill('');
  await name.fill(`${initial} borrador`);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Descartar cambios del perfil' }).click();
  await expect(name).toHaveValue(`${initial} borrador`);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Descartar cambios del perfil' }).click();
  await expect(name).toHaveValue(initial);
  await page.reload();
  await expect(name).toHaveValue(initial);
});

test('@extended billing: confirmación cancelable y cupos; no se contacta al proveedor', async ({ page }, info) => {
  await login(page, 'admin');
  await visit(page, `/groups/${groups.fifty}/billing`);
  const cancel = page.getByRole('button', { name: 'Cancelar renovación', exact: true });
  await cancel.click();
  await expect(page.getByRole('button', { name: 'Volver', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cancel).toBeFocused();
  await expect(page.getByRole('button', { name: 'Confirmar cancelación', exact: true })).toHaveCount(0);
  await checkAccessibility(page, info);
});

test('@extended pupilos e historial: navegación GUARDIAN y ATHLETE a 320 px', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await login(page, 'guardian');
  for (const path of ['/wards', `/wards/${id(2001)}`, `/groups/${groups.fifty}/wards/${id(2001)}/history`, `/groups/${groups.fifty}/members/consent`]) {
    await visit(page, path); await checkLayout(page);
    await test.step(path, () => checkAccessibility(page, info));
  }
  await context.clearCookies();
  await login(page, 'athlete');
  for (const path of ['/me/history', `/groups/${groups.fifty}/me/history`]) {
    await visit(page, path); await checkLayout(page);
    await test.step(path, () => checkAccessibility(page, info));
  }
});
