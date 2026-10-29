import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* GilbertOne's six v3 states (the MyThuso v3 redesign pack, 29 October 2026), on both viewports.
 *
 * The pack's rule is that the shape says the state: a reader who cannot tell coral from sand, or who has asked
 * for less motion, still sees which state GilbertOne is in. So this holds that every state in the contract is
 * drawn with its own words beside it, that the drawing is hidden from a screen reader, that no two states share
 * a still pose, and that reduced motion leaves nothing looping. Read rather than imported, as the other journeys do. */
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/gilbertone-states.json', import.meta.url), 'utf8'));

test('GilbertOne draws each of its six states with its own pose and its words beside it', async ({ page }) => {
  await page.goto('/app/?preview=gilbertone');
  const sheet = page.getByRole('region', { name: 'GilbertOne changes shape to show what it is doing.' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(contract.rule);
  const poses = new Set<string>();
  for (const state of contract.states) {
    const card = sheet.locator(`[data-g1-state="${state.id}"]`);
    await expect(card).toContainText(state.label);
    const drawing = card.locator('.g1');
    await expect(drawing).toHaveAttribute('aria-hidden', 'true');
    poses.add(await drawing.evaluate(el => [...el.querySelectorAll('.bod, .blob, .face, .halo, .orbit, .eyes .open, .happy')]
      .map(part => { const s = getComputedStyle(part); return `${s.transform}|${s.opacity}|${s.getPropertyValue('d')}|${part.getAttribute('style') ?? ''}`; }).join('/')));
  }
  expect(poses.size, 'two states share a still pose, so the shape no longer says which one it is').toBe(contract.states.length);
});

test('under reduced motion GilbertOne holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/?preview=gilbertone');
  const sheet = page.getByRole('region', { name: 'GilbertOne changes shape to show what it is doing.' });
  await expect(sheet).toBeVisible();
  const running = await sheet.evaluate(el => el.getAnimations({ subtree: true }).length);
  expect(running).toBe(0);
});
