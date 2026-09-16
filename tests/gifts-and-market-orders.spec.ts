import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* Gifts and Thuso Market orders, closed in Wave 6, on both viewports.
 *
 * A sponsor gifts one visit to the preview's patient, who sees it and books it herself, in her own account —
 * nothing here is booked for her. A real Thuso Market order prices the shop's catalogue and refuses a scheduled
 * medicine by its formulary code alone, which carries no word a person reading the screen would recognise as
 * one; the screen names the schedule so the refusal is not a mystery.
 *
 * Every sentence is packages/catalog/gifts.json's or packages/catalog/apis/money.json's, read here rather than
 * typed, the same reason every other Money spec beside this one reads its words from the contract.
 */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const gifts = json('packages/catalog/gifts.json') as {
  screen: { giver: Record<string, string>; beneficiary: { heading: string; intro: string; book: string; booked: string; never: string[] } };
  preview: { beneficiaryName: string; giverName: string; serviceId: string };
};
const services = json('packages/catalog/services.json') as { id: string; name: string; price: number }[];
const moneyApi = json('packages/catalog/apis/money.json') as { routes: { path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const medicineInShop = moneyApi.routes.find(r => r.path === '/v1/money/market-orders' && r.version === 1)!.refusals.find(r => r.id === 'medicine-in-shop')!.statement;
const giftBooksForThem = moneyApi.routes.find(r => r.path === '/v1/money/gifts' && r.version === 1)!.refusals.find(r => r.id === 'gift-books-for-them')!.statement;
const shop = json('packages/catalog/shop.json') as { products: { id: string; name: string }[] };
const medicines = json('packages/catalog/medicines.json') as { formulary: { entries: { entryCode: string; label: string; scheduleCode: string }[] } };

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const givenService = services.find(s => s.id === gifts.preview.serviceId)!;
const scheduled = medicines.formulary.entries.find(e => e.scheduleCode !== 'S0')!;
const ordinaryProduct = shop.products[0]!;

/* apps/web/src/lib/gifts.ts and lib/market-orders.ts keep one ledger for the whole tab, in memory — a fresh
   page load opens a fresh one, exactly as lib/groups.ts's preview does. So within one test, moving from the
   giver's screen to the beneficiary's must stay in-app: page.goto reloads the document and starts a new
   ledger, which is honest (a reload really does open the preview afresh) but would lose what this test just
   gave. Only the first hop to the wallet loads the page; every later one clicks back to it in the sidebar. */
const toWallet = async (page: Page) => { await page.goto('/app/'); await goSection(page, 'Thuso Wallet'); };
const backToWallet = async (page: Page) => { await goSection(page, 'Thuso Wallet'); };

test('a sponsor gifts a visit, and the beneficiary sees it and books it herself — nobody has booked anything for her', async ({ page }) => {
  await toWallet(page);
  await page.getByRole('button', { name: /Gift a visit/ }).click();
  const giver = page.locator('.gift-screen');
  await expect(giver.getByRole('heading', { name: gifts.screen.giver['heading'] })).toBeVisible();
  await expect(giver.getByText(noticeFor('payments')!)).toBeVisible();
  /* The screen says plainly, before anything is given, that a gift does not book a visit. */
  await expect(giver.getByText(giftBooksForThem)).toBeVisible();

  /* The default choice is the catalogue's first phase-one visit, which is the same one
     packages/catalog/gifts.json's preview names — the giver gives it without changing the picker. */
  await giver.getByRole('button', { name: gifts.screen.giver['give'] }).click();
  await expect(giver.locator('.gift-said')).toHaveText(fill(gifts.screen.giver['given']!, { beneficiary: gifts.preview.beneficiaryName }));
  await expect(giver.locator('.gift-row')).toContainText(givenService.name);

  /* Back to the wallet in-app, not a reload: lib/gifts.ts keeps the gift just given in this tab's ledger, and
     a reload would honestly open the preview afresh and lose it. */
  await backToWallet(page);
  await page.getByRole('button', { name: /Gifts sent to you/ }).click();
  const inbox = page.locator('.gift-screen');
  await expect(inbox.getByRole('heading', { name: gifts.screen.beneficiary.heading })).toBeVisible();
  const row = inbox.locator('.gift-row').filter({ hasText: givenService.name });
  await expect(row).toBeVisible();
  for (const sentence of gifts.screen.beneficiary.never) await expect(inbox.getByText(sentence)).toBeVisible();

  await row.getByRole('button', { name: gifts.screen.beneficiary.book }).click();
  await expect(inbox.locator('.gift-said')).toHaveText(gifts.screen.beneficiary.booked);
  await expect(row.getByText(gifts.screen.beneficiary.booked)).toBeVisible();
});

test('a real Thuso Market order succeeds for an ordinary product and refuses a scheduled medicine by its formulary code', async ({ page }) => {
  await toWallet(page);
  await page.getByRole('button', { name: /Place a real market order/ }).click();
  const screen = page.locator('.market-order-screen');
  await expect(screen.getByText(noticeFor('payments')!)).toBeVisible();

  await screen.getByRole('checkbox', { name: new RegExp(ordinaryProduct.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).check();
  await screen.getByRole('button', { name: 'Place this order' }).click();
  await expect(screen.getByText(/Order MO-.* placed\./)).toBeVisible();
  await screen.getByRole('button', { name: 'Pay for this order' }).click();
  await expect(screen.getByText(/^Paid\./)).toBeVisible();

  /* A different session: the picker offers the formulary's own code, which carries no word "medicine" or
     "tablet" a scanner would catch — only its schedule, read here from the same contract the route reads. */
  await toWallet(page);
  await page.getByRole('button', { name: /Place a real market order/ }).click();
  const second = page.locator('.market-order-screen');
  await expect(second.getByText(new RegExp(`${scheduled.entryCode}.*${scheduled.scheduleCode}`))).toBeVisible();
  await second.getByRole('checkbox', { name: new RegExp(scheduled.entryCode) }).check();
  await second.getByRole('button', { name: 'Place this order' }).click();
  await expect(second.getByText(medicineInShop)).toBeVisible();
});
