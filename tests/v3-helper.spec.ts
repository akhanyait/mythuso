import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';

/* The MyThuso v3 helper line (29 October 2026), on both viewports: GilbertOne beside one sentence on the home, the
 * first step of booking and the share-link screen. The sentence is the contract's word for word, the drawing is
 * hidden from a screen reader and holds the contract's pose, and the coral shape behind the next-visit card is
 * hidden too and holds still under reduced motion. Read rather than imported, as the other journeys do. */
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/gilbertone-states.json', import.meta.url), 'utf8'));

async function helperSays(page: Page, at: string) {
  const line = contract.helpers[at];
  const helper = page.locator(`[data-g1-help="${at}"]`);
  await expect(helper).toBeVisible();
  await expect(helper).toHaveText(line.text);
  await expect(helper.locator('.g1')).toHaveAttribute('aria-hidden', 'true');
  await expect(helper.locator('.g1')).toHaveAttribute('data-g1', line.state);
}

test('GilbertOne says only the contract\'s helper sentence on home, booking and sharing', async ({ page }) => {
  await page.goto('/app/');
  await helperSays(page, 'home');
  await expect(page.locator('.pd-hero__blob')).toHaveAttribute('aria-hidden', 'true');
  await page.goto('/app/?open=book-care');
  await helperSays(page, 'bookCare');
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Records' }).click();
  await page.getByRole('button').filter({ hasText: 'Share links' }).first().click();
  await helperSays(page, 'sharing');
});

test('under reduced motion the home\'s helper and the coral shape hold still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/');
  await expect(page.locator('[data-g1-help="home"]')).toBeVisible();
  const moving = await page.evaluate(() => [...document.querySelectorAll('.pd-hero__blob, [data-g1-help] *')]
    .reduce((n, el) => n + el.getAnimations().length, 0));
  expect(moving).toBe(0);
});
