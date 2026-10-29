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

test('GilbertOne\'s line on the Passport, the family, the visit day and the devices is the contract\'s, and every device picture says it is a concept', async ({ page }) => {
  await page.goto('/app/?open=health-passport');
  await helperSays(page, 'passport');
  await expect(page.locator('.passport-hero__blob')).toHaveAttribute('aria-hidden', 'true');
  await page.goto('/app/?open=my-family');
  await helperSays(page, 'family');
  await page.goto('/app/?open=my-visits');
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await expect(page.getByRole('heading', { name: 'Where is your nurse?' })).toBeVisible();
  /* Idle, or found only while the nurse is on her way: never a state the screen did not see happen. */
  const visit = page.locator('[data-g1-help^="visit"]');
  await expect(visit).toBeVisible();
  const at = await visit.getAttribute('data-g1-help');
  expect(['visitDay', 'visitOnTheWay']).toContain(at);
  await helperSays(page, at!);
  await page.goto('/app/?open=connected-devices');
  await helperSays(page, 'devices');
  const concepts = JSON.parse(readFileSync(new URL('../packages/catalog/device-concepts.json', import.meta.url), 'utf8'));
  const pictures = page.locator('.ps-device-concept img');
  expect(await pictures.count()).toBe(concepts.concepts.filter((c: { kitDevice: string | null }) => c.kitDevice).length);
  for (const alt of await pictures.evaluateAll(els => els.map(el => el.getAttribute('alt')))) expect(alt).toMatch(/concept/);
  await expect(page.getByText(concepts.notice)).toBeVisible();
});

test('under reduced motion the home\'s helper and the coral shape hold still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/');
  await expect(page.locator('[data-g1-help="home"]')).toBeVisible();
  const moving = await page.evaluate(() => [...document.querySelectorAll('.pd-hero__blob, [data-g1-help] *')]
    .reduce((n, el) => n + el.getAnimations().length, 0));
  expect(moving).toBe(0);
});
