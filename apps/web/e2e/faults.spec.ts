import { test, expect } from './test';
import { checkAccessibility, checkLayout, login, screenshot } from './helpers';
import { flowGroup } from './local-fixtures.mjs';

test('carga real, error de servidor, recuperación y recurso no visible', async ({ page, request }, info) => {
  const mode = async (value: string) => {
    const response = await request.post(`http://127.0.0.1:54330/__qa/fault?mode=${value}`);
    expect(response.status()).toBe(204);
  };
  await login(page, 'admin');
  try {
    await mode('slow');
    await page.goto(`/groups/${flowGroup}/activities`, { waitUntil: 'commit' });
    await expect(page.getByRole('status')).toContainText('Cargando actividades');
    await expect(page.getByRole('region', { name: 'Cargando actividades…' })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('region', { name: 'Cargando actividades…' })).toHaveCount(0);
    await mode('error');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No pudimos cargar esta página' })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('QA_UNAVAILABLE');
    await checkLayout(page); await checkAccessibility(page, info);
    await screenshot(page, info, 'server-error');
    await mode('normal');
    await page.getByRole('button', { name: 'Volver a intentar' }).click();
    await expect(page.getByRole('heading', { name: 'No pudimos cargar esta página' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Actividades');
    await screenshot(page, info, 'server-recovered');
    const response = await page.goto('/groups/00000000-0000-4000-8000-000000000001');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Volver a mis grupos' })).toBeVisible();
    await checkLayout(page);
  } finally { await mode('normal'); }
});
