import { test, expect, type Page } from '@playwright/test';
import { goSection, openWorkspace } from './nav';
/* Nurse earnings and payouts.
 *
 * The landing page tells the public that a nurse keeps three quarters of every visit. These
 * journeys check the two things that make that a promise rather than a slogan: that the split on
 * the nurse's own screen is the catalogue's arithmetic, and that a suspension moves the banner
 * without moving a single figure. */
const openEarnings = async (page: Page) => {
  await openWorkspace(page, 'Nurse');
  // the nurse workspace navigates by its own sections; "Weekly payouts" is "Earnings & payouts"
  await goSection(page, 'Earnings & payouts');
  return page.locator('main');
};

test('the split is the catalogue’s arithmetic, and the card fee is not the nurse’s', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openEarnings(page);
  // wound care: R299 to the patient, R224 to the nurse, R9 card fee, R66 to MyThuso
  const legend = d.locator('.earn-legend');
  await expect(legend.getByText('R 224', { exact: true })).toBeVisible();
  await expect(legend.getByText(/Yours · 75% of the price/)).toBeVisible();
  await expect(legend.getByText('R 9', { exact: true })).toBeVisible();
  await expect(legend.getByText('R 66', { exact: true })).toBeVisible();
  await expect(d.getByText(/never out of yours/)).toBeVisible();
  // a different service, and the share moves with the price rather than being restated
  await d.getByLabel('Show the split for').selectOption('senior');
  await expect(legend.getByText('R 299', { exact: true })).toBeVisible();
  // \s, not a space: Intl formats ZAR with a non-breaking one, and a regex is not normalised
  await expect(d.getByText(/R\s187 to R\s299 a visit/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a suspension moves the banner and not one figure', async ({ page }) => {
  const d = await openEarnings(page);
  await expect(d.getByText('Cleared for visits')).toBeVisible();
  const before = await d.locator('.metric strong').allTextContents();
  await d.locator('.earn-preview-switch label').filter({ hasText: 'Sister Ayanda Dube' }).click();
  await expect(d.getByText('You will not be sent new visits')).toBeVisible();
  await expect(d.getByText(/Police clearance lapsed/)).toBeVisible();
  await expect(d.getByText(/Work done is work paid/)).toBeVisible();
  expect(await d.locator('.metric strong').allTextContents()).toEqual(before);
});

test('a week that did not go through says so, and a deduction says why', async ({ page }) => {
  const d = await openEarnings(page);
  const failed = d.locator('.earn-week.failed');
  await expect(failed.getByText('Did not go through')).toBeVisible();
  /* The week's own header, not whatever button comes first: a week now also carries the button that
     runs its payment against the simulated bank. */
  await failed.getByRole('button').first().click();
  await expect(failed.locator('.earn-failure')).toContainText('the account name did not match');
  await expect(failed.locator('.earn-failure')).toContainText('still owed to you');
  // the paid week carries the reversal, negative and explained
  const paid = d.locator('.earn-week').filter({ hasText: 'Paid' }).first();
  await paid.getByRole('button').first().click();
  await expect(paid.locator('tr.negative')).toHaveCount(1);
  await expect(paid.getByText(/no care was given/)).toBeVisible();
  await expect(paid.getByText(/A line that only says/)).toBeVisible();
});

test('no tax is withheld, and MyThuso will not advise on it', async ({ page }) => {
  const d = await openEarnings(page);
  await expect(d.getByText('Tax withheld by MyThuso')).toBeVisible();
  await expect(d.getByText(/nobody here is your accountant/)).toBeVisible();
  await expect(d.getByText(/That is between you and SARS/)).toBeVisible();
  await expect(d.getByText(/never held back as a penalty/)).toBeVisible();
});

test('changing where you are paid re-verifies you and then waits', async ({ page }) => {
  const d = await openEarnings(page);
  const account = d.locator('.earn-account');
  await expect(account).toContainText('•••• •••• 4471');
  await account.getByRole('button', { name: 'Change account' }).click();
  await expect(account.getByRole('button', { name: /Verify and start the wait/ })).toBeDisabled();
  await account.getByLabel('One-time code').fill('240924');
  await account.getByRole('button', { name: /Verify and start the wait/ }).click();
  await expect(account.getByText('Waiting 48 hours')).toBeVisible();
  // the point of the wait: a payout already in flight is not redirected by it
  await expect(account.locator('.earn-pending')).toContainText('goes to the old account');
});
