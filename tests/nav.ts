import { expect, type Page } from '@playwright/test';
/* The shell is a sidebar from 1000px and a tab bar below it, and since the workspaces got their own
   navigation both carry role sections rather than the patient's tabs. Journeys go through whichever
   one the viewport actually renders. */
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
  const tab = page.locator('.tabbar button').filter({ hasText: name });
  if (await tab.count()) { await tab.first().click(); return; }
  /* On a phone the same destinations live behind More. */
  await page.locator('.tabbar button').last().click();
  const row = page.locator('.menu-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await row.first().click();
}
