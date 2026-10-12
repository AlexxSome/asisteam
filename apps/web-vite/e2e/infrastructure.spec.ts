import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ACCOUNT_TERMS_2026_09_21 as notice } from '@asisteam/core/browser';
import { email, password } from './data.mjs';

test('WEB09: todas las rutas permiten navegación directa; API/assets conservan errores y seguridad', async ({ request }) => {
  const artifact = JSON.parse(readFileSync('dist/release.json', 'utf8'));
  expect(artifact.paths).toHaveLength(40); // 39 páginas históricas + acción de salida Router.
  for (const pattern of artifact.paths) {
    const path = pattern.replace(/:[^/]+/g, '00000000-0000-0000-0000-000000000001');
    const response = await request.get(path, { headers: { Accept: 'text/html' } });
    expect(response.status(), pattern).toBe(200);
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
    if (!pattern.startsWith('/legal/')) expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
  }
  for (const path of ['/unknown', '/assets/missing-abcdefgh.js', '/assets/missing-abcdefgh.js.map', '/release.json', '/browser-modules.json', '/.vite/manifest.json', '/web-api/v1/not-found', '/api/v1/not-found']) {
    const response = await request.get(path, { headers: { Accept: 'text/html' } });
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toContain('<!doctype html>');
  }
  const privateImage = await request.get('/profile/avatar/00000000-0000-0000-0000-000000000001/missing.png');
  expect([401, 404]).toContain(privateImage.status());
  expect(privateImage.headers()['cache-control']).toBe('private, no-store');
  const entry = artifact.files.find((file: {path: string}) => /^assets\/index-.*\.js$/.test(file.path));
  const asset = await request.get('/' + entry.path);
  expect(asset.headers()['cache-control']).toContain('immutable');
  expect(createHash('sha256').update(await asset.body()).digest('hex')).toBe(entry.sha256);
  const legal = await request.get('/legal/2026-09-21');
  const html = await legal.text();
  for (const text of [notice.purpose, notice.minors, notice.visibility, notice.rights]) expect(html).toContain(text);
  expect(html).not.toContain('<script');
  expect(legal.headers()['set-cookie']).toBeUndefined();
  expect(legal.headers()['cache-control']).toContain('must-revalidate');
  const etag = legal.headers().etag;
  expect(etag).toBeTruthy();
  expect((await request.get('/legal/2026-09-21', { headers: { 'If-None-Match': etag! } })).status()).toBe(304);
});

test('WEB09: actualizar y restaurar frontend conserva sesión Nest viva y jamás revive logout', async ({ page, context }) => {
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email('first'));
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible();
    const session = (await context.cookies()).find(cookie => cookie.name === 'asisteam-web-session');
    expect(session?.httpOnly).toBe(true);
    writeFileSync('.qa/release-selection', 'current');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-release', 'current');
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible();
    expect((await context.cookies()).find(cookie => cookie.name === 'asisteam-web-session')?.value).toBe(session?.value);
    writeFileSync('.qa/release-selection', 'previous');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible();
    expect(await page.locator('html').getAttribute('data-release')).toBeNull();
    writeFileSync('.qa/release-selection', 'current');
    await page.reload();
    await page.getByText('Mi cuenta', { exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    writeFileSync('.qa/release-selection', 'previous');
    await page.goto('/groups');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect((await context.cookies()).find(cookie => cookie.name === 'asisteam-web-session')).toBeUndefined();
  } finally { writeFileSync('.qa/release-selection', 'previous'); }
});
