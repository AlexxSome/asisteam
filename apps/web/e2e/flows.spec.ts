import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { email, password, groups, activity, rosterName } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';
import { actor, activityType, flowCode, flowGroup, prepareFlowGroup, quote, sql } from './local-fixtures.mjs';

test.beforeAll(() => prepareFlowGroup());

test('@extended menor por código: registro, vínculo, consentimiento y aprobación ADMIN', async ({ page, context }, info) => {
  const name = `Menor QA ${randomUUID().slice(0, 8)}`;
  const address = `qa100-${randomUUID()}@qa100.example.test`;
  await visit(page, `/register?invite_code=${flowCode}`);
  await page.getByLabel('Nombre completo', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(address);
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('2011-06-15');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page).toHaveURL(/\/join\?code=/);
  await page.getByRole('button', { name: 'Unirme al grupo' }).click();
  await expect(page.getByRole('region', { name: 'Mis solicitudes guardadas' })).toBeVisible();
  const membership = () => sql(`select m.status from public.memberships m join public.users u on u.id=m.user_id where u.email=${quote(address)} and m.group_id='${flowGroup}' and m.role='ATHLETE'`);
  expect(membership()).toBe('PENDING');
  const minorId = sql(`select id from public.users where email=${quote(address)}`);
  expect(sql(`select count(*) from public.account_consents where user_id='${minorId}'`)).toBe('1');
  await context.clearCookies();
  await login(page, 'admin');
  await visit(page, `/groups/${flowGroup}/members/pending`);
  let review = page.getByRole('article', { name, exact: true });
  await expect(review.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled();
  await review.getByRole('link', { name: 'Vincular apoderado' }).click();
  await expect(page.getByLabel('Deportista menor de edad')).toHaveValue(minorId);
  await page.getByLabel('Nombre completo del apoderado').fill('Persona QA guardian');
  await page.getByLabel('Email del apoderado').fill(email('guardian'));
  await page.getByLabel('Vínculo con el menor').fill('Tutor');
  await page.getByRole('button', { name: 'Registrar y vincular apoderado' }).click();
  await expect(page.getByRole('status')).toContainText('Apoderado vinculado');
  await visit(page, `/groups/${flowGroup}/members/pending`);
  review = page.getByRole('article', { name, exact: true });
  await expect(review.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled();
  expect(membership()).toBe('PENDING');
  await context.clearCookies();
  await login(page, 'guardian');
  await visit(page, `/groups/${flowGroup}/members/consent?athlete=${minorId}`);
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(form.getByRole('button', { name: 'Guardar consentimiento de datos' })).toBeDisabled();
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Guardar consentimiento de datos' }).click();
  await expect.poll(membership).toBe('PENDING');
  await expect.poll(() => sql(`select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id where g.athlete_user_id='${minorId}' and c.consent_type='DATA_PROCESSING_MINOR' and c.revoked_at is null`)).toBe('1');
  await context.clearCookies();
  await login(page, 'admin');
  await visit(page, `/groups/${flowGroup}/members/pending`);
  await page.getByRole('article', { name, exact: true }).getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect.poll(membership).toBe('ACTIVE');
  await visit(page, `/groups/${flowGroup}/members?search=${encodeURIComponent(name)}`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await checkAccessibility(page, info);
});

test('@extended alta MANAGED: consentimiento activa membresía sin crear credenciales', async ({ page, context }) => {
  const name = `Gestionado QA ${randomUUID().slice(0, 8)}`;
  await login(page, 'admin');
  await visit(page, `/groups/${flowGroup}/members/new`);
  await page.getByLabel('Nombre completo', { exact: true }).fill(name);
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('2012-05-10');
  await page.getByLabel('Nombre completo del apoderado').fill('Persona QA guardian');
  await page.getByLabel('Email del apoderado').fill(email('guardian'));
  await page.getByLabel('Vínculo con el menor').fill('Tutor');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta gestionada' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil del menor guardado');
  const member = () => sql(`select m.status||':'||u.account_status||':'||(u.auth_user_id is null) from public.memberships m join public.users u on u.id=m.user_id where u.full_name=${quote(name)} and m.group_id='${flowGroup}'`);
  expect(member()).toBe('PENDING:MANAGED:true');
  await context.clearCookies();
  await login(page, 'guardian');
  await visit(page, `/groups/${flowGroup}/members/consent`);
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Consentir y activar membresía' }).click();
  await expect.poll(member).toBe('ACTIVE:MANAGED:true');
});

test('@extended serie: crear, editar futuras y preservar ocurrencia con asistencia', async ({ page }) => {
  const name = `Serie QA ${randomUUID().slice(0, 8)}`;
  const start = new Date(Date.now() + 7 * 86400000);
  const day = start.toISOString().slice(0, 10);
  const until = new Date(start.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  await login(page, 'admin');
  await visit(page, `/groups/${flowGroup}/activities/new`);
  await page.getByLabel('Título', { exact: true }).fill(name);
  await page.getByLabel('Tipo de actividad').selectOption(activityType);
  await page.getByLabel('Inicio', { exact: true }).fill(`${day}T18:00`);
  await page.getByLabel('Término', { exact: true }).fill(`${day}T19:00`);
  await page.getByLabel('Repetir semanalmente').check();
  await page.getByLabel(weekdays[start.getUTCDay()]!, { exact: true }).check();
  await page.getByLabel('Repetir hasta').fill(until);
  await page.getByRole('button', { name: 'Crear serie semanal' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const rows = JSON.parse(sql(`select jsonb_agg(to_jsonb(a) order by starts_at) from (select id,title,starts_at from public.activities where group_id='${flowGroup}' and title=${quote(name)}) a`));
  expect(rows).toHaveLength(3);
  const owner = sql(`select id from public.users where email=${quote(email('admin'))}`);
  const athlete = sql(`select id from public.memberships where group_id='${flowGroup}' and role='ATHLETE' and status='ACTIVE' limit 1`);
  // Seed only the recorded occurrence; the edit and its authorization are real UI/RPC.
  sql(`insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values('${rows[1].id}','${athlete}','PRESENT','${owner}')`);
  await page.getByRole('link', { name: 'Editar actividad', exact: true }).click();
  await page.getByLabel('Esta y las siguientes', { exact: true }).check();
  await page.getByLabel('Título', { exact: true }).fill(`${name} revisada`);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} revisada`);
  expect(sql(`select title from public.activities where id='${rows[1].id}'`)).toBe(name);
  expect(sql(`select count(*) from public.activities where id in ('${rows[0].id}','${rows[2].id}') and title=${quote(`${name} revisada`)}`)).toBe('2');
  expect(sql(`select status from public.attendance_records where activity_id='${rows[1].id}'`)).toBe('PRESENT');
});

test('@extended asistencia: lote y paginación conservan estados existentes', async ({ page }) => {
  const admin = await actor('admin');
  const created = await admin.rpc('create_activity', { p_group_id: groups.large, p_activity_type_id: activityType,
    p_title: 'Lote QA final', p_starts_at: new Date(Date.now()-3600000).toISOString(), p_ends_at: new Date().toISOString() });
  expect(created.error).toBeNull();
  const activityId = created.data;
  await login(page, 'admin');
  await visit(page, `/groups/${groups.large}/activities/${activityId}/attendance`);
  const first = page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li').first();
  await first.getByRole('button', { name: 'Ausente', exact: true }).click();
  await expect(first.getByRole('status')).toContainText('Guardado');
  await page.getByRole('button', { name: 'Marcar todos como Presente' }).click();
  await page.getByRole('button', { name: /Confirmar/ }).click();
  await expect.poll(() => sql(`select count(*) from public.attendance_records where activity_id='${activityId}' and status='PRESENT'`)).toBe('499');
  await page.getByRole('navigation', { name: 'Páginas de deportistas' }).getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText(rosterName(51), { exact: true })).toBeVisible();
  await page.getByLabel('Buscar deportista').fill(rosterName(500));
  await expect(page.getByRole('button', { name: 'Presente', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li').first().getByRole('button', { name: 'Ausente', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('@extended reportes: propios con toggles apagados y ausencia de datos ajenos', async ({ page, context }) => {
  for (const role of ['athlete', 'guardian']) {
    await context.clearCookies();
    await login(page, role);
    await visit(page, `/groups/${groups.fifty}/reports?period=season`);
    await checkLayout(page);
    await expect(page.getByRole('main')).toContainText('77.8');
    await expect(page.getByRole('main')).not.toContainText(rosterName(1));
  }
});
