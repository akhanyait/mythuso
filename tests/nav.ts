import { expect, type Page } from '@playwright/test';
/* The shell is a sidebar from 1000px and a tab bar below it, and since the workspaces got their own
   navigation both carry role sections rather than the patient's tabs. Journeys go through whichever
   one the viewport actually renders.

   Both are matched by accessible name rather than by visible text: a clinical tab shows a short
   label — "Earnings", "Repeats", "Consult" — under an accessible name that is the whole section, so
   a journey can name the section once and reach it on either viewport. */
export async function goSection(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    /* Not every destination is a nav row. Privacy & settings and Language & access sit in the
       sidebar's foot as settings links, and a helper that only knew about the navigation landmark
       sent every caller into a thirty-second wait for a button that was never going to be there. */
    await page.locator('button.settings-link').filter({ hasText: name }).first().click();
    return;
  }
  /* By accessible name rather than visible text: a clinical tab shows a short label and carries the
     whole section name for a screen reader, so "Earnings & payouts" is never what is drawn. */
  const tab = page.locator('.tabbar').getByRole('button', { name, exact: true });
  if (await tab.count()) { await tab.first().click(); return; }
  /* And on a phone the rest of the patient's sections live behind More. */
  await page.locator('.tabbar button').last().click();
  const row = page.locator('.menu-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await row.first().click();
}

/* The three applications, each at its own entry.
 *
 * There is no workspace picker inside the product any more — a role is what an account carries, and
 * the only reason a journey gets to choose one here is that the identity service is switched off,
 * which is exactly what the signed-out staff screen says on itself. */
export async function openWorkspace(page: Page, role: string) {
  await page.goto('/staff.html');
  await page.locator('.staff-signin-roles .record-row').filter({ has: page.getByText(role, { exact: true }) }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('navigation', { name: 'Main navigation' })).first()).toBeVisible();
}
export async function openAdminConsole(page: Page) {
  await page.goto('/admin.html');
  await page.locator('.staff-signin-roles .record-row').click();
  await expect(page.getByRole('heading', { name: 'Operations console' })).toBeVisible();
}

/* Explore MyThuso is the patient's roadmap page and the door to the first-run flow, the state
   gallery and the module previews. It is a sidebar entry on a wide screen and lives behind More on
   a phone, which is why it needs a helper of its own rather than goSection. */
export async function goExplore(page: Page) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  await page.locator('.menu-row').filter({ hasText: 'Explore MyThuso' }).first().click();
}
export async function openFirstRun(page: Page) {
  await goExplore(page);
  /* The design-review card called "First-run & recovery" is gone with the rest of the scaffolding.
     Sign-up is reached the way a person reaches it: the highlighted card that offers to set the
     account up. */
  await page.locator('.module-card').filter({ hasText: 'Set up your account' }).click();
}
export async function openModule(page: Page, name: string) {
  await goExplore(page);
  await page.locator('.module-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
}
