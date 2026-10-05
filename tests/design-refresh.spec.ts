import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const passport = JSON.parse(readFileSync(new URL('../packages/catalog/passport.json', import.meta.url), 'utf8'));
const latest = passport.readingSets.at(-1).values;

// The home carries no readings since 5 October 2026: its first card is the next visit.
test('the home opens on the next visit, with no sample readings', async ({ page }) => {
 await page.route('**/api/health', route => route.fulfill({ status: 503, body: 'Design preview' }));
 await page.goto('/app/');
 await expect(page.getByRole('region', { name: 'Your care at a glance' })).toHaveCount(0);
 await expect(page.getByText(`${latest.systolic}/${latest.diastolic}`)).toHaveCount(0);
});

test('the wellbeing invitation opens the journal composer', async ({ page }) => {
 await page.route('**/api/health', route => route.fulfill({ status: 503, body: 'Design preview' }));
 await page.goto('/app/');
 await page.getByRole('button', { name: 'Open your journal' }).click();
 await expect(page.getByRole('heading', { name: 'In your own words' })).toBeVisible();
 await expect(page.locator('textarea')).toBeVisible();
});
