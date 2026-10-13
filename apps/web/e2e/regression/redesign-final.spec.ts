import { test, expect } from './test';
import { roles } from './data.mjs';
import { prepareRedesignFixture } from './redesign-fixture.mjs';
import { sql } from './local-fixtures.mjs';
import { checkAccessibility, checkLayout, focusIsVisible, login, screenshot, visit } from './helpers';

for (const role of roles) {
  test(`@extended UI181 ${role}: seis anchuras, nombres largos y permisos del inicio`, async ({ page }, info) => {
    test.setTimeout(180000);
    const fixture = prepareRedesignFixture();
    await login(page, role);
    await visit(page, `/groups/${fixture.group}`);
    await expect(page.getByRole('main')).toContainText(fixture.groupName);
    const admin = ['admin', 'multi'].includes(role);
    await expect(page.getByRole('region', { name: 'Registros de la actividad', exact: true })).toHaveCount(admin ? 1 : 0);
    await expect(page.getByRole('region', { name: 'Mi asistencia', exact: true })).toHaveCount(['athlete', 'multi'].includes(role) ? 1 : 0);
    await expect(page.getByRole('region', { name: 'Mis pupilos', exact: true })).toHaveCount(role === 'guardian' ? 1 : 0);
    await expect(page.getByRole('link', { name: 'Tomar asistencia', exact: true })).toHaveCount(['admin', 'multi', 'coach'].includes(role) ? 1 : 0);
    if (['athlete', 'guardian'].includes(role)) await expect(page.getByRole('region', { name: 'Resumen del grupo', exact: true })).toHaveCount(0);
    if (admin) {
      await expect(page.getByRole('region', { name: 'Resumen de la actividad', exact: true })).toContainText('77,8 %');
      await expect(page.getByRole('region', { name: 'Indicadores del grupo', exact: true })).toContainText('20');
    }
    for (const width of [320, 375, 768, 1024, 1440, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      await checkLayout(page); await checkAccessibility(page, info);
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const takeAttendance = page.getByRole('link', { name: 'Tomar asistencia', exact: true });
      if (await takeAttendance.count()) {
        const box = await takeAttendance.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        await takeAttendance.focus(); await focusIsVisible(page);
      }
      if ([375, 1440, 1536].includes(width) || (role === 'athlete' && width === 320)) await screenshot(page, info, `ui181-${role}-${width}`);
    }
    if (role === 'admin') {
      await page.setViewportSize({ width: 375, height: 900 });
      await visit(page, `/groups/${fixture.group}/activities/${fixture.activity}/attendance`);
      await expect(page.getByRole('list', { name: 'Deportistas' }).locator(':scope > li')).toHaveCount(20);
      await expect(page.getByText('Menor UI181 pendiente sin consentimiento', { exact: true })).toHaveCount(0);
      await checkLayout(page); await checkAccessibility(page, info);
      await screenshot(page, info, 'ui181-attendance-20-375');
      expect(sql(`select count(*) from public.memberships where group_id='${fixture.group}' and role='ATHLETE' and status='ACTIVE'`)).toBe('20');
      await visit(page, `/groups/${fixture.empty}`);
      await expect(page.getByRole('main')).toContainText('Sin datos');
      await expect(page.getByRole('link', { name: 'Crear actividad', exact: true }).first()).toBeVisible();
      await checkLayout(page); await checkAccessibility(page, info);
      await screenshot(page, info, 'ui181-empty-null-375');
    }
  });
}
