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

/* The rings that used to turn behind every service icon are gone; what the section has instead is
   one finite settle when a filter resolves. It runs on the list, never on a card a reader is about
   to press, and under reduced motion it is not applied at all — the list is simply there. */
test('a resolved filter settles once, and not at all under reduced motion', async ({ page }) => {
 await page.goto('/');
 const section = page.locator('#services');
 const list = section.locator('.landing-services');
 await expect(section.locator('.service-icon-orbit')).toHaveCount(0);
 await section.getByRole('button', { name: 'Recovery', exact: true }).click();
 await expect(list).toHaveCSS('animation-name', 'service-settle');
 await expect(list.locator('li').last()).toBeVisible();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(list).toHaveCSS('animation-name', 'none');
 await expect(list.locator('li').last()).toBeVisible();
});
