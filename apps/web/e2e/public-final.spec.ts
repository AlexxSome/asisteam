import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { password } from './data.mjs';
import { checkAccessibility, checkLayout, visit } from './helpers';
import { localConfig, quote, sql } from './local-fixtures.mjs';

test('@extended acceso: páginas públicas, aceptación pendiente, bienvenida y recuperación real', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 320, height: 812 });
  for (const path of ['/login', '/register', '/forgot-password', '/legal/2026-09-21']) {
    await visit(page, path); await checkLayout(page);
    await test.step(path, () => checkAccessibility(page, info));
  }
  const config = localConfig();
  const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const address = `qa100-${randomUUID()}@qa100.example.test`;
  const created = await service.auth.admin.createUser({ email: address, password, email_confirm: true,
    user_metadata: { full_name: 'Persona QA sin grupos', birthdate: '1990-01-01' } });
  expect(created.error).toBeNull();
  await visit(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(address);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/accept-terms/);
  await checkLayout(page); await checkAccessibility(page, info);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Aceptar.*continuar/ }).click();
  await expect(page).toHaveURL(/\/welcome/);
  await checkLayout(page); await checkAccessibility(page, info);
  expect(sql(`select count(*) from public.account_consents c join public.users u on u.id=c.user_id where u.email=${quote(address)}`)).toBe('1');
  await context.clearCookies();
  const recovery = await service.auth.admin.generateLink({ type: 'recovery', email: address,
    options: { redirectTo: 'http://127.0.0.1:3120/reset-password' } });
  expect(recovery.error).toBeNull();
  if (!recovery.data.properties) throw new Error('No se generó el enlace local de recuperación');
  // Token only in memory; no email, trace, screenshot or URL assertion containing it.
  await page.goto(`/reset-password?token=${recovery.data.properties.hashed_token}`);
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible();
  await checkLayout(page); await checkAccessibility(page, info);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(`${password}2`);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(`${password}2`);
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Tu contraseña fue actualizada');
  expect(new URL(page.url()).search).toBe('');
});
