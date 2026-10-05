import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { activity, groups } from './data.mjs';
import { checkAccessibility, checkLayout, focusIsVisible, login, visit } from './helpers';

test('@extended accesibilidad: resolver referencias del drawer, foco y contraste de símbolos', async ({ page }, info) => {
  await login(page, 'admin');
  await visit(page, `/groups/${groups.single}/activities/${activity(groups.single)}/attendance`);
  const trigger = page.getByRole('button', { name: 'Menú', exact: true });
  const controls = await trigger.getAttribute('aria-controls');
  expect(controls).toBeTruthy();
  const dialog = page.locator('dialog').filter({ has: page.getByRole('heading', { name: 'Navegación', includeHidden: true }) });
  await expect(dialog).toHaveAttribute('id', controls!);
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await checkAccessibility(page, info);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await focusIsVisible(page);

  const present = page.getByRole('button', { name: 'Presente', exact: true });
  if (await present.getAttribute('aria-pressed') !== 'true') await present.click();
  await expect(present).toHaveAttribute('aria-pressed', 'true');
  // aria-pressed is optimistic; measure/focus only after the write settles.
  await expect(present).toBeEnabled();
  const measurement = await present.evaluate(button => {
    const lum = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const style = getComputedStyle(button);
    const mark = button.querySelector('[aria-hidden="true"]')!;
    const markStyle = getComputedStyle(mark);
    const rect = button.getBoundingClientRect();
    return { symbol: mark.textContent, hiddenFromReader: mark.getAttribute('aria-hidden') === 'true',
      symbolContrast: ratio(markStyle.color, style.backgroundColor),
      borderContrast: ratio(style.borderTopColor, style.backgroundColor),
      foreground: markStyle.color, background: style.backgroundColor, border: style.borderTopColor,
      width: rect.width, height: rect.height };
  });
  expect(measurement.symbol).toBe('✓');
  expect(measurement.hiddenFromReader).toBe(true);
  expect(measurement.symbolContrast).toBeGreaterThanOrEqual(3);
  expect(measurement.borderContrast).toBeGreaterThanOrEqual(3);
  expect(measurement.width).toBeGreaterThanOrEqual(44);
  expect(measurement.height).toBeGreaterThanOrEqual(44);
  const path = info.outputPath('symbol-contrast.json');
  writeFileSync(path, JSON.stringify(measurement, null, 2));
  await info.attach('symbol-contrast', { path, contentType: 'application/json' });

  await present.focus();
  await page.keyboard.press('Tab');
  await focusIsVisible(page);
  const focus = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(focus.outline).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

test('@extended gestión y estados: páginas secundarias, reflow, labels y nombres accesibles', async ({ page }, info) => {
  await login(page, 'admin');
  await page.setViewportSize({ width: 320, height: 812 });
  const routes = [
    '/groups', '/groups/new', '/join', '/profile/birthdate-requests',
    `/groups/${groups.fifty}/settings`, `/groups/${groups.fifty}/settings/visibility`,
    `/groups/${groups.fifty}/activity-types`, `/groups/${groups.fifty}/guardians`,
    `/groups/${groups.fifty}/members/pending`, `/groups/${groups.fifty}/invitations/new?view=history`,
    `/groups/${groups.fifty}/activities/${activity(groups.fifty)}`,
    `/groups/${groups.fifty}/activities/${activity(groups.fifty)}/edit`,
  ];
  for (const path of routes) {
    await visit(page, path);
    await checkLayout(page);
    await test.step(path, () => checkAccessibility(page, info));
  }
});
