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

test('dashboard trends animate and settle when reduced motion is enabled', async ({ page }) => {
 /* The home's mini bars became the trend tabs of the identity restyle (28 September 2026): a line drawn once
    on reveal from the readings on record. The promise is the same — it moves once, the figures never do, and
    a reader who asked for stillness gets the finished line. */
 const chart = page.locator('.pd-trend').first();
 await chart.scrollIntoViewIfNeeded();
 await expect.poll(() => chart.evaluate(el => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
 const values = await page.locator('.pd-metric').allInnerTexts();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => chart.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
 expect(await page.locator('.pd-metric').allInnerTexts()).toEqual(values);
 await expect(chart.locator('.pd-trend__line').first()).toHaveCSS('stroke-dashoffset', '0px');
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

/* The clinical deck — the ring, the dial, the day and the bars a nurse and a doctor now open the
   workspace on. Two properties, and they are the same two the charts above are held to: a mark may
   draw itself, and a reader who has asked for stillness gets the finished drawing rather than an
   empty one. The second is the one that matters clinically: a ring stuck at nought over the numeral
   3 is a screen arguing with itself, and a count-up that never starts is a nurse told she earned
   nothing this week. */
test('the clinical deck draws itself, and is already drawn when motion is refused', async ({ page }) => {
 await openWorkspace(page, 'Doctor');
 const ring = page.locator('.c-deck .c-ring');
 await ring.scrollIntoViewIfNeeded();
 const figure = page.locator('.s-metric').filter({ hasText: 'Awaiting review' }).locator('.s-metric-value');
 const counted = await figure.innerText();
 await expect.poll(() => ring.evaluate(el => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
 /* The arcs move and the figure does not. Animate presentation, never a reading. */
 expect(await figure.innerText()).toBe(counted);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => ring.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
 /* Complete rather than merely still: no arc is left with the dash that hides it. */
 expect(await ring.evaluate(el => [...el.querySelectorAll('.c-mark')].map(mark => getComputedStyle(mark).strokeDashoffset)))
  .toEqual(new Array(await page.locator('.c-deck .c-ring .c-mark').count()).fill('0px'));
 expect(await figure.innerText()).toBe(counted);
});

test("the nurse's week counts up to the figure it was counted at, and starts there under reduced motion", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await openWorkspace(page, 'Nurse');
 const week = page.locator('.s-metric').filter({ hasText: 'This week' }).locator('.s-metric-value');
 await expect(week).toBeVisible();
 /* Read at once. Under refused motion there is no count to wait for, so whatever is on the first
    painted frame is the final figure — and it is never nought, which is what a count-up that has
    been switched off rather than never started leaves behind. */
 const settled = await week.innerText();
 expect(settled).not.toMatch(/^R?\s*0$/);
 await page.waitForTimeout(900);
 expect(await week.innerText()).toBe(settled);
 /* And with motion allowed it lands on the same figure rather than on one of its own. */
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await page.reload();
 await expect(week).toHaveText(settled);
});
