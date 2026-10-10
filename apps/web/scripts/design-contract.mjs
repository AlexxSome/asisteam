import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const web = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(web, '../..');
const source = join(root, 'docs/design/issue-171');
const output = join(web, '.qa/design-contract');
const webRequire = createRequire(join(web, 'package.json'));
const coreRequire = createRequire(join(root, 'packages/core/package.json'));
const { build } = coreRequire('esbuild');
const tailwind = webRequire('@tailwindcss/postcss');
const postcss = createRequire(webRequire.resolve('@tailwindcss/postcss'))('postcss');
mkdirSync(output, { recursive: true });
await build({ entryPoints: [join(source, 'preview.tsx')], outfile: join(output, 'preview.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react/*', 'react-dom/*', 'next/*', 'zod', 'class-variance-authority', 'clsx', 'tailwind-merge'], jsx: 'automatic', alias: { '@': join(web, 'src'), '@asisteam/core': join(root, 'packages/core/src/index.ts') }, nodePaths: [join(web, 'node_modules')] });
const { Preview, variants } = webRequire(join(output, 'preview.cjs'));
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const cssInput = readFileSync(join(web, 'src/app/globals.css'), 'utf8') + `\n@source "${join(source, 'preview.tsx')}";\n` + readFileSync(join(source, 'preview.css'), 'utf8');
const css = (await postcss([tailwind({ base: root })]).process(cssInput, { from: join(web, 'src/app/globals.css') })).css;
for (const variant of variants) writeFileSync(join(output, `${variant}.html`), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asisteam · propuesta UI-01 · ${variant}</title><style>${css}</style></head><body>${renderToStaticMarkup(React.createElement(Preview, { variant }))}</body></html>`);
console.log('Propuesta generada: apps/web/.qa/design-contract/ready.html');

if (process.argv.includes('--verify')) {
  const { chromium } = webRequire('@playwright/test');
  const AxeBuilder = webRequire('@axe-core/playwright').default;
  const server = createServer((request, response) => {
    const name = request.url?.slice(1);
    if (!variants.some(variant => name === `${variant}.html`)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(readFileSync(join(output, name)));
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const measurements = [];
  try {
  const luminance = hex => {
    const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const token = name => cssInput.match(new RegExp(`--${name}: (#[a-f0-9]{6});`, 'i'))[1];
  const ratio = (a, b) => Number(((Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)).toFixed(2));
  const contrast = ['foreground', 'neutral', 'primary', 'warning', 'focus', 'input'].map(name => ({ pair: `${name}/surface`, ratio: ratio(token(name), token('surface')) }));
  contrast.push({ pair: 'warning/warning-subtle', ratio: ratio(token('warning'), token('warning-subtle')) });
  for (const entry of contrast) assert.ok(entry.ratio >= (['focus/surface', 'input/surface'].includes(entry.pair) ? 3 : 4.5), `${entry.pair}: contraste`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const variant of variants) for (const width of [320, 375, 768, 1024, 1440, 1536]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/${variant}.html`);
      assert.equal(await page.locator('h1').count(), 1, `${variant}/${width}: H1`);
      const measures = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, sidebar: document.querySelector('.sidebar').getBoundingClientRect().width, controls: [...document.querySelectorAll('a,button,select,summary')].filter(el => el.getClientRects().length && el.getBoundingClientRect().width > 1).map(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })) }));
      assert.ok(measures.page <= width, `${variant}/${width}: overflow global`);
      assert.ok(measures.controls.every(rect => rect.height >= 44 && rect.width >= 44), `${variant}/${width}: control menor de 44px`);
      if (width >= 1024) assert.equal(measures.sidebar, 256);
      if (!['loading', 'empty', 'error'].includes(variant)) {
        const sections = await page.locator('.dashboard > section').evaluateAll(items => items.map(item => ({ name: item.className, top: item.getBoundingClientRect().top })));
        assert.deepEqual(sections.map(item => item.name), ['activities', 'tasks', 'indicators', 'context', 'records', 'notice']);
        if (width < 1280) assert.ok(sections.every((item, index) => index === 0 || item.top >= sections[index - 1].top), `${variant}/${width}: orden móvil`);
      }
      const axe = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(axe.violations.map(item => item.id), [], `${variant}/${width}: axe`);
      measurements.push({ variant, width, status: 'PASS', pageWidth: measures.page, sidebar: measures.sidebar, minimumControlHeight: Math.min(...measures.controls.map(rect => rect.height)), minimumControlWidth: Math.min(...measures.controls.map(rect => rect.width)), axeIncomplete: axe.incomplete.map(item => item.id) });
      if (variant === 'ready' && [375, 1440].includes(width)) await page.screenshot({ path: join(output, `proposal-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/ready.html`);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').innerText(), 'Saltar al contenido');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'content');
    await page.locator('a[href="error.html"]').click();
    await page.getByRole('link', { name: 'Volver a intentar (demostración)' }).click();
    assert.ok(page.url().endsWith('/ready.html'));
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto(`${origin}/long-name.html`);
    await page.getByText('Menú y grupo', { exact: true }).click();
    assert.equal(await page.locator('.mobile-menu').getAttribute('open'), '');
    await page.getByRole('link', { name: 'Actividades', exact: true }).click();
    assert.ok(page.url().endsWith('#activities'));
    // Reflow proxy: viewport CSS width halves at 200%; this is not native browser zoom.
    await page.setViewportSize({ width: 720, height: 500 });
    await page.goto(`${origin}/long-name.html`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    writeFileSync(join(output, 'measurements.json'), JSON.stringify({ date: new Date().toISOString(), node: process.version, browser: browser.version(), sources: Object.fromEntries([join(source, 'preview.tsx'), join(source, 'preview.css'), join(web, 'src/app/globals.css'), fileURLToPath(import.meta.url)].map(path => [path.slice(root.length + 1), createHash('sha256').update(readFileSync(path)).digest('hex')])), environment: 'static-synthetic-chromium', checks: measurements, contrast, keyboard: 'PASS', retryNavigation: 'PASS', reflowProxy: 'PASS', nativeZoom: 'PENDING', screenReader: 'PENDING' }, null, 2) + '\n');
    console.log(`PASS: ${measurements.length} variantes/anchuras; axe, H1, reflow, controles, sidebar, teclado y reintento estático.`);
  } finally { try { await browser?.close(); } finally { await new Promise(resolveClose => server.close(resolveClose)); } }
}
