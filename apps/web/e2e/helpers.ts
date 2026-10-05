import { writeFileSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { email, password } from './data.mjs';

export async function visit(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `HTTP de ${path}`).toBe(200);
}

export async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email(role));
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function checkLayout(page: Page) {
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('main')).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll, 'Sin scroll horizontal de página').toBeLessThanOrEqual(dimensions.width + 1);
}

export async function checkAccessibility(page: Page, info: TestInfo) {
  // Measure settled colors, not an intermediate frame while primary/secondary
  // button colors are transitioning. Never wait for infinite progress spinners.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity,
    ).map(animation => animation.finished.catch(() => {})));
  });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  // Do not attach HTML/DOM snippets (they can contain form values).
  const issues = result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) }));
  const summary = JSON.stringify({ route: new URL(page.url()).pathname.replace(/\/invitations\/[^/]+/, '/invitations/[token]'),
    viewport: page.viewportSize(), violations: issues, incomplete: result.incomplete.map(rule => ({
    id: rule.id, nodes: rule.nodes.map(node => ({ target: node.target,
      checks: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, message: check.message })),
    })),
  })), contrast: result.passes.find(rule => rule.id === 'color-contrast')?.nodes.flatMap(node => node.any.filter(check => check.id === 'color-contrast').map(check => ({ ratio: check.data?.contrastRatio, foreground: check.data?.fgColor, background: check.data?.bgColor, expected: check.data?.expectedContrastRatio }))) }, null, 2);
  const path = info.outputPath(`axe-summary-${info.attachments.length + 1}.json`);
  writeFileSync(path, summary);
  await info.attach('axe-summary', { path, contentType: 'application/json' });
  expect(issues, 'axe: revisión automática acotada; no certifica WCAG').toEqual([]);
}

export async function screenshot(page: Page, info: TestInfo, name: string) {
  // Explicit capture after login only. Never include URL bars, QR or secrets.
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: !name.startsWith('attendance'), animations: 'disabled', style: 'nextjs-portal { visibility: hidden !important; }',
    mask: [page.locator('input[type="password"]'), page.locator('input[type="email"]'), page.locator('svg:visible'), page.getByText(/^QA12000[0-3]$/)],
  });
  await info.attach(name, { path, contentType: 'image/png' });
}

export async function focusIsVisible(page: Page) {
  expect(await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const box = el.getBoundingClientRect();
    const top = Math.max(0, box.top); const left = Math.max(0, box.left);
    const right = Math.min(innerWidth, box.right); const bottom = Math.min(innerHeight, box.bottom);
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return right > left && bottom > top && !!hit && (el.contains(hit) || hit.contains(el));
  }), 'El foco está visible y no lo tapa otro elemento').toBe(true);
}
