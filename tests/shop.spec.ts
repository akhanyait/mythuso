import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The shop and the points, opened in a browser.
 *
 * scripts/check-boundaries.mjs already reads the contracts and the kernel: that nothing in the
 * catalogue is a medicine, that a medicine would earn and redeem nothing, that the ledger writes
 * the contract's own disclosure sentence, that no command pays anybody. What a source check cannot
 * see is the page — whether the refusals are actually on it, whether the arithmetic a person reads
 * is the arithmetic the engine did, and whether a balance survives being spent.
 *
 * These run on both viewports, because the shop is the surface most likely to be opened on a phone
 * on metered data and the refusals must be above the goods there too. */

const shop = JSON.parse(readFileSync('packages/catalog/shop.json', 'utf8'));
const rewards = JSON.parse(readFileSync('packages/catalog/rewards.json', 'utf8'));
const sentence = (id: string) => [...shop.refusals, ...rewards.refusals].find((r: { id: string }) => r.id === id).sentence;

test('the shop says no card is charged and no medicine is sold, above anything it sells', async ({ page }) => {
 await page.goto('/shop/');
 const banners = page.locator('.shop-banner');
 await expect(banners.filter({ hasText: sentence('no-payment') })).toBeVisible();
 await expect(banners.filter({ hasText: sentence('no-medicine') })).toBeVisible();
 /* Above the goods, not merely present: a refusal below the first product is a refusal a person
    scrolling to buy something never meets. */
 const banner = await banners.first().boundingBox();
 const firstProduct = await page.locator('.shop-card').first().boundingBox();
 expect(banner!.y).toBeLessThan(firstProduct!.y);
});

test('nothing in the catalogue is a medicine, and every device that reads says a reading is not a diagnosis', async ({ page }) => {
 await page.goto('/shop/');
 const names = await page.locator('.shop-card h2').allTextContents();
 expect(names.length).toBe(shop.products.length);
 for (const name of names) {
  for (const word of shop.neverSold) expect(name.toLowerCase()).not.toContain(word.toLowerCase());
 }
 for (const product of shop.products.filter((p: { needsReading: boolean }) => p.needsReading)) {
  const card = page.locator('.shop-card', { hasText: product.name });
  await expect(card.locator('.shop-caveat')).toContainText(sentence('reading-is-not-advice'));
 }
});

test('a basket adds up to what the engine charges, and delivery is free above the threshold', async ({ page }) => {
 await page.goto('/shop/');
 // R749 + R149 = R898, which is over the R750 free-delivery threshold.
 await page.locator('.shop-card', { hasText: 'Upper-arm blood pressure' }).getByRole('button', { name: /Add to basket/ }).click();
 await page.locator('.shop-card', { hasText: 'Digital thermometer' }).getByRole('button', { name: /Add to basket/ }).click();
 await expect(page.locator('.shop-basket li')).toHaveCount(2);
 await expect(page.locator('.shop-total .grand dd')).toHaveText('R898');
 await expect(page.locator('.shop-total dt', { hasText: 'Delivery' })).toContainText('none to pay');
});

test('a quote holds stock, charges nothing and earns a point per rand', async ({ page }) => {
 await page.goto('/shop/');
 await page.locator('.shop-card', { hasText: 'Digital thermometer' }).getByRole('button', { name: /Add to basket/ }).click();
 await page.getByRole('button', { name: /Hold stock and quote me/ }).click();
 await expect(page.locator('.shop-message')).toContainText('No card was charged');
 // R149 of goods, one point per rand.
 await expect(page.locator('.shop-balance strong')).toHaveText('149');
 await expect(page.locator('.shop-orders article')).toHaveCount(1);
});

test('the points history records that something happened and never what it was for', async ({ page }) => {
 await page.goto('/shop/');
 await page.getByRole('tab', { name: /Points/ }).click();
 await page.getByRole('button', { name: 'Simulate' }).first().click();
 const row = page.locator('.shop-points tbody tr').first();
 await expect(row).toContainText(rewards.earnReasons[0].discloses);
 /* The clinical words that must never reach a loyalty screen. The ledger is read casually, shown
    to family and screenshotted; the reason for a visit is special personal information. */
 const history = await page.locator('.shop-points tbody').textContent();
 for (const word of ['wound', 'chronic', 'diabet', 'pregnan', 'HIV', 'antenatal']) {
  expect(history!.toLowerCase()).not.toContain(word.toLowerCase());
 }
 await expect(page.locator('.shop-points .shop-caveat')).toContainText(sentence('ledger-holds-nothing-clinical'));
});

test('every refusal both contracts write down is on the page, word for word', async ({ page }) => {
 await page.goto('/shop/');
 const foot = page.locator('.shop-foot');
 for (const refusal of [...shop.refusals, ...rewards.refusals]) {
  await expect(foot).toContainText(refusal.sentence);
 }
});

test('the shop entry does not carry the clinical workspaces', async ({ page }) => {
 /* The whole reason the shop is its own entry. A patient comparing the price of a thermometer
    must not download a dispatch board, and a static import from any module this entry reaches
    would put it back silently. */
 const scripts: string[] = [];
 page.on('response', r => { if (r.url().endsWith('.js') || r.url().includes('/src/')) scripts.push(r.url()); });
 await page.goto('/shop/', { waitUntil: 'networkidle' });
 for (const forbidden of ['StaffShell', 'ClinicalWorkbench', 'DispatchView']) {
  expect(scripts.some(u => u.includes(forbidden))).toBe(false);
 }
});
