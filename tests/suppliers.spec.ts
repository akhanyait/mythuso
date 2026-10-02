import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep } from './audit';

/* Catalogue · Suppliers & OEMs, on both viewports (the founder's ask of 2 October 2026: "lets have this on the
 * OEM/Supplier so that we know who these are from").
 *
 * The Control Tower opens the register and finds every supplier with every offer, each offer's listing as the
 * one public address the contract's pattern builds, opening in a new tab only when pressed — and nothing on
 * the screen sends anything: no request leaves for Alibaba while it is read and filtered. The notice is the
 * contract's sentence. An offer whose readings go to its supplier's cloud carries the POPIA flag and the
 * condition on it; a flagged claim is quoted beside its reason; a shop candidate names the shop's listing;
 * every record says it is unverified. The three filters narrow the offers and say how many remain. And the
 * patient's shop names none of these suppliers.
 *
 * Every sentence and name asserted is read from the contracts, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const register = json('../packages/catalog/suppliers.json');
const shop = json('../packages/catalog/shop.json');
type Claim = { claim: string; severity: string; why: string };
type Offer = { number: number; category: string; specs: string; productId: string; scope: { id: string; shopProduct?: string }; saFit: { uploads: string | null; claims: Claim[] } };
type Supplier = { id: string; legalName: string; shortName: string; offers: Offer[] };
const suppliers = register.suppliers as Supplier[];
const offers = suppliers.flatMap(s => s.offers);
const words = register.words as Record<string, string>;
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const categoryLabel = (id: string) => (register.categories as { id: string; label: string }[]).find(c => c.id === id)!.label;
const cloud = (register.uploads as { id: string; flag: boolean }[]).filter(u => u.flag).map(u => u.id);

const panel = (page: Page) => page.locator('#pt-subpanel');
const card = (page: Page, o: Offer) => panel(page).getByRole('article', { name: `${fill(words.offerNumber, { number: o.number })} ${categoryLabel(o.category)}`, exact: true });

async function open(page: Page) {
 await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true } }));
 await page.goto('/app/?role=control-tower&category=catalogue&tab=suppliers');
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 await expect(page.getByRole('heading', { level: 1, name: 'Suppliers & OEMs', exact: true })).toBeVisible();
}

test('every supplier and offer is there, each listing opens only when pressed, and nothing is sent', async ({ page }) => {
 const outbound: string[] = [];
 page.on('request', request => { if (/alibaba\.com/i.test(new URL(request.url()).hostname)) outbound.push(request.url()); });
 await open(page);
 await expect(panel(page)).toContainText(register.notice.sentence);
 await expect(panel(page)).toContainText(register.notice.linkSentence);
 await expect(panel(page).getByRole('status')).toHaveText(fill(words.showing, { shown: offers.length, total: offers.length, suppliers: suppliers.length }));
 for (const s of suppliers) await expect(panel(page).getByRole('article', { name: s.legalName, exact: true })).toBeVisible();
 await expect(panel(page).locator('article.sp-offer')).toHaveCount(offers.length);

 /* One link per offer, built from the pattern and the ID, in a new tab with no opener and no referrer. */
 const links = panel(page).locator('a.sp-link');
 await expect(links).toHaveCount(offers.length);
 const expected = offers.map(o => register.source.urlPattern.replace('{productId}', o.productId)).sort();
 expect((await links.evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href))).sort()).toEqual(expected);
 for (const a of await links.all()) {
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(a).toHaveAttribute('referrerpolicy', 'no-referrer');
 }
 /* No form, no button: the register sends, saves and orders nothing. */
 await expect(panel(page).locator('form, button')).toHaveCount(0);
 expect(outbound, 'a request left for Alibaba while the register was only read').toEqual([]);
 await audit(page, 'Suppliers & OEMs');
 const sweep = await controlSweep(page);
 expect(sweep.nameless).toEqual([]);
 expect(sweep.positive).toBe(0);
});

test('each offer carries its fit, scope, POPIA flag, flagged claims and an unverified verdict', async ({ page }) => {
 await open(page);
 for (const o of offers) {
  const c = card(page, o);
  await expect(c).toContainText(register.verification.status);
  await expect(c.getByText(words.missing, { exact: true }).first()).toBeVisible();
  const scope = (register.scopes as { id: string; label: string }[]).find(s => s.id === o.scope.id)!;
  await expect(c).toContainText(scope.label);
  if (o.scope.shopProduct) await expect(c).toContainText((shop.products as { id: string; name: string }[]).find(p => p.id === o.scope.shopProduct)!.name);
  if (o.saFit.uploads && cloud.includes(o.saFit.uploads)) {
   await expect(c).toContainText(register.popia.flagSentence);
   await expect(c).toContainText(register.popia.acceptableOnlyIf);
  } else await expect(c).not.toContainText(register.popia.flagSentence);
  for (const claim of o.saFit.claims) {
   const quoted = c.locator('q.sp-claim', { hasText: claim.claim });
   await expect(quoted).toHaveCount(1);
   await expect(c).toContainText(claim.why);
  }
 }
});

test('the filters narrow the offers and say how many remain', async ({ page }) => {
 await open(page);
 const status = panel(page).getByRole('status');
 /* By scope: the count is the contract's. */
 for (const scope of register.scopes as { id: string; label: string }[]) {
  await panel(page).getByLabel(words.scopeLabel, { exact: true }).selectOption(scope.id);
  const n = offers.filter(o => o.scope.id === scope.id).length;
  const from = suppliers.filter(s => s.offers.some(o => o.scope.id === scope.id)).length;
  await expect(status).toHaveText(fill(words.showing, { shown: n, total: offers.length, suppliers: from }));
  await expect(panel(page).locator('article.sp-offer')).toHaveCount(n);
 }
 await panel(page).getByLabel(words.scopeLabel, { exact: true }).selectOption('any');
 /* By fit: every offer shown wears that level, and the three levels together are all fifty. */
 let total = 0;
 for (const level of register.saFitLevels as { id: string; label: string }[]) {
  await panel(page).getByLabel(words.fitLabel, { exact: true }).selectOption(level.id);
  const shown = panel(page).locator('article.sp-offer');
  const n = await shown.count();
  total += n;
  for (const c of await shown.all()) await expect(c.locator('.sp-badges')).toContainText(level.label);
 }
 expect(total).toBe(offers.length);
 /* Supplements are never a shop candidate: the two filters together find nothing, and say so. */
 await panel(page).getByLabel(words.fitLabel, { exact: true }).selectOption('any');
 await panel(page).getByLabel(words.categoryLabel, { exact: true }).selectOption('supplements');
 await panel(page).getByLabel(words.scopeLabel, { exact: true }).selectOption('shop');
 await expect(panel(page)).toContainText(words.noneShown);
});

test('the patient’s shop names none of the suppliers', async ({ page }) => {
 await page.goto('/shop/');
 await expect(page.locator('main')).toBeVisible();
 const body = await page.locator('body').innerText();
 const names = suppliers.flatMap(s => [s.legalName, s.shortName]);
 for (const name of names) expect(body.toLowerCase(), `the shop names ${name}`).not.toMatch(new RegExp(`(?<![a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`));
});
