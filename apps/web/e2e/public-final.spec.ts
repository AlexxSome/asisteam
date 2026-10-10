import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { password } from './data.mjs';
import { checkAccessibility, checkLayout, visit } from './helpers';
import { quote, sql, recoveryToken, fixtureAccount } from './local-fixtures.mjs';

test('@extended acceso: páginas públicas, aceptación pendiente, bienvenida y recuperación real', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 320, height: 812 });
  for (const path of ['/login', '/register', '/forgot-password', '/legal/2026-09-21']) {
    await visit(page, path); await checkLayout(page);
    await test.step(path, () => checkAccessibility(page, info));
  }
  const address = `qa100-${randomUUID()}@qa100.example.test`;
  const created=fixtureAccount(address,password,'Persona QA sin grupos');
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
  const token=await recoveryToken(address);
  await page.goto(`/reset-password?token=${token}`);
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible();
  await checkLayout(page); await checkAccessibility(page, info);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(`${password}2`);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(`${password}2`);
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Tu contraseña fue actualizada');
  expect(new URL(page.url()).search).toBe('');
});
