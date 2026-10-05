import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { activity, email, groups, password, pendingName, roles, rosterName, wardName } from './data.mjs';
import { checkAccessibility, checkLayout, focusIsVisible, login, screenshot, visit } from './helpers';

for (const role of roles) {
  test(`@smoke rol ${role}: navegación, accesibilidad y permisos visibles`, async ({ page }, info) => {
    await login(page, role);
    await visit(page, `/groups/${groups.fifty}`);
    await checkLayout(page);
    await checkAccessibility(page, info);
    await page.getByRole('button', { name: 'Menú', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Navegación' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await focusIsVisible(page);
    expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
    if (role === 'admin' || role === 'multi') await expect(drawer.getByText('Gestión', { exact: true })).toBeVisible();
    else await expect(drawer.getByText('Gestión', { exact: true })).toHaveCount(0);
    if (role === 'multi') {
      await drawer.getByText('Asistencia y consulta', { exact: true }).click();
      await expect(drawer.getByRole('link', { name: 'Mi asistencia', exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Menú', exact: true })).toBeFocused();
    await screenshot(page, info, `${role}-375`);
  });
}


test('@smoke cambio de grupo conserva la sección autorizada', async ({ page }) => {
  await login(page, 'multi');
  await visit(page, `/groups/${groups.fifty}/activities`);
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Grupo activo').selectOption(groups.single);
  await expect(page).toHaveURL(`/groups/${groups.single}/activities`);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await checkLayout(page);
});

test('@smoke restricciones reales de ATHLETE y COACH', async ({ page, context }) => {
  await login(page, 'athlete');
  const denied = await page.goto(`/groups/${groups.fifty}/activities/${activity(groups.fifty)}/attendance`);
  expect(denied?.status()).toBe(403);
  await context.clearCookies();
  await login(page, 'coach');
  await visit(page, `/groups/${groups.fifty}/activities/${activity(groups.fifty)}/attendance`);
  await expect(page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li')).toHaveCount(50);
  await expect(page.getByRole('button', { name: /^Nota de / })).toHaveCount(0);
});

test('@smoke auth: labels, errores y recuperación sin cola offline', async ({ page, context }, info) => {
  await visit(page, '/login');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await checkAccessibility(page, info);
  await page.getByLabel('Email', { exact: true }).fill(email('admin'));
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('No pudimos conectar');
  await context.setOffline(false);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
});

test('@smoke asistencia: 0/1/50/500, búsqueda y menor pendiente', async ({ page }, info) => {
  await login(page, 'admin');
  for (const [kind, count] of [['empty', 0], ['single', 1], ['fifty', 50], ['large', 500]] as const) {
    const group = groups[kind];
    await visit(page, `/groups/${group}/activities/${activity(group)}/attendance`);
    await checkLayout(page);
    if (!count) {
      await expect(page.getByRole('heading', { name: 'Aún no hay deportistas para tomar asistencia' })).toBeVisible();
      continue;
    }
    await expect(page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li')).toHaveCount(Math.min(count, 50));
    await expect(page.getByText(pendingName, { exact: true })).toHaveCount(0);
    await page.getByLabel('Buscar deportista').fill('Sin coincidencias QA');
    await expect(page.getByRole('heading', { name: 'Sin resultados para esta búsqueda' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(page.getByLabel('Buscar deportista')).toBeFocused();
    if (count === 500) {
      await page.getByLabel('Buscar deportista').fill(rosterName(500));
      await expect(page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li')).toHaveCount(1);
      await expect(page.getByText(rosterName(500), { exact: true })).toBeVisible();
    }
  }
  await screenshot(page, info, 'nomina-grande-busqueda');
});

test('@smoke asistencia: confirmación teclado, processing, guardado y rollback offline', async ({ page, context }, info) => {
  await login(page, 'admin');
  await visit(page, `/groups/${groups.single}/activities/${activity(groups.single)}/attendance`);
  const markAll = page.getByRole('button', { name: 'Marcar todos como Presente' });
  await markAll.click();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(markAll).toBeFocused();
  const present = page.getByRole('button', { name: 'Presente', exact: true });
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/attendance', async route => {
    if (route.request().method() === 'POST') await paused;
    await route.continue();
  });
  await present.click();
  await expect(present).toBeDisabled();
  await expect(page.getByRole('status', { name: `Guardado de ${rosterName(1)}` })).toContainText('Guardando');
  release();
  await expect(present).toBeEnabled();
  await expect(present).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status', { name: `Guardado de ${rosterName(1)}` })).toContainText('Guardado');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Ausente', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Sin conexión: el cambio no se guardó');
  await expect(present).toHaveAttribute('aria-pressed', 'true');
  await context.setOffline(false);
  await page.reload();
  await expect(present).toHaveAttribute('aria-pressed', 'true');
  await checkAccessibility(page, info);
});

test('@smoke guardián: pupilo vigente y consentimiento', async ({ page }) => {
  await login(page, 'guardian');
  await visit(page, '/wards');
  await expect(page.getByText(wardName, { exact: true })).toBeVisible();
  await visit(page, `/groups/${groups.fifty}/members/consent`);
  await checkLayout(page);
});

test('@smoke logs: login y registro reales sin argumentos privados', async ({ page, context }) => {
  await login(page, 'admin');
  await context.clearCookies();
  await visit(page, '/register');
  await page.getByLabel('Nombre completo', { exact: true }).fill('QA120 Log Probe');
  await page.getByLabel('Email', { exact: true }).fill(email('admin'));
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('1990-01-01');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  // Existing synthetic account exercises the real action without sending email.
  await expect(page.getByRole('main').getByRole('alert')).toContainText('ya está registrado');
  await expect.poll(() => JSON.parse(readFileSync('.next/qa/log-check.json', 'utf8'))).toMatchObject({
    loginPost: true, registerPost: true, actionArguments: false, sensitivePayload: false, token: false,
  });
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`@extended superficies reales ${width}px`, async ({ page }, info) => {
    await login(page, 'admin');
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of Object.entries({
      group: `/groups/${groups.fifty}`, members: `/groups/${groups.fifty}/members`,
      activity: `/groups/${groups.fifty}/activities/new`, attendance: `/groups/${groups.fifty}/activities/${activity(groups.fifty)}/attendance`,
      reports: `/groups/${groups.fifty}/reports?period=season`, profile: '/profile',
      billing: `/groups/${groups.fifty}/billing`, announcements: `/groups/${groups.fifty}/announcements`,
      minor: `/groups/${groups.fifty}/members/new`, invitation: `/groups/${groups.fifty}/invitations/new`,
      qr: `/groups/${groups.fifty}/activities/${activity(groups.fifty)}/qr`,
    })) {
      await visit(page, route);
      await checkLayout(page);
      await screenshot(page, info, `${name}-${width}`);
    }
  });
}

test('@extended contraste, tablas, zoom CSS 200% y movimiento reducido', async ({ page }, info) => {
  await login(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit(page, `/groups/${groups.fifty}/reports?period=season`);
  await expect(page.getByRole('table', { name: /Asistencia por deportista/ })).toBeVisible();
  await expect(page.getByRole('table', { name: /Asistencia por deportista/ })).toContainText('77.8');
  await checkAccessibility(page, info);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await checkLayout(page);
  await screenshot(page, info, 'reports-css-zoom-200');
  // CSS zoom is additional evidence; native browser zoom is a manual gate.
});
