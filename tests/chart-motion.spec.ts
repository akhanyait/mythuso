import { test, expect } from '@playwright/test';
import { goSection, openWorkspace } from './nav';

test.beforeEach(async ({ page }) => {
 // Slow the real browser animations so intermediate frames can be inspected reliably.
 await page.addInitScript(() => {
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
   const animation = animate.apply(this, args);
   animation.playbackRate = 0.1;
   return animation;
  };
 });
 await page.goto('/app/');
});

test('clinical marks animate without moving the reference range or changing readings', async ({ page }) => {
 await goSection(page, 'Health Passport');
 const chart = page.locator('.chart-card').first();
 await chart.scrollIntoViewIfNeeded();
 const line = chart.locator('.chart-line');
 await expect.poll(() => line.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
 const text = await chart.locator('.chart-value').innerText();
 const band = await chart.locator('.chart-band').boundingBox();
 const initial = await line.evaluate(el => getComputedStyle(el).strokeDashoffset);
 await expect.poll(() => line.evaluate(el => getComputedStyle(el).strokeDashoffset)).not.toBe(initial);
 expect(await chart.locator('.chart-value').innerText()).toBe(text);
 expect(await chart.locator('.chart-band').boundingBox()).toEqual(band);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => line.evaluate(el => el.getAnimations().length)).toBe(0);
 await expect(line).toHaveCSS('stroke-dashoffset', '0px');
 await chart.getByRole('button', { name: 'Show readings as a table' }).click();
 await expect(chart.getByRole('table')).toBeVisible();
 expect(await chart.locator('.chart-value').innerText()).toBe(text);
});

test('dashboard mini bars animate and settle when reduced motion is enabled', async ({ page }) => {
 const bars = page.locator('.reading-plot').first();
 await bars.scrollIntoViewIfNeeded();
 await expect.poll(() => bars.evaluate(el => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
 const values = await page.locator('.health-overview').innerText();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => bars.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
 expect(await page.locator('.health-overview').innerText()).toBe(values);
 await expect(bars.locator('i').first()).toHaveCSS('transform', 'none');
});

test('charts added after navigation stay complete under reduced motion', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await goSection(page, 'Health Passport');
 const chart = page.locator('.chart-card').first();
 await chart.scrollIntoViewIfNeeded();
 await expect(chart.locator('.chart-line')).toBeVisible();
 expect(await chart.locator('.chart-plot').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
 await chart.getByRole('button', { name: 'Show readings as a table' }).click();
 await expect(chart.getByRole('table')).toBeVisible();
});

test('a lazily loaded nurse workspace animates earnings and replays only when the data changes', async ({ page }) => {
 await openWorkspace(page, 'Nurse');
 await goSection(page, 'Earnings & payouts');
 const chart = page.locator('.earn-bar');
 await chart.scrollIntoViewIfNeeded();
 await expect.poll(() => chart.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(3);
 await page.getByLabel('Show the split for').selectOption('senior');
 await expect(page.locator('.earn-legend')).toContainText('R 299');
 await expect.poll(() => chart.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(3);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => chart.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
 await expect(page.locator('.earn-legend')).toContainText('R 299');
});
