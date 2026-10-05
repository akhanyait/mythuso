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
 /* Charts live on Health trends since 5 October 2026: the Passport tabs are empty until a record exists. */
 await goSection(page, 'Health trends');
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

test('charts added after navigation stay complete under reduced motion', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 /* Charts live on Health trends since 5 October 2026: the Passport tabs are empty until a record exists. */
 await goSection(page, 'Health trends');
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


/* The one-curve invariant, on the JS side. check-boundaries refuses a cubic-bezier typed into any
   stylesheet, but it cannot see a curve typed into a Web Animations call, so this is the guard for
   the half of the motion system that runs in script: the charts must spend --ease-soft, the same
   single curve every CSS movement and GilbertAvatar's dialog spend, and not a literal of their own.
   Whitespace is stripped because the browser may normalise the token's cubic-bezier when it hands it
   back off the animation's timing. */
test('the charts spend the token curve rather than typing their own', async ({ page }) => {
 /* Charts live on Health trends since 5 October 2026: the Passport tabs are empty until a record exists. */
 await goSection(page, 'Health trends');
 const chart = page.locator('.chart-card').first();
 await chart.scrollIntoViewIfNeeded();
 const line = chart.locator('.chart-line');
 await expect.poll(() => line.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
 const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ease-soft').trim());
 const easing = await line.evaluate(el => String((el.getAnimations()[0].effect as KeyframeEffect).getTiming().easing));
 const flat = (v: string) => v.replace(/\s+/g, '');
 expect(token).not.toBe('');
 expect(flat(easing)).toBe(flat(token));
 expect(flat(easing)).not.toBe('cubic-bezier(.2,.7,.2,1)');
});
