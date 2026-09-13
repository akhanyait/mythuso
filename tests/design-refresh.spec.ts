import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const passport = JSON.parse(readFileSync(new URL('../packages/catalog/passport.json', import.meta.url), 'utf8'));
const latest = passport.readingSets.at(-1).values;

// A home reading must open the same record, and the journal card must reach the real composer.
test('the care overview uses Passport readings and opens their record', async ({ page }) => {
 await page.route('**/api/health', route => route.fulfill({ status: 503, body: 'Design preview' }));
 await page.goto('/app/');
 const overview = page.getByRole('region', { name: 'Your care at a glance' });
 const pressure = overview.getByRole('button').filter({ hasText: 'Blood pressure' });
 await expect(pressure).toContainText(`${latest.systolic}/${latest.diastolic}`);
 await expect(overview.getByRole('button').filter({ hasText: 'Blood glucose' })).toContainText(String(latest.glucose));
 await pressure.click();
 await expect(page.locator('main h1')).toContainText('Health Passport');
});

test('the wellbeing invitation opens the journal composer', async ({ page }) => {
 await page.route('**/api/health', route => route.fulfill({ status: 503, body: 'Design preview' }));
 await page.goto('/app/');
 await page.getByRole('button', { name: 'Open your journal' }).click();
 await expect(page.getByRole('heading', { name: 'In your own words' })).toBeVisible();
 await expect(page.locator('textarea')).toBeVisible();
});
