import { test, expect } from '@playwright/test';

/* The visual approval adds an explorable scenario, never a dispatch mutation. */
test('province scenario can filter, scrub, reset and honour reduced motion', async ({ page }) => {
 await page.goto('/app/?role=control-tower&category=dispatch&tab=board');
 const map = page.locator('.pt-province');
 await expect(map.getByRole('heading', { name: 'Care, across Gauteng.' })).toBeVisible();
 await expect(map).toContainText('No real visits, staff locations or dispatch actions');
 await expect(map.locator('.pt-map-sample')).toHaveCount(3);
 await map.getByRole('button', { name: 'Needs review', exact: true }).click();
 await expect(map.locator('.pt-map-sample')).toHaveCount(1);
 await expect(map.locator('.pt-map-detail')).toContainText('Soweto');
 const slider = map.getByRole('slider', { name: 'Scenario progress' });
 await slider.fill('65');
 await expect(map.locator('output')).toHaveText('65%');
 await map.getByLabel('Show sample connections').uncheck();
 await expect(map.locator('.pt-map-route path')).toHaveCount(0);
 await map.getByRole('button', { name: 'Reset view', exact: true }).click();
 await expect(map.locator('.pt-map-sample')).toHaveCount(3);
 await expect(slider).toHaveValue('0');
 await expect(map.getByLabel('Show sample connections')).toBeChecked();
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(map.getByRole('button', { name: 'Play demo', exact: true })).toBeDisabled();
 await slider.fill('35');
 await expect(map.locator('output')).toHaveText('35%');
});

test('province replay pauses without changing the sample queue', async ({ page }) => {
 await page.goto('/app/?role=control-tower&category=dispatch&tab=board');
 const map = page.locator('.pt-province');
 await map.getByRole('button', { name: 'Play demo', exact: true }).click();
 await expect.poll(async () => Number(await map.getByRole('slider').inputValue())).toBeGreaterThan(0);
 await map.getByRole('button', { name: 'Pause demo', exact: true }).click();
 const stopped = await map.getByRole('slider').inputValue();
 await page.waitForTimeout(250);
 await expect(map.getByRole('slider')).toHaveValue(stopped);
 await expect(map.locator('.pt-map-sample')).toHaveCount(3);
});
