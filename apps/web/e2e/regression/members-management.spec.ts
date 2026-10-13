import { test, expect } from './test';
import { groups } from './data.mjs';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';

for (const width of [375, 1440]) {
  test(`@extended UI-07 integrantes y gestión ${width}px`, async ({ page }, info) => {
    await login(page, 'admin');
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of Object.entries({
      members: 'members', pending: 'members/pending', guardian: 'guardians',
      managed: 'members/new', invitations: 'invitations/new',
      settings: 'settings', visibility: 'settings/visibility', types: 'activity-types',
    })) {
      await visit(page, `/groups/${groups.fifty}/${route}`);
      await checkLayout(page);
      await test.step(name, () => checkAccessibility(page, info));
      await screenshot(page, info, `ui177-${name}-${width}`);
    }
    await visit(page, `/groups/${groups.fifty}/members/pending?page=999`);
    await checkLayout(page);
    await page.getByRole('link', {name:'Volver a la primera página'}).click();
    await expect(page).toHaveURL(/page=1$/);
    await visit(page, `/groups/${groups.fifty}/guardians?page=999`);
    await checkLayout(page);
    await page.getByRole('link', {name:'Volver a la primera página'}).click();
    await expect(page).toHaveURL(/page=1$/);
    await visit(page, `/groups/${groups.fifty}/settings/visibility`);
    const nav=page.getByRole('navigation', {name:'Gestión del grupo'});
    await expect(nav.getByRole('link', {name:'Visibilidad'})).toHaveAttribute('aria-current','page');
    await nav.getByRole('link', {name:'Datos y código'}).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', {name:'Datos del grupo',exact:true})).toBeVisible();
  });
}
