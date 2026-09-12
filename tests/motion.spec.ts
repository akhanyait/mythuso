import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* The motion system, measured rather than watched.
 *
 * A screenshot cannot show motion, and neither can a person scrolling past on a fast machine. What
 * can be checked is the three things that make motion safe rather than the fact that it is pretty:
 *
 *   That a reader who asks for stillness gets stillness, and gets a complete page with it. That is
 *   the failure mode worth fearing — an entrance starts at opacity 0, so a reduced-motion rule that
 *   removes the animation without leaving the content visible does not calm the page, it empties
 *   it. Every check below that asks "is it still" also asks "is it there".
 *
 *   That the pause control is a control: 44 by 44, in the tab order, operable by keyboard, and
 *   saying which of the two states pressing it produces. And that pressing it actually stops the
 *   things that move, which is the assertion the flag exists to make checkable.
 *
 *   That navigation never waits for motion. A control is pressable while an entrance is running,
 *   not after it — so the carousel is driven on the frame it appears rather than after a settle.
 *
 * The animation durations are read out of packages/design-tokens/tokens.json rather than written
 * here. A test carrying its own copy of a duration is the fourth copy of it. */
const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8'));
const ENTER_MS: number = tokens.motion.enterMs;
const MIN_TARGET: number = tokens.targets.minimum;

/** Everything the browser considers to be animating right now, anywhere on the page. */
const running = (page: Page) => page.evaluate(() =>
 document.getAnimations()
  .filter(animation => animation.playState === 'running')
  .map(animation => (animation as unknown as { animationName?: string; transitionProperty?: string }).animationName
   ?? (animation as unknown as { transitionProperty?: string }).transitionProperty ?? 'unnamed'));

test.describe('the motion system', () => {
 test('the curve and the durations are generated, not typed', async ({ page }) => {
  await page.goto('/');
  const [ease, quick, settle, enter] = await page.evaluate(() => {
   const style = getComputedStyle(document.documentElement);
   return ['--ease-soft', '--t-quick', '--t-settle', '--t-enter'].map(name => style.getPropertyValue(name).trim());
  });
  const [x1, y1, x2, y2] = tokens.motion.easeSoft;
  expect(ease).toBe(`cubic-bezier(${x1},${y1},${x2},${y2})`);
  expect(quick).toBe(`${tokens.motion.quickMs}ms`);
  expect(settle).toBe(`${tokens.motion.settleMs}ms`);
  expect(enter).toBe(`${ENTER_MS}ms`);
 });

 test('the pause control is a control, and it stops what moves', async ({ page }) => {
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Pause motion' });
  await expect(pause).toBeVisible();

  /* A target a thumb can land on. The page-level audit measures every control on every screen; this
     measures this one, here, because a pause control that has been squeezed into a caption row is
     exactly the control that gets squeezed. */
  const box = (await pause.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET - 0.5);
  expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET - 0.5);

  /* Reachable and operable from the keyboard, and visibly focused when it is. */
  await pause.focus();
  await expect(pause).toBeFocused();
  const ring = await pause.evaluate(el => getComputedStyle(el).boxShadow);
  expect(ring).not.toBe('none');

  await expect(page.locator('html')).toHaveAttribute('data-decor', 'on');
  await page.keyboard.press('Enter');
  /* The flag is gone, the ambient drift with it, and the control now says what the next press does
     rather than what the last one did. */
  await expect(page.locator('html')).not.toHaveAttribute('data-decor', 'on');
  await expect(page.getByRole('button', { name: 'Play motion' })).toBeFocused();
  expect(await running(page)).not.toContain('hero-lines');
  expect(await running(page)).not.toContain('portrait-drift');

  await page.keyboard.press(' ');
  await expect(page.locator('html')).toHaveAttribute('data-decor', 'on');
 });

 test('the landing page is complete and still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#safety').scrollIntoViewIfNeeded();
  await page.waitForTimeout(ENTER_MS + 200);

  /* Still. Not slower — nothing running at all, including the two endless ambient animations, which
     is the pair a reduced-motion block written per-sheet is most likely to miss. */
  expect(await running(page)).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-decor', 'on');

  /* And complete. Every section that carries a scroll-entrance is fully opaque, because the
     entrance starts at zero and a removal that forgets this leaves a reader a blank page they
     cannot explain. */
  const faded = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-reveal]')]
   .filter(el => Number(getComputedStyle(el).opacity) < 1).length);
  expect(faded).toBe(0);

  /* Nothing to pause, so no control offering to. */
  await expect(page.getByRole('button', { name: /motion/i })).toHaveCount(0);
 });

 test('the patient app is complete and still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForTimeout(ENTER_MS + 200);
  expect(await running(page)).toEqual([]);
  /* The entrances on this screen are `rise`, which also starts at zero. */
  const faded = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rise, .rise-2, .rise-3')]
   .filter(el => Number(getComputedStyle(el).opacity) < 1).length);
  expect(faded).toBe(0);
  /* And the pointer light is not merely invisible — it is not drawn. */
  const light = await page.evaluate(() => {
   const ground = document.querySelector('.m-light');
   return ground ? getComputedStyle(ground, '::before').display : 'absent';
  });
  expect(light).not.toBe('block');
 });

 test('the pointer light stays behind the panels and off a touch screen', async ({ page }, testInfo) => {
  await page.goto('/app/');
  const ground = page.locator('.m-light');
  await expect(ground).toHaveCount(1);
  /* aria-hidden and pointer-events:none, which together are the reason a light may move at all:
     nothing is read off this pane and nothing is pressed through it. */
  await expect(ground).toHaveAttribute('aria-hidden', 'true');
  expect(await ground.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');

  await page.mouse.move(240, 300);
  await page.mouse.move(700, 520);
  if (testInfo.project.name === 'mobile') {
   /* A touch screen has no cursor, so there is nothing to follow and the light never appears. */
   await expect(page.locator('html')).not.toHaveAttribute('data-pointer', 'seen');
   return;
  }
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'seen');
  const at = await page.evaluate(() => {
   const style = getComputedStyle(document.documentElement);
   return [style.getPropertyValue('--m-x').trim(), style.getPropertyValue('--m-y').trim()];
  });
  expect(at).toEqual(['700px', '520px']);

  /* At the far corner most of the light is outside its pane, and an unclipped box hanging off the
     right of a page is a horizontal scrollbar — the one thing the accessibility audit measures at
     320px and at 200% zoom. The clip is on the pane; this is the measurement that says so. */
  const width = page.viewportSize()!.width;
  await page.mouse.move(width - 1, 40);
  await page.waitForTimeout(120);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
 });

 test('a control is pressable while its entrance is still running', async ({ page }) => {
  await page.goto('/app/');
  /* No settle, no wait: the first press goes in on whatever frame the page has reached. If anything
     in the entrance were on the path between a press and its result, this is where it would show. */
  const book = page.getByRole('button', { name: /Book a nurse|Book care/ }).first();
  await book.click({ noWaitAfter: true });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
 });
});
