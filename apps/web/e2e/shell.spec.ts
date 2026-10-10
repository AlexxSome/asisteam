import { test, expect } from './test';
import { activity, groups } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';

test('@extended UI-02 shell: sidebar, breadcrumb, drawer, cuenta y reflow', async ({ page }, info) => {
  await login(page, 'multi');
  await visit(page, `/groups/${groups.fifty}/activities/${activity(groups.fifty)}/attendance`);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await checkLayout(page);
    const sidebar = page.getByRole('complementary', { name: 'Contexto y navegación' });
    const breadcrumb = page.getByRole('navigation', { name: 'Ruta de navegación' });
    await expect(breadcrumb).toContainText('Toma de asistencia');
    await expect(breadcrumb).not.toContainText(activity(groups.fifty));
    if (width >= 1024) {
      await expect(sidebar).toBeVisible();
      expect((await sidebar.boundingBox())?.width).toBe(256);
      await expect(sidebar.getByRole('link', { name: 'Asisteam', exact: true })).toBeVisible();
      await sidebar.getByText('Gestión', { exact: true }).click();
      await expect(sidebar.getByRole('link', { name: 'Visibilidad', exact: true })).toBeVisible();
      await sidebar.getByText('Gestión', { exact: true }).click();
    } else {
      await expect(sidebar).not.toBeVisible();
      const trigger = page.getByRole('button', { name: 'Menú', exact: true });
      await trigger.click();
      const drawer = page.getByRole('dialog', { name: 'Navegación' });
      await expect(drawer.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
    await checkAccessibility(page, info);
    if (width === 375 || width === 1440) {
      await page.screenshot({ path: info.outputPath(`shell-${width}.png`), fullPage: false, animations: 'disabled',
        style: 'nextjs-portal { visibility: hidden !important; }', mask: [page.locator('output')] });
    }
  }
  const account = page.getByRole('banner').locator('summary');
  await account.click();
  await expect(page.getByRole('navigation', { name: 'Mi cuenta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await checkLayout(page);
});
