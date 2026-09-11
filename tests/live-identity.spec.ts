import { test, expect } from '@playwright/test';
/* Runs only when an identity service is answering through the app's own /api proxy.
   Start one with `npm run api`. Without it the suite skips, because the design preview is
   deliberately able to run with no backend at all. */
test.beforeEach(async ({ page }) => {
  const reachable = await page.request.get('/api/health').then(r => r.ok()).catch(() => false);
  test.skip(!reachable, 'no identity service on /api — run `npm run api`');
});
test('a real one-time code signs you in, and signing out ends the session', async ({ page }) => {
  await page.goto('/');
  // with a service answering, the preview stops pretending: you have to sign in
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
  /* The chip says what is true rather than what would be convenient: a service answering on this
     machine is not the accounts capability being connected, and the sentence changed when that
     distinction was drawn. This assertion did not, and it only skips rather than fails because the
     spec needs `npm run api` to run at all. */
  await expect(page.getByText('Identity service is answering on this machine')).toBeVisible();
  await page.getByLabel('Mobile number').fill('082');
  await expect(page.getByRole('button', { name: 'Send my code' })).toBeDisabled();
  await page.getByLabel('Mobile number').fill('0824445555');
  await page.getByRole('button', { name: 'Send my code' }).click();
  const hint = page.getByText(/the code is/);
  await expect(hint).toBeVisible();
  const code = (await hint.textContent())!.match(/the code is (\d{6})/)![1];
  await page.getByLabel('Verification code, digit 1 of 6').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code doesn’t match. Check the message and try again.')).toBeVisible();
  await page.getByLabel('Verification code, digit 1 of 6').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
  // the session is a cookie the page cannot read
  const cookies = await page.context().cookies();
  const session = cookies.find(c => c.name === 'mythuso_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Strict');
  expect(await page.evaluate(() => document.cookie)).not.toContain('mythuso_session');
  // and it survives a reload, because it is a real session rather than a flag in memory
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await page.getByRole('button', { name: /^Log out/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
});
