import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDestination, openWorkspace } from './nav';
import { noticeFor } from './notices';
/* Thuso Money on the patient's booking and the doctor's workspace.
 *
 * Every sentence and every figure these journeys look for is read out of the contracts rather than
 * typed here: the ways to pay and their words from packages/catalog/money.json, the refusal from
 * packages/catalog/apis/money.json, the fee range from packages/catalog/business-model.json. A spec
 * carrying its own copy of a payment sentence is one more place for the sentence to be wrong.
 *
 * What they hold is the half of the feature worth holding: no card fragment on the screen where a
 * person pays, cash booked as money owed rather than as nothing, and a doctor's fee that is shown as the
 * proposal it is and pays nobody until an admin confirms it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const money = json('packages/catalog/money.json') as {
  methods: { id: string; name: string; detail: string; for: string[]; offered: boolean; notOfferedBecause?: string }[];
  states: { id: string; name: string; words: string }[];
  cash: { codeLength: number; pendingWords: string };
  doctorFees: { name: string; amountSetting: string; unconfirmed: string }[];
  sampleCases: { reviewRef: string }[];
  casesWords: string;
  settings: { items: { key: string; default: { value: unknown } }[] };
};
const moneyApi = json('packages/catalog/apis/money.json') as { refusals: { id: string; statement: string }[] };
const model = json('packages/catalog/business-model.json') as { unitEconomics: { doctorReviewFee: [number, number] } };
const state = (id: string) => money.states.find(s => s.id === id)!;
const cash = money.methods.find(m => m.id === 'cash-otp')!;
const rand = (n: number) => new RegExp(`R\\s${n}\\b`);

async function toPaymentStep(page: Page) {
  await page.goto('/app/');
  await page.getByRole('button', { name: /Vitals & chronic check/ }).first().click();
  const d = page.getByRole('dialog');
  /* Who, where, who comes and when, then payment. The person step (Wave 3 Access) sits between where and
     when, and whoever is nearest is already chosen, so its Continue needs nothing pressed first. */
  for (let i = 0; i < 4; i += 1) await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.getByRole('heading', { name: 'How would you like to pay?' })).toBeVisible();
  return d;
}

test('the payment step offers the contract’s ways to pay, says why the wallet is not one, and shows no card', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await toPaymentStep(page);
  for (const method of money.methods.filter(m => m.offered && m.for.includes('visit'))) {
    const row = d.locator('.choice-row').filter({ hasText: method.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(method.detail);
  }
  for (const method of money.methods.filter(m => !m.offered)) {
    await expect(d.locator('.not-offered').filter({ hasText: method.notOfferedBecause! })).toHaveCount(1);
    await expect(d.locator('.choice-row').filter({ hasText: method.name })).toHaveCount(0);
  }
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payments')! })).toHaveCount(1);
  /* Not even the last four digits of a made-up card. */
  expect(await d.textContent()).not.toMatch(/4242|Visa ending|••••\s?\d/);
  expect(errors).toEqual([]);
});

test('cash is booked as money owed, with a code for the nurse and the contract’s words', async ({ page }) => {
  const d = await toPaymentStep(page);
  await d.locator('.choice-row').filter({ hasText: cash.name }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.locator('.pay-row')).toContainText(cash.name);
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm & book' }).click();

  await expect(d.getByText('Visit confirmed (simulated)')).toBeVisible();
  await expect(d.getByText('What is owed')).toBeVisible();
  await expect(d.locator('.pay-status')).toContainText(state('pending').name);
  await expect(d.locator('.pay-words')).toHaveText(money.cash.pendingWords);
  const code = ((await d.locator('.cash-code strong').textContent()) ?? '').trim();
  expect(code).toMatch(new RegExp(`^\\d{${money.cash.codeLength}}$`));
  /* Nothing was authorised and there is no receipt, because nothing has been paid. */
  await expect(d.locator('.review-line').filter({ hasText: 'Authorised' })).toHaveCount(0);
  await expect(d.locator('.review-line').filter({ hasText: 'Receipt' })).toHaveCount(0);
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payments')! })).toHaveCount(1);
});

test('a doctor’s per-case fee is shown as a proposal nobody has confirmed, and scheduling the payout is refused in the contract’s words', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Doctor');
  /* A destination in the doctor's Practice group since 30 September, where it was a More tool opening a dialog. */
  const d = await openDestination(page, 'Per-case fees');
  const fee = money.doctorFees[0]!;
  const [low, high] = model.unitEconomics.doctorReviewFee;
  /* The proposal, as the screen formats cents: the whole rand, and the cents only when there are some. */
  const proposed = money.settings.items.find(s => s.key === fee.amountSetting)!.default.value as number;
  const proposedText = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: proposed % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(proposed / 100);

  await expect(d.locator('.review-line').filter({ hasText: fee.name })).toContainText(proposedText);
  const range = d.locator('.review-line').filter({ hasText: 'The range the documents give' });
  await expect(range).toContainText(rand(low));
  await expect(range).toContainText(rand(high));
  await expect(d.getByText(fee.unconfirmed)).toBeVisible();
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payouts')! })).toHaveCount(1);
  await expect(d.locator('.review-line').filter({ hasText: /^Owed for/ })).toContainText('Not worked out');

  /* The cases are references and dates, and nobody's name: Money never hears who the patient was. */
  const rows = d.locator('table tbody tr');
  await expect(rows).toHaveCount(money.sampleCases.length);
  for (const sample of money.sampleCases) await expect(rows.filter({ hasText: sample.reviewRef })).toContainText('not confirmed');
  await expect(d.getByText(money.casesWords)).toBeVisible();

  await d.getByRole('button', { name: /Schedule this week’s payout/ }).click();
  const refusal = moneyApi.refusals.find(r => r.id === 'doctor-fee-undecided')!.statement;
  await expect(d.locator('.earn-refusal')).toHaveText(refusal);
  expect(errors).toEqual([]);
});
