import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noticeFor } from './notices';
/* A voucher at the booking's review step, on both viewports: a simulated corner shop issues one and the screen says so,
 * a wrong code is refused in the redemption route's own sentence, the right one covers the visit, and the visit is
 * booked with nothing taken and the voucher named as what paid.
 *
 * Every sentence is packages/catalog/vouchers.json's or packages/catalog/apis/money.json's. The service booked is the one
 * the preview voucher is towards, read from the contract, so the voucher covering it is the contract's arithmetic. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const vouchers = json('packages/catalog/vouchers.json');
const services = json('packages/catalog/services.json') as { id: string; name: string }[];
const moneyApi = json('packages/catalog/apis/money.json') as { routes: { path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const words = vouchers.screen;
const towards = services.find(s => s.id === vouchers.preview.towards.serviceId)!;
const notFound = moneyApi.routes.find(r => r.path === '/v1/money/voucher-redemptions' && r.version === 1)!.refusals.find(r => r.id === 'voucher-not-found')!.statement;

async function toReview(page: Page) {
  await page.goto('/app/');
  await page.getByRole('button', { name: new RegExp(towards.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  const d = page.getByRole('dialog');
  /* Who, where, who comes, when and payment, each with the default already chosen. */
  for (let i = 0; i < 5; i += 1) await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.getByRole('checkbox')).toBeVisible();
  return d;
}

test('a voucher is redeemed at checkout: a wrong code is refused, the right one covers the visit, and nothing else is taken', async ({ page }) => {
  const d = await toReview(page);
  await d.getByRole('button', { name: words.heading }).click();
  const issued = d.locator('.voucher-issued');
  await expect(issued).toContainText(words.issuedInPreview.split('{code}')[0]!.trim());
  const code = ((await issued.textContent()) ?? '').match(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
  expect(code, 'the simulated shop showed a code').toBeTruthy();

  await d.getByLabel(words.codeLabel).fill('ABCD-EFGH-JKLM');
  await d.getByRole('button', { name: words.redeem }).click();
  await expect(d.locator('.voucher-refused')).toHaveText(notFound);

  await d.getByLabel(words.codeLabel).fill(code!.toLowerCase());
  await d.getByRole('button', { name: words.redeem }).click();
  await expect(d.locator('.voucher-redeemed')).toHaveText(words.covered);
  await expect(d.getByText(words.never)).toBeVisible();

  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm & book' }).click();
  await expect(d.getByText('Your visit is booked.')).toBeVisible();
  await expect(d.locator('.pay-words')).toHaveText(words.covered);
  /* Nothing was authorised on a card, because nothing was owed. */
  await expect(d.locator('.review-line').filter({ hasText: 'Authorised' })).toHaveCount(0);
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payments')! })).toHaveCount(1);
});
