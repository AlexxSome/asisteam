import { test, expect } from './test';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';

test('UI-09 acceso público: cabecera, soporte, formulario y reflow sin navegación privada', async ({ page }, info) => {
  test.setTimeout(150000);
  for (const width of [320, 375, 720, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/legal/2026-09-21', '/invitations/unavailable']) {
      await visit(page, path);
      await checkLayout(page); await checkAccessibility(page, info);
      await expect(page.getByRole('link', { name: 'Ayuda y soporte', exact: true })).toHaveAttribute('href', /^mailto:soporte@asisteam\.cl\?subject=/);
      await expect(page.getByRole('navigation', { name: 'Espacio personal' })).toHaveCount(0);
      expect(await page.getByRole('heading', { level: 1 }).evaluate(el => el.closest('section')!.getBoundingClientRect().width)).toBeLessThanOrEqual(672);
      if ([375, 1440].includes(width) && ['/login', '/register', '/legal/2026-09-21'].includes(path)) await screenshot(page, info, `ui179-${path.slice(1).replaceAll('/', '-')}-${width}`);
    }
  }
});

test('UI-09 grupos, primer paso y perfil conservan contexto e identidad en móvil y escritorio', async ({ page }, info) => {
  test.setTimeout(150000);
  await login(page, 'admin');
  for (const width of [320, 375, 720, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/groups', '/groups/new', '/join', '/profile', '/profile/birthdate-requests']) {
      await visit(page, path);
      await checkLayout(page); await checkAccessibility(page, info);
      if (path === '/groups') {
        const groupLinks = page.getByRole('main').getByRole('link', { name: /^Abrir grupo · / });
        expect(await groupLinks.count()).toBeGreaterThan(0);
        for (const link of await groupLinks.all()) {
          await expect(link).toHaveAttribute('href', /^\/groups\/[0-9a-f-]{36}$/);
          await expect(link.locator('..')).toContainText('Roles:');
        }
        await expect(page.getByRole('heading', { name: 'Mi agenda global', exact: true })).toBeVisible();
        await expect(page.getByRole('main')).toContainText('America/Santiago');
      } else if (path === '/profile') {
        const name = await page.getByLabel('Nombre completo', { exact: true }).inputValue();
        await expect(page.getByRole('img', { name: `Iniciales de ${name}`, exact: true })).toBeVisible();
        await page.getByRole('main').getByRole('link', { name: 'Consultar ayuda y soporte', exact: true }).click();
        await expect(page).toHaveURL(/\/profile#privacy$/);
        await expect(page.getByRole('heading', { name: 'Privacidad y soporte', exact: true })).toBeInViewport();
        await expect(page.getByRole('link', { name: 'Solicitar supresión de datos', exact: true })).toHaveAttribute('href', /^mailto:/);
      } else if (path === '/groups/new') {
        await expect(page.getByRole('main')).toContainText('Comienza con 0 cupos');
        await expect(page.getByRole('main')).toContainText('primer pago aprobado');
      } else if (path === '/join') {
        await page.getByRole('button', { name: 'Unirme al grupo', exact: true }).click();
        const input = page.getByLabel('Código de invitación', { exact: true });
        await expect(input).toBeFocused();
        await expect(input).toHaveAttribute('aria-describedby', /code-error/);
        await expect(page.locator('#code-error')).toContainText('Revisa este campo');
      }
      if ([375, 1440].includes(width) && ['/groups', '/profile', '/groups/new', '/join'].includes(path)) await screenshot(page, info, `ui179-${path.slice(1).replaceAll('/', '-')}-${width}`);
    }
  }
});
