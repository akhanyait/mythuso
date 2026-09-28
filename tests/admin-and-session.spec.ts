import { test, expect, type Page } from '@playwright/test';
import { goConsole, openAdminConsole, openFirstRun } from './nav';
const tab = (page: Page, index: number) => page.locator('.tabbar button').nth(index);
const openAdmin = openAdminConsole;
test('signing out really closes the account, and signing back in restores it', async ({ page }) => {
  await page.goto('/app/');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  else { await tab(page, 4).click(); }
  await page.getByRole('button', { name: /^Log out/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
  // nothing about the account is reachable while signed out
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(page.locator('.tabbar')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeHidden();
  await page.getByRole('button', { name: 'Continue as Lerato Molefe' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
});
test('signing out from the sign-in screen can start a new account instead', async ({ page }) => {
  await page.goto('/app/');
  await openFirstRun(page);
  await page.getByRole('button', { name: 'Skip for now and look around' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
});
test('a high-risk check needs a second reviewer, and one name cannot be both', async ({ page }) => {
  await openAdmin(page);
  await goConsole(page, 'Vetting');
  await expect(page.locator('.oi-figure').filter({ hasText: 'Awaiting a second reviewer' })).toContainText('1');
  await page.getByRole('button', { name: /Brother Lwazi Mahlangu/ }).click();
  const detail = page.locator('.vetting-grid > *').last();
  const sanc = detail.locator('.vetting-check').filter({ hasText: 'SANC registration' });
  await expect(sanc).toContainText('Awaiting a second reviewer');
  await expect(detail).toContainText('SANC registration is waiting on a second reviewer.');
  // the reviewer who took the first decision cannot agree with themselves
  await page.getByLabel('Signed in as').selectOption('P. Mabaso · Clinical Director');
  await expect(sanc.getByRole('button', { name: 'You decided this' })).toBeDisabled();
  // a different name can
  await page.getByLabel('Signed in as').selectOption('T. van Wyk · Compliance');
  await sanc.getByRole('button', { name: 'Second it' }).click();
  await expect(sanc).toContainText('Verified');
  await expect(page.locator('.oi-figure').filter({ hasText: 'Awaiting a second reviewer' })).toContainText('0');
  // seconding one check does not clear the file: Thuso Kit training is still in review
  await expect(detail).toContainText('7 of 8');
  await expect(detail.locator('.vetting-check').filter({ hasText: 'Thuso Kit training' })).toContainText('In review');
});
test('a lapsed clearance suspends a nurse, and the dispatch board refuses her by name', async ({ page }) => {
  await openAdmin(page);
  await goConsole(page, 'Vetting');
  const ayanda = page.getByRole('button', { name: /Sister Ayanda Dube/ });
  await expect(ayanda).toContainText('Suspended');
  await expect(ayanda).toContainText('Police clearance lapsed');   // not a negative countdown
  // nobody had to notice: the suspension is arithmetic on the expiry date
  await ayanda.click();
  const detail = page.locator('.vetting-grid > *').last();
  await expect(detail).toContainText('Police clearance');
  await expect(detail).toContainText('Lapsed');
  // and the board will not let her be sent to a patient
  await goConsole(page, 'Operations');
  /* The board's own rows: the merged Dispatch tab also carries the shift board, which names her too. */
  const row = page.locator('.dispatch-grid .record-row').filter({ hasText: 'Sister Ayanda Dube' });
  await expect(row).toContainText('Police clearance lapsed');
  await expect(row.getByRole('button', { name: 'Cannot be assigned' })).toBeDisabled();
  // a cleared nurse on the same board still can be
  const cleared = page.locator('.dispatch-grid .record-row').filter({ hasText: 'Sister Palesa Khumalo' });
  await expect(cleared.getByRole('button', { name: 'Assign' })).toBeEnabled();
});
test('every vetting decision is written to a log the console can only add to', async ({ page }) => {
  await openAdmin(page);
  await goConsole(page, 'Vetting');
  await page.getByRole('tab', { name: 'Decision audit' }).click();
  const before = await page.locator('.vetting-event').count();
  await page.getByRole('tab', { name: 'Queue' }).click();
  await page.getByRole('button', { name: /Sister Boitumelo Nkosi/ }).click();
  const detail = page.locator('.vetting-grid > *').last();
  await detail.locator('.vetting-check').filter({ hasText: 'Thuso Kit training' }).getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('tab', { name: 'Decision audit' }).click();
  const after = await page.locator('.vetting-event').count();
  expect(after).toBeGreaterThan(before);
  await expect(page.locator('main')).toContainText('Sister Boitumelo Nkosi');
});
test('changing a price shows what the platform is actually left with', async ({ page }) => {
  await openAdmin(page);
  await goConsole(page, 'Catalogue');
  const row = page.getByRole('row', { name: /Wound care/ });
  await expect(row).toContainText('R 66');            // 299 − 224 nurse − 9 payment
  await row.getByRole('textbox').fill('260');
  await expect(row).toContainText('R 27');
  await expect(row).toHaveClass(/is-flagged/);       // too thin to carry support and review
  await expect(page.locator('.oi-figure').filter({ hasText: 'Below R40 a visit' })).toContainText('2');
});
test('funding tranches only release against milestones', async ({ page }) => {
  await openAdmin(page);
  await goConsole(page, 'Finance');
  const released = page.locator('.oi-figure').filter({ hasText: 'Released' });
  await expect(released).toContainText('R3m');
  const m3 = page.locator('.milestone-row').filter({ hasText: 'M3' });
  await expect(m3).toContainText('Releases R3.90m');
  await m3.getByRole('button', { name: 'Mark met' }).click();
  await expect(released).toContainText('R6.90m');
  await m3.getByRole('button', { name: 'Mark not met' }).click();
  await expect(released).toContainText('R3m');
});
test('the console reports against the proposal, and is honest about compliance', async ({ page }) => {
  await openAdmin(page);
  /* The back office's Overview is a tab of the merged Control Tower's Overview since Phase 3; the
     category opens on the state of the world, and the funding view is one tab along. */
  await goConsole(page, 'Overview');
  await expect(page.getByText('% of the month-9 plan').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Month 15/ })).toContainText('R1.15m');
  await goConsole(page, 'Growth');
  await expect(page.getByRole('row', { name: /Chronic Routine/ })).toContainText('R 199/m');
  await goConsole(page, 'Compliance');
  await expect(page.getByText('Nothing on this screen is a compliance status', { exact: false })).toBeVisible();
  await expect(page.locator('.control-row').filter({ hasText: 'SA hosting' })).toContainText('Not built');
});
