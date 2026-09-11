import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('care focus changes the story and opens the corresponding destination', async ({ page }) => {
 const studio = page.getByRole('region', { name: 'Your care studio' });
 await expect(studio.getByRole('heading', { name: 'Feel good. Live fully.' })).toBeVisible();
 await studio.getByRole('tab', { name: 'For family' }).click();
 await expect(studio.getByRole('tab', { name: 'For family' })).toHaveAttribute('aria-selected', 'true');
 await expect(studio.getByRole('heading', { name: 'Close to heart. Closer to care.' })).toBeVisible();
 await studio.getByRole('button', { name: 'Meet your circle' }).click();
 await expect(page.getByRole('heading', { name: 'Care for your whole circle.' })).toBeVisible();
});

test('focus selector supports keyboard navigation and opens the passport', async ({ page }) => {
 const studio = page.getByRole('region', { name: 'Your care studio' });
 await studio.getByRole('tab', { name: 'For me' }).focus();
 await page.keyboard.press('End');
 await expect(studio.getByRole('tab', { name: 'My records' })).toBeFocused();
 await expect(studio.getByRole('tab', { name: 'My records' })).toHaveAttribute('aria-selected', 'true');
 await studio.getByRole('button', { name: 'Open my passport' }).click();
 await expect(page.locator('main')).toContainText('Health Passport');
});

test('decorative motion can be paused without disabling the care selector', async ({ page }) => {
 const studio = page.getByRole('region', { name: 'Your care studio' });
 await studio.getByRole('button', { name: 'Pause decorative motion' }).click();
 await expect(studio).not.toHaveClass(/is-moving/);
 await studio.getByRole('tab', { name: 'For family' }).click();
 await expect(studio.getByRole('button', { name: 'Meet your circle' })).toBeVisible();
 await studio.getByRole('button', { name: 'Enable decorative motion' }).click();
 await expect(studio).toHaveClass(/is-moving/);
});

test('reduced motion disables animation and narrow screens keep the controls reachable', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.setViewportSize({ width: 320, height: 844 });
 const studio = page.getByRole('region', { name: 'Your care studio' });
 await expect(studio).not.toHaveClass(/is-moving/);
 await expect(studio.getByRole('button', { name: 'Enable decorative motion' })).toBeDisabled();
 for (const name of ['For me', 'For family', 'My records']) {
  await studio.getByRole('tab', { name }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
 }
});
