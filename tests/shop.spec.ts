import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openFirstRun } from './nav';

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

const product = (id: string) => shop.products.find((p: { id: string }) => p.id === id);
/* Rands as the page writes them, compared by their digits: en-ZA groups thousands with a no-break
   space, and the figure is the point, not the space. */
const digits = (text: string | null) => (text ?? '').replace(/\D/g, '');

test('a basket adds up to what the engine charges, and delivery is free above the threshold', async ({ page }) => {
 await page.goto('/shop/');
 // The two prices are the contract's; together they are over the free-delivery threshold.
 const sum = product('bp-upper').price + product('thermometer').price;
 expect(sum).toBeGreaterThanOrEqual(shop.delivery.freeAbove);
 await page.locator('.shop-card', { hasText: product('bp-upper').name }).getByRole('button', { name: /Add to basket/ }).click();
 await page.locator('.shop-card', { hasText: product('thermometer').name }).getByRole('button', { name: /Add to basket/ }).click();
 await expect(page.locator('.shop-basket li')).toHaveCount(2);
 expect(digits(await page.locator('.shop-total .grand dd').textContent())).toBe(String(sum));
 await expect(page.locator('.shop-total dt', { hasText: 'Delivery' })).toContainText('none to pay');
});

test('a quote holds stock, charges nothing and earns a point per rand', async ({ page }) => {
 await page.goto('/shop/');
 await page.locator('.shop-card', { hasText: product('thermometer').name }).getByRole('button', { name: /Add to basket/ }).click();
 await page.getByRole('button', { name: /Hold stock and quote me/ }).click();
 await expect(page.locator('.shop-message')).toContainText('No card was charged');
 // One point per rand of the thermometer's price.
 await expect(page.locator('.shop-balance strong')).toHaveText(String(product('thermometer').price));
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

/* ─── The storefront, 2 October 2026 ───────────────────────────────────────────────────────────
 * Pictures, the readings a device takes, who sees them, kits priced from their items and the planned
 * welcome monitor. scripts/check-boundaries.mjs holds the contract and the files; these walk the page. */

test('every product has its picture, labelled as illustrative, with the contract\'s description', async ({ page }) => {
 await page.goto('/shop/');
 const cards = page.locator('.shop-card');
 await expect(cards).toHaveCount(shop.products.length);
 for (const p of shop.products as { id: string; name: string; image: { alt: string } }[]) {
  const card = cards.filter({ has: page.getByRole('heading', { name: p.name, exact: true }) });
  const img = card.getByRole('img', { name: p.image.alt });
  await expect(img).toHaveAttribute('src', `${shop.images.dir}${p.id}.webp`);
  await expect(card.locator('.shop-illustrative')).toHaveText(shop.images.label);
 }
 /* The pictures load — checked on the first row, which is on screen without scrolling. */
 const first = cards.first().locator('img');
 await expect.poll(() => first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
});

test('the welcome monitor is a plan, says so, and says nobody can claim it — above the shelf', async ({ page }) => {
 await page.goto('/shop/');
 const offer = page.locator('.shop-welcome');
 await expect(offer).toContainText(shop.welcome.label);
 await expect(offer).toContainText(sentence('welcome-not-live'));
 const offerBox = await offer.boundingBox();
 const firstCard = await page.locator('.shop-card').first().boundingBox();
 expect(offerBox!.y).toBeLessThan(firstCard!.y);
 /* What it covers is in the page on every viewport — folded on a phone, open on a wide screen. */
 for (const c of shop.welcome.covers) await expect(offer.locator('.shop-covers')).toContainText(c.text, { useInnerText: false });
});

test('a monitor, opened, says what it reads, the range, and what you, your nurse and your doctor see', async ({ page }) => {
 const p = product('bp-upper');
 await page.goto('/shop/');
 await page.getByRole('link', { name: `Details of ${p.name}` }).click();
 await expect(page).toHaveURL(/#product\/bp-upper$/);
 const detail = page.locator('.shop-detail');
 await expect(detail.getByRole('heading', { level: 1 })).toHaveText(p.name);
 await expect(detail.locator('.shop-reference')).toContainText('checked');
 await expect(detail.locator('.shop-reads')).toContainText('Blood pressure');
 await expect(detail.locator('.shop-reads')).toContainText('Pulse');
 await expect(detail).toContainText(sentence('reading-is-not-advice'));
 for (const heading of ['What you see', 'What your nurse sees', 'What your doctor sees']) await expect(detail.getByRole('heading', { name: heading })).toBeVisible();
 /* Every line the contract promises for this monitor is on the page, and each says in a word whether
    the preview does it. */
 for (const audience of ['patient', 'nurse', 'doctor'] as const) {
  for (const id of p.sees[audience]) {
   const line = shop.seenLines[id];
   const text = line.text.replace('{trendNeeds}', '');
   const item = detail.locator('.shop-see li', { hasText: text.split('{')[0].slice(0, 40) });
   await expect(item).toBeVisible();
   await expect(item).toContainText(line.status === 'in-preview' ? 'In this preview' : 'Planned');
  }
 }
 /* Back goes back. */
 await page.goBack();
 await expect(page.locator('.shop-card').first()).toBeVisible();
});

test('a device the record cannot hold says so, rather than promising the doctor a reading', async ({ page }) => {
 await page.goto('/shop/#product/smart-scale');
 const detail = page.locator('.shop-detail');
 await expect(detail.locator('.shop-reads')).toContainText(shop.notInRecord.weight.sentence);
 await expect(detail.locator('.shop-see').filter({ hasText: 'What your doctor sees' })).toContainText(shop.notInRecord.weight.sentence);
});

test('the pulse oximeter carries the warning about darker skin, with its sources', async ({ page }) => {
 await page.goto('/shop/#product/oximeter');
 const warning = page.locator('.shop-warning');
 await expect(warning).toContainText(shop.caveats[0].text);
 for (const s of shop.caveats[0].sources) await expect(warning.getByRole('link', { name: s.name })).toHaveAttribute('href', s.url);
});

test('a kit costs the sum of its items, and leaving one out takes it off', async ({ page }) => {
 const kit = shop.kits.find((k: { id: string }) => k.id === 'kit-bp');
 const total = kit.items.reduce((sum: number, id: string) => sum + product(id).price, 0);
 await page.goto('/shop/');
 await page.getByRole('button', { name: /^Kits/ }).click();
 const card = page.locator('.shop-kit', { hasText: kit.name });
 expect(digits(await card.locator('.shop-kit-total strong').textContent())).toBe(String(total));
 const last = product(kit.items.at(-1));
 await card.getByRole('checkbox', { name: last.name }).uncheck();
 expect(digits(await card.locator('.shop-kit-total strong').textContent())).toBe(String(total - last.price));
 await card.getByRole('button', { name: /^Add/ }).click();
 await expect(page.locator('.shop-basket li')).toHaveCount(kit.items.length - 1);
});

test('the shop does not scroll sideways at 320 pixels, on the shelf or a product', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 for (const path of ['/shop/', '/shop/#product/bp-pregnancy', '/shop/#kit/kit-diabetes']) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
   .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden' && getComputedStyle(el).overflowX !== 'clip' && el.clientWidth > 0 && !el.matches('.shop-filters, .shop-filters *'))
   .map(el => el.className || el.tagName).slice(0, 5));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(wide, `${path} has a box wider than its container`).toEqual([]);
 }
});

test('sign-up shows the welcome monitor as a plan, loaded only when the step opens', async ({ page }) => {
 const shopArt: string[] = [];
 page.on('request', r => { if (r.url().includes(shop.images.dir)) shopArt.push(r.url()); });
 await page.goto('/app/');
 await page.waitForLoadState('networkidle');
 expect(shopArt, 'the patient app fetched a shop picture before sign-up opened').toEqual([]);
 await openFirstRun(page);
 const offer = page.locator('.welcome-device');
 await expect(offer).toContainText(shop.welcome.label);
 await expect(offer).toContainText(sentence('welcome-not-live'));
 await expect(offer.getByRole('img', { name: product(shop.welcome.productId).image.alt })).toBeVisible();
});
