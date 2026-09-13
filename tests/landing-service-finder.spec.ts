import { expect, test } from '@playwright/test';

test('service discovery combines categories and search, then recovers without losing focus', async ({ page }) => {
 await page.goto('/');
 const section = page.locator('#services');
 const search = section.getByRole('searchbox', { name: 'Find the care you need' });
 await section.getByRole('button', { name: 'Recovery', exact: true }).click();
 await expect(section.locator('.landing-services li')).toHaveCount(2);
 await search.fill('  wound  ');
 await expect(section.locator('.landing-services li')).toHaveCount(1);
 await expect(section.getByRole('heading', { name: 'Wound care', exact: true })).toBeVisible();
 await search.fill('blood');
 await expect(section.getByRole('heading', { name: 'No services match your search.' })).toBeVisible();
 await section.getByRole('button', { name: 'Show all launch services' }).click();
 await expect(search).toBeFocused();
 await expect(search).toHaveValue('');
 await expect(section.getByRole('button', { name: 'All care', exact: true })).toHaveAttribute('aria-pressed', 'true');
 await expect(section.locator('.landing-services li')).toHaveCount(9);
 await expect(section.locator('.landing-services li').last()).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ambient service artwork rests offscreen and honours pause and runtime reduced motion', async ({ page }) => {
 await page.goto('/');
 const section = page.locator('#services');
 const ring = section.locator('.service-icon-orbit > i').first();
 await expect(section).toHaveAttribute('data-ambient', 'paused');
 await expect(ring).toHaveCSS('animation-play-state', 'paused');
 await section.scrollIntoViewIfNeeded();
 await expect(section).toHaveAttribute('data-ambient', 'visible');
 await expect(ring).toHaveCSS('animation-play-state', 'running');
 await expect(ring).toHaveCSS('animation-name', 'care-orbit-turn');
 await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
 await expect(ring).toHaveCSS('animation-name', 'none');
 await page.getByRole('button', { name: 'Play motion', exact: true }).click();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(ring).toHaveCSS('animation-name', 'none');
 await expect(page.getByRole('button', { name: 'Pause motion', exact: true })).toHaveCount(0);
});
