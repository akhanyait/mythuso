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
