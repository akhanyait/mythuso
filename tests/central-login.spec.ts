import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const roles = [
 ['patient', 'Patient', null], ['nurse', 'Nurse', 'daily-schedule'],
 ['doctor', 'Doctor', 'Review queue'], ['partner', 'Pharmacy partner', 'Orders'],
 ['control-tower', 'Control Tower', 'Dispatch'], ['back-office', 'Back office', 'Overview']
] as const;

for (const [id, label, heading] of roles) {
 test(`main-site login opens the ${label} dashboard and survives refresh`, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Log in to MyThuso' });
  await expect(dialog).toBeVisible();
  await dialog.locator('.record-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?role=${id}$`));
  const dashboard = heading === 'daily-schedule' ? page.getByRole('heading', { level: 1 }) : heading
   ? page.getByRole('heading', { name: heading, exact: true, level: 1 })
   : page.locator('.patient-surface.app-shell');
  await expect(dashboard).toBeVisible();
  if (id === 'nurse') await expect(page).toHaveTitle('Schedule · Nurse · MyThuso');
  await page.reload();
  await expect(dashboard).toBeVisible();
  await expect(page.locator('.demo-bar')).toBeVisible();
 });
}

test('role changes clear patient deep links and browser history restores the correct role', async ({ page }) => {
 await page.goto('/?role=patient&open=my-family');
 await expect(page.getByRole('heading', { name: 'Care for your whole circle.', exact: true, level: 1 })).toBeVisible();
 async function choose(label: string) {
  await page.locator('.demo-login-all').click();
  await page.getByRole('dialog').locator('.record-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) }).click();
 }
 await choose('Doctor');
 await expect(page.getByRole('heading', { name: 'Review queue', exact: true, level: 1 })).toBeVisible();
 await expect(page).toHaveURL('/?role=doctor');
 await choose('Patient');
 await expect(page.locator('.patient-surface.app-shell')).toBeVisible();
 await expect(page).toHaveURL('/?role=patient');
 await expect(page.getByRole('heading', { name: 'Care for your whole circle.', exact: true, level: 1 })).toHaveCount(0);
 await page.goBack();
 await expect(page.getByRole('heading', { name: 'Review queue', exact: true, level: 1 })).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('heading', { name: 'Care for your whole circle.', exact: true, level: 1 })).toBeVisible();
});

test('closing login keeps the public site and keyboard focus', async ({ page }) => {
 await page.goto('/');
 const login = page.getByRole('button', { name: 'Log in', exact: true });
 await login.click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(login).toBeFocused();
 await expect(page).toHaveURL('/');
});

/* The handoff's two-column access dialog (30 September 2026): a brand column beside the picker where there is
   room for it, and none on a phone. What the picker says is untouched — the accounts notice comes with it,
   word for word — and the column says what the picker is rather than what an account would be. */
const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const loginWords: { eyebrow: string; headline: string[]; body: string } = read('packages/catalog/hero.json').stage.login;
/* NotConnected's own rule (lib/capabilities.ts noticeFor): a simulated capability says its simulation's sentence. */
const accountsEntry: { notice: string; simulation?: { notice: string } } = read('packages/catalog/capabilities.json').capabilities.find((c: { id: string }) => c.id === 'accounts');
const accountsNotice = accountsEntry.simulation?.notice ?? accountsEntry.notice;

test('the login dialog stands a brand column beside the picker on a wide screen, and keeps its notice', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Log in', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Log in to MyThuso' });
 await expect(dialog.locator('.not-connected')).toHaveText(accountsNotice);
 await expect(dialog.locator('.record-row')).toHaveCount(6);
 const brand = dialog.locator('.login-brand');
 if (page.viewportSize()!.width >= 900) {
  await expect(brand).toBeVisible();
  await expect(brand.locator('.login-brand-headline')).toHaveText(loginWords.headline.join(''));
  await expect(brand).toContainText(loginWords.body);
  const [left, right] = await Promise.all([brand.boundingBox(), dialog.locator('.login-roles').boundingBox()]);
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 1);
 } else await expect(brand).toBeHidden();
 /* There are no accounts, so nothing here may say an account is secure or that anybody is signed in. */
 await expect(dialog).not.toContainText(/secure|signed in/i);
 expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
