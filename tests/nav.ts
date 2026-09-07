import { expect, type Page } from '@playwright/test';
/* The shell is a sidebar from 1000px and a tab bar below it, and since the workspaces got their own
   navigation both carry role sections rather than the patient's tabs. Journeys go through whichever
   one the viewport actually renders. */
export async function goSection(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name, exact: true }).click(); return; }
  const tab = page.locator('.tabbar button').filter({ hasText: name });
  await expect(tab.first()).toBeVisible();
  await tab.first().click();
}
