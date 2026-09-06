import { test, expect, type Page } from '@playwright/test';
const tab = (page: Page, index: number) => page.locator('.tabbar button').nth(index);
async function openAdmin(page: Page) {
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Admin console' }).click();
  await expect(page.getByRole('heading', { name: 'Operations console' })).toBeVisible();
}
test('signing out really closes the account, and signing back in restores it', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^First-run flow/ }).click();
  await page.getByRole('button', { name: 'Skip and explore the design preview' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
});
test('the vetting pipeline gates dispatch and records a refusal', async ({ page }) => {
  await openAdmin(page);
  await page.getByRole('button', { name: 'Nurses', exact: true }).click();
  const dispatchable = page.locator('.panel.metric').filter({ hasText: 'Dispatchable' });
  await expect(dispatchable).toContainText('1');
  const thandeka = page.locator('.admin-row').filter({ hasText: 'Sister Thandeka Zulu' });
  await expect(thandeka).toContainText('Kit & AI training');
  await thandeka.getByRole('button', { name: 'Pass this check' }).click();
  await expect(thandeka).toContainText('Dispatchable');
  await expect(thandeka.getByRole('button', { name: 'Dispatchable' })).toBeDisabled();
  await expect(dispatchable).toContainText('2');
  // a refusal is kept, with the stage it failed at, and can be reversed
  const ayanda = page.locator('.admin-row').filter({ hasText: 'Sister Ayanda Dube' });
  await ayanda.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByText('declined at “SANC & identity”')).toBeVisible();
  await page.getByRole('button', { name: 'Reinstate' }).click();
  await expect(page.locator('.admin-row').filter({ hasText: 'Sister Ayanda Dube' })).toBeVisible();
});
test('changing a price shows what the platform is actually left with', async ({ page }) => {
  await openAdmin(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  const row = page.getByRole('row', { name: /Wound care/ });
  await expect(row).toContainText('R 66');            // 299 − 224 nurse − 9 payment
  await row.getByRole('textbox').fill('260');
  await expect(row).toContainText('R 27');
  await expect(row).toHaveClass(/flagged-row/);       // too thin to carry support and review
  await expect(page.locator('.panel.metric').filter({ hasText: 'Below R40 a visit' })).toContainText('2');
});
test('funding tranches only release against milestones', async ({ page }) => {
  await openAdmin(page);
  await page.getByRole('button', { name: 'Finance', exact: true }).click();
  const released = page.locator('.panel.metric').filter({ hasText: 'Released' });
  await expect(released).toContainText('R3m');
  const m3 = page.locator('.record-row').filter({ hasText: 'M3' });
  await expect(m3).toContainText('Releases R3.90m');
  await m3.getByRole('button', { name: 'Mark met' }).click();
  await expect(released).toContainText('R6.90m');
  await m3.getByRole('button', { name: 'Mark not met' }).click();
  await expect(released).toContainText('R3m');
});
test('the console reports against the proposal, and is honest about compliance', async ({ page }) => {
  await openAdmin(page);
  await expect(page.getByText('% of the month-9 plan').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Month 15/ })).toContainText('R1.15m');
  await page.getByRole('button', { name: 'Growth', exact: true }).click();
  await expect(page.getByRole('row', { name: /Chronic Routine/ })).toContainText('R 199/m');
  await page.getByRole('button', { name: 'Compliance', exact: true }).click();
  await expect(page.getByText('Nothing on this screen is a compliance status', { exact: false })).toBeVisible();
  await expect(page.locator('.record-row').filter({ hasText: 'SA hosting' })).toContainText('Not built');
});
