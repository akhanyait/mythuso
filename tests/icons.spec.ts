import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The MyThuso icon family — the design handoff of 28 September 2026, adopted exactly and generated once.
 *
 * What is held here is that the generated web components are the contract's: every icon in
 * packages/catalog/icons.json renders, at 24 and at 48 pixels, with every element the contract draws
 * and the signal dot the family carries; the pulse runs only under the pause flag and changes transform
 * alone, so no icon's box ever moves; and a reader who has asked for reduced motion gets a still dot,
 * not a slower one. The gallery it opens exists in development builds only — `?open=icons` is not a
 * page of the product. Every expectation is read from the contract, so a tenth icon added there is a
 * tenth icon asserted here rather than a broken test. */
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/icons.json', import.meta.url), 'utf8')) as {
 icons: { id: string; name: string; elements: unknown[] }[];
 signal: { className: string; pulse: { property: string; from: number; to: number } };
};
const SIZES = [24, 48] as const;

test('every icon renders at 24 and 48 px with its elements and the signal dot, pulsing by transform alone under the pause flag, and still under reduced motion', async ({ page }) => {
 await page.goto('/app/?open=icons');
 const gallery = page.locator('[data-icon-gallery]');
 await expect(gallery.getByRole('heading', { level: 1, name: 'MyThuso icon family' })).toBeVisible();
 expect(contract.icons.length).toBeGreaterThanOrEqual(9);

 for (const icon of contract.icons) {
  const svgs = gallery.locator(`svg[data-icon="${icon.id}"][aria-label]`);
  await expect(svgs).toHaveCount(SIZES.length);
  for (const [i, size] of SIZES.entries()) {
   const svg = svgs.nth(i);
   await expect(svg).toBeVisible();
   await expect(svg).toHaveAttribute('aria-label', `${icon.name}, ${size} pixels`);
   /* Mobile emulation quantises an inline svg's laid-out height by one 32768th of a pixel — 23.999969482421875
      for a 24, intermittently, while desktop measures the same DOM exactly and getBoundingClientRect reads it
      back exactly on the phone. The four standard sizes below are read rounded for the same reason. Half a
      pixel is the tolerance, which is far tighter than the 24-pixel gap between the two sizes the contract
      draws, so an icon wearing the wrong one still fails here rather than hiding behind the rounding. */
   const box = await svg.boundingBox();
   expect(box?.width).toBeCloseTo(size, 0);
   expect(box?.height).toBeCloseTo(size, 0);
   /* Every element the contract draws, plus the one signal dot. */
   expect(await svg.locator('path, rect, circle').count()).toBe(icon.elements.length + 1);
   await expect(svg.locator(`.${contract.signal.className}`)).toHaveCount(1);
  }
 }

 /* The pulse: running, on the dot alone, and moving nothing but transform. */
 await expect(page.locator('html')).toHaveAttribute('data-decor', 'on');
 const dots = gallery.locator(`.${contract.signal.className}`);
 await expect(dots).toHaveCount(contract.icons.length * (SIZES.length + 1));
 const first = dots.first();
 await expect.poll(() => first.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
 const animated = await first.evaluate(el => el.getAnimations().map(a => ({
  name: (a as CSSAnimation).animationName,
  properties: [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap(k => Object.keys(k).filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))]
 })));
 expect(animated).toEqual([{ name: 'mythuso-signal', properties: [contract.signal.pulse.property] }]);
 const svgBox = await gallery.locator('svg[data-icon]').first().boundingBox();
 await page.waitForTimeout(250);
 expect(await gallery.locator('svg[data-icon]').first().boundingBox()).toEqual(svgBox);

 /* Reduced motion removes the pulse rather than shortening it: the flag comes down, the stylesheet
    removes the animation, and the dot rests at the contract's starting scale. */
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('html')).not.toHaveAttribute('data-decor', 'on');
 await expect.poll(() => first.evaluate(el => el.getAnimations().length)).toBe(0);
 const transform = await first.evaluate(el => getComputedStyle(el).transform);
 expect(['none', `matrix(${contract.signal.pulse.from}, 0, 0, ${contract.signal.pulse.from}, 0, 0)`]).toContain(transform);
});

test('an icon without a label is hidden from assistive technology, and one with a label is not', async ({ page }) => {
 await page.goto('/app/?open=icons');
 const gallery = page.locator('[data-icon-gallery]');
 await expect(gallery).toBeVisible();
 const labelled = gallery.locator('svg[data-icon][aria-label]');
 await expect(labelled).toHaveCount(contract.icons.length * SIZES.length);
 for (const svg of await labelled.all()) await expect(svg).not.toHaveAttribute('aria-hidden', 'true');
 /* The gallery wears one icon per row the way a screen will — beside its name, with no label of its
    own — and that one is decorative by the component's default, not by anything the gallery set. */
 const decorative = gallery.locator('svg[data-icon]:not([aria-label])');
 await expect(decorative).toHaveCount(contract.icons.length);
 for (const svg of await decorative.all()) await expect(svg).toHaveAttribute('aria-hidden', 'true');
});

/* The rest of the handoff's iconography page (30 September 2026), under the family and outside its section so the
   family's own counts above are untouched: the contract's rules, the official logo whole with its usage sentence,
   the Lucide utility set — none of it an idea a family icon owns — and one family icon at the four sizes. */
test('the gallery carries the rules, the logo’s usage, the utility set and the four sizes', async ({ page }) => {
 const full = JSON.parse(readFileSync(new URL('../packages/catalog/icons.json', import.meta.url), 'utf8')) as { rules: { sentence: string }[]; icons: { neverBeside: string[] }[] };
 await page.goto('/app/?open=icons');
 const more = page.getByRole('region', { name: 'Logo, utility icons and sizes' });
 await expect(more.locator('.icon-gallery-rules li')).toHaveText(full.rules.map(r => r.sentence));
 await expect(more.getByRole('img', { name: 'GilbertOne' })).toBeVisible();
 await expect(more.locator('.icon-gallery-logo-rules p')).toContainText('official GilbertOne logo');
 const owned = new Set(full.icons.flatMap(i => i.neverBeside));
 const utility = await more.locator('.icon-gallery-utility code').allTextContents();
 expect(utility.length).toBeGreaterThan(0);
 for (const name of utility) expect(owned.has(name), `${name} is an idea a family icon owns`).toBe(false);
 const sizes = await more.locator('.icon-gallery-standard svg').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().width)));
 expect(sizes).toEqual([16, 20, 24, 32]);
 expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
