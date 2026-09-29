import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Light by default, dark by choice — the founder's decision of 29 September 2026 after seeing the whole
 * product go dark under a dark OS scheme. The page must be light under a dark system scheme, the switch
 * must turn the dark roles on, and a reload must come back light because the web keeps nothing. */
const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8'));
const light = tokens.semantic.light.background.hex.toLowerCase();
const dark = tokens.semantic.dark.background.hex.toLowerCase();
const ground = (page: import('@playwright/test').Page) =>
 page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim().toLowerCase());

for (const path of ['/landing.html', '/app/']) {
 test(`${path}: light under a dark system scheme, dark only by the switch, light again on reload`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(path);
  expect(await ground(page)).toBe(light);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByRole('button', { name: 'Dark theme' }).first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await ground(page)).toBe(dark);
  await expect(page.getByRole('button', { name: 'Light theme' }).first()).toBeVisible();
  await page.reload();
  expect(await ground(page)).toBe(light);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
 });
}
