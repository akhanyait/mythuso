import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* The public status page, checked against the file it claims to render.
 *
 * Everything here reads packages/catalog/capabilities.json rather than repeating any of it. That is
 * the whole point of the page and therefore the whole point of the test: if somebody adds a
 * sixteenth capability, softens a notice, or marks one connected, this spec follows the contract to
 * wherever it went and only fails if the page did not. A test carrying its own copy of the fifteen
 * sentences would be a sixteenth place for them to drift.
 *
 * Two of these assertions are about what the page must never do. A status page is the one surface
 * where the temptation to write a reassuring sentence is strongest — it is read by funders and
 * partners — and a health service that overstates its readiness is not a marketing problem. */

const contract = JSON.parse(readFileSync(new URL('../packages/catalog/capabilities.json', import.meta.url), 'utf8')) as {
  capabilities: { id: string; name: string; connected: boolean; notice: string; blockedBy: string[] }[];
  rules: { id: string; statement: string; why: string }[];
};
const { capabilities } = contract;
const connected = capabilities.filter(c => c.connected);
const notConnected = capabilities.filter(c => !c.connected);

test.beforeEach(async ({ page }) => { await page.goto('/status.html'); });

test('lists every capability in the contract, once each', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'What is switched on', level: 1 })).toBeVisible();
  await expect(page.locator('.status-row')).toHaveCount(capabilities.length);
  for (const c of capabilities) {
    const row = page.locator(`#${c.id}`);
    await expect(row, `${c.id} has no row on the status page`).toHaveCount(1);
    await expect(row.getByRole('heading', { name: c.name, level: 2 })).toBeVisible();
  }
});

test('says how many are connected, and the figure is the contract’s arithmetic', async ({ page }) => {
  await expect(page.locator('.status-count strong')).toHaveText(String(connected.length));
  await expect(page.locator('.status-count')).toContainText(`of ${capabilities.length} capabilities are connected`);
  await expect(page.locator('.status-state').filter({ hasText: /^Not connected$/ })).toHaveCount(notConnected.length);
  await expect(page.locator('.status-state.on')).toHaveCount(connected.length);
});

test('renders each notice and each blocker word for word', async ({ page }) => {
  for (const c of notConnected) {
    const row = page.locator(`#${c.id}`);
    await expect(row.locator('.status-notice'), `${c.id} does not show its notice`).toHaveText(c.notice);
    for (const blocker of c.blockedBy) await expect(row.locator('.status-blockers li').filter({ hasText: blocker })).toHaveCount(1);
  }
  /* A capability that is connected shows no notice at all — the sentence exists to be shown while
     something is not real, and a leftover one on a working feature is the mirror of the defect this
     contract was written to stop. */
  for (const c of connected) await expect(page.locator(`#${c.id} .status-notice`)).toHaveText(/^Connected\./);
});

test('carries the rule that says when a row may read Connected', async ({ page }) => {
  const rule = contract.rules.find(r => r.id === 'connected-needs-evidence')!;
  await expect(page.locator('.status-foot')).toContainText(rule.statement);
  await expect(page.locator('.status-foot')).toContainText(rule.why);
});

test('never claims MyThuso is ready, secure or compliant', async ({ page }) => {
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const claim of ['production-ready', 'production ready', 'popia-compliant', 'popia compliant', 'fully compliant', 'bank-grade', 'enterprise-grade', 'is secure']) {
    expect(text, `The status page says "${claim}". It is the one page that may not.`).not.toContain(claim);
  }
  /* Not a claim about copy: with nothing connected, the page has to say so in a sentence rather
     than leave it to a reader to total fifteen chips. */
  if (connected.length === 0) await expect(page.locator('.status-none')).toBeVisible();
});

test('is a page on its own, not the application wearing a status hat', async ({ page }) => {
  /* No shell. The point of a fifth entry is that somebody who suspects nothing works does not
     download a tab bar, a sidebar and four applications' screens to be told so. */
  for (const shell of ['.tabbar', '.topbar', '.workspace', '.chart-card', '.aurora']) {
    await expect(page.locator(shell), `${shell} reached the status entry — it is pulling the app in behind it`).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'About MyThuso' })).toHaveAttribute('href', '/landing.html');
});

test('holds together at 320px and at 200% zoom', async ({ page }) => {
  const start = page.viewportSize()!;
  for (const width of [320, Math.max(320, Math.round(start.width / 2))]) {
    await page.setViewportSize({ width, height: start.height });
    await page.waitForTimeout(80);
    const pixels = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pixels, `the status page scrolls sideways by ${pixels}px at ${width}px`).toBeLessThanOrEqual(1);
    /* Fifteen rows and their chips still all present at the narrowest width anybody reads this on. */
    await expect(page.locator('.status-row')).toHaveCount(capabilities.length);
  }
});
