import { randomUUID } from 'node:crypto';
import { test, expect } from './test';
import { email, groups } from './data.mjs';
import { activityType, quote, sql } from './local-fixtures.mjs';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';
import type { Page } from '@playwright/test';

const widths = [320, 375, 720, 1440];
async function checkTouchTargets(page: Page) {
  const heights = await page.getByRole('main').locator('button:visible, a:visible, summary:visible').evaluateAll(controls => controls.map(control => control.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
}

test('UI-10 muro editorial, destino del último anuncio y permisos por rol', async ({ page, context }, info) => {
  test.setTimeout(150000);
  const title = `Aviso sintético UI10 ${randomUUID()}`;
  const body = `Información del encuentro.\n\n${'TextoLargo'.repeat(16)}\n\nEste anuncio pertenece al grupo actual.`;
  let announcement: string | undefined;
  try {
    await login(page, 'admin'); await visit(page, `/groups/${groups.fifty}/announcements`);
    await page.getByRole('button', { name: 'Publicar anuncio', exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill(title); await page.getByLabel('Contenido', { exact: true }).fill(body);
    await page.getByRole('form', { name: 'Publicar anuncio', exact: true }).getByRole('button', { name: 'Publicar anuncio', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    announcement = sql(`select id from public.group_announcements where group_id='${groups.fifty}' and title=${quote(title)}`);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await visit(page, `/groups/${groups.fifty}`);
      const latest = page.getByRole('region', { name: 'Último anuncio', exact: true });
      await expect(latest).toContainText(title);
      const link = latest.getByRole('link', { name: 'Ver anuncios', exact: true });
      await expect(link).toHaveAttribute('href', `/groups/${groups.fifty}/announcements`); await link.click();
      const article = page.locator('[data-announcement]').filter({ hasText: title });
      await expect(article).toContainText(body);
      expect(await article.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('aside[aria-label="Opciones del muro"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
      await checkLayout(page); await checkTouchTargets(page); await checkAccessibility(page, info);
      if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-wall-${width}`);
    }
    for (const role of ['coach', 'athlete', 'guardian', 'multi']) {
      await context.clearCookies(); await page.setViewportSize({ width: 375, height: 900 }); await login(page, role);
      await visit(page, `/groups/${groups.fifty}/announcements`);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Publicar anuncio', exact: true })).toHaveCount(role === 'multi' ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Editar anuncio', exact: true })).toHaveCount(role === 'multi' ? 1 : 0);
      await page.getByText('Avisos de todos mis grupos', { exact: true }).click();
      await expect(page.getByText('No tienes dispositivos vinculados.', { exact: false })).toBeVisible();
      await checkLayout(page); await checkAccessibility(page, info);
    }
  } finally {
    if (announcement) sql(`delete from app_private.announcement_push_deliveries where announcement_id='${announcement}'; delete from public.group_announcements where id='${announcement}'`);
  }
});

test('UI-10 suscripción responsive: retorno sin pago, planes finitos e historial contenido', async ({ page }, info) => {
  test.setTimeout(150000);
  await login(page, 'admin');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await visit(page, `/groups/${groups.fifty}/billing?status=approved&payment_id=synthetic`);
    await expect(page.getByRole('region', { name: 'Estado del pago y renovación', exact: true })).toContainText('El regreso desde el checkout no confirma un pago ni habilita cupos');
    await expect(page.getByRole('region', { name: 'Historial de cobros', exact: true })).toContainText('Aún no hay cobros registrados');
    const plans = page.getByRole('region', { name: '1. Elige un plan', exact: true });
    for (const [plan, limit] of [['Equipo', '50'], ['Club', '200'], ['Academia', '1.000']]) {
      await expect(plans.getByRole('heading', { name: plan, exact: true }).locator('..').locator('..')).toContainText(`Hasta ${limit} deportistas activos`);
    }
    await expect(page.getByRole('main')).not.toContainText(/ilimitad|Plan Pro/);
    await checkLayout(page); await checkAccessibility(page, info);
    if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-billing-${width}`);
  }
  // Table presentation fixture only. Native backend tests separately prove
  // reconciliation/payment authority; this response never writes a paid ledger.
  await page.route(`**/web-api/v1/groups/${groups.fifty}/billing*`, async route => {
    const response = await route.fetch(); const billing = await response.json();
    const now = new Date().toISOString();
    await route.fulfill({ response, json: { ...billing, total_invoices: 2, invoices: [
      { id: randomUUID(), plan_name: 'Academia', amount_clp: 15990, due_at: now, status: 'PAID', paid_at: now },
      { id: randomUUID(), plan_name: 'Academia', amount_clp: 15990, due_at: now, status: 'PENDING', paid_at: null },
    ] } });
  });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 }); await page.reload();
    const table = page.getByRole('region', { name: 'Tabla de cobros', exact: true });
    await expect(table).toContainText('Sin pago confirmado'); await expect(table.getByRole('row')).toHaveCount(3);
    await table.focus(); await expect(table).toBeFocused();
    if (width <= 375) expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await checkLayout(page); await checkAccessibility(page, info);
    if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-invoices-${width}`);
  }
});

test('UI-10 QR responsive: contraste, apertura sin guardado y llegada propia sin token visible', async ({ page, context }, info) => {
  test.setTimeout(150000);
  const groupId = randomUUID(), activityId = randomUUID();
  const owner = sql(`select id from public.users where email=${quote(email('admin'))}`);
  const athlete = sql(`select id from public.users where email=${quote(email('athlete'))}`);
  const fresh = () => sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()) from app_private.qr_checkin_keys where activity_id='${activityId}'`);
  const scan = async (expired = false) => {
    await visit(page, '/check-in');
    await expect(page.getByRole('heading', { name: 'Necesitas el QR de la actividad' })).toBeVisible();
    const token = expired ? sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()-interval '60 seconds') from app_private.qr_checkin_keys where activity_id='${activityId}'`) : fresh();
    await page.evaluate(({ activityId, token }) => { window.location.hash = new URLSearchParams({ activity_id: activityId, token }).toString(); }, { activityId, token });
    await expect.poll(() => page.evaluate(() => window.location.hash === '')).toBe(true);
  };
  try {
    sql(`insert into public.groups(id,name,invite_code,created_by) values('${groupId}','Club QR UI10',${quote(randomUUID().replaceAll('-', '').slice(0, 8))},'${owner}');
      insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(user_id,group_id,role,status,joined_at) values('${owner}','${groupId}','ADMIN','ACTIVE',now()-interval '1 day'),('${athlete}','${groupId}','ATHLETE','ACTIVE',now()-interval '1 day');
      insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values('${activityId}','${groupId}','${activityType}','Entrenamiento QR UI10',now(),now()+interval '1 hour','${owner}')`);
    await login(page, 'admin');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 }); await visit(page, `/groups/${groupId}/activities/${activityId}/qr`);
      const svg = page.getByRole('region', { name: 'QR de asistencia', exact: true }).locator('svg'); await expect(svg).toBeVisible();
      expect(await svg.locator('path').evaluateAll(paths => paths.map(path => path.getAttribute('fill')))).toEqual(['#FFFFFF', '#000000']);
      const size = await svg.boundingBox(); expect(size!.width).toBeGreaterThanOrEqual(200); expect(size!.height).toBeGreaterThanOrEqual(200);
      const counter = page.getByText(/^Se renueva en \d+ s\./); await expect(counter).toBeVisible();
      expect(await counter.evaluate(el => el.closest('[role="status"], [role="alert"], [aria-live]') === null)).toBe(true);
      const settingsBefore = sql(`select row_to_json(s)::text from app_private.qr_checkin_settings s where group_id='${groupId}'`);
      const summary = page.getByText('Ajustes de QR de todo el grupo', { exact: true }); await summary.focus(); await page.keyboard.press('Enter');
      await expect(page.getByLabel('Abrir minutos antes del inicio')).toBeVisible();
      expect(sql(`select row_to_json(s)::text from app_private.qr_checkin_settings s where group_id='${groupId}'`)).toBe(settingsBefore);
      await summary.press('Enter'); await checkLayout(page); await checkTouchTargets(page); await checkAccessibility(page, info);
      if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-qr-${width}`);
    }
    await context.clearCookies(); await login(page, 'athlete');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 }); await scan();
      await expect(page.getByRole('heading', { name: width === 320 ? 'Llegada confirmada' : 'Ya tenías un registro', exact: true })).toBeVisible();
      expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('1');
      await checkLayout(page); await checkAccessibility(page, info);
      if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-receipt-${width}`);
      await scan(true); await expect(page.getByRole('heading', { name: 'QR vencido o no válido', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reintentar registro', exact: true })).toHaveCount(0);
      expect(await page.getByRole('main').locator('a').evaluateAll(links => links.every(link => !/token=|activity_id=/.test(link.getAttribute('href') ?? '')))).toBe(true);
      await checkLayout(page); await checkAccessibility(page, info);
      if ([375, 1440].includes(width)) await screenshot(page, info, `ui180-expired-${width}`);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/web-api/v1/me/check-in', async route => {
      await blocked;
      await route.fulfill({ status: 503, json: { error: { code: 'service_unavailable', message: 'Fallo sintético', details: {} } } });
    }, { times: 1 });
    await scan(); await expect(page.getByRole('status').filter({ hasText: 'Registrando tu llegada' })).toBeVisible();
    await screenshot(page, info, 'ui180-registering-375'); release();
    const retry = page.getByRole('button', { name: 'Reintentar registro', exact: true }); await expect(retry).toBeVisible();
    await checkLayout(page); await checkTouchTargets(page); await checkAccessibility(page, info); await screenshot(page, info, 'ui180-retry-375');
    await retry.click(); await expect(page.getByRole('heading', { name: 'Ya tenías un registro', exact: true })).toBeVisible();
    expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('1');
  } finally {
    sql(`delete from public.attendance_records where activity_id='${activityId}';delete from public.activities where id='${activityId}';delete from app_private.qr_checkin_settings where group_id='${groupId}';delete from public.memberships where group_id='${groupId}';delete from app_private.billing_legacy_groups where group_id='${groupId}';delete from public.groups where id='${groupId}'`);
  }
});
