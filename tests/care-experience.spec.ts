import { test, expect } from '@playwright/test';
import { goSection, confirmBooking } from './nav';

test('booking keeps choices visible and intact through an offline interruption', async ({ page, context }) => {
 await page.goto('/app/');
 await page.getByRole('button', { name: /Vitals & chronic check/ }).first().click();
 const dialog = page.getByRole('dialog');
 await dialog.getByLabel('Who is this visit for?').selectOption('Nomsa Molefe');
 await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
 await dialog.getByLabel('Visit location').fill('Home visit · Rosebank');
 await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
 await expect(dialog.getByLabel('Your booking summary')).toContainText('Nomsa');
 await dialog.getByRole('button', { name: '14:00', exact: true }).click();
 await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
 await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
 await context.setOffline(true);
 await expect(dialog.getByText(/Your choices stay here/)).toBeVisible();
 await dialog.getByRole('checkbox').check();
 await expect(dialog.getByRole('button', { name: 'Confirm & book' })).toBeDisabled();
 await expect(dialog.getByLabel('Your booking summary')).toContainText('14:00');
 await context.setOffline(false);
 await expect(dialog.getByRole('button', { name: 'Confirm & book' })).toBeEnabled();
 await dialog.getByRole('button', { name: 'Back', exact: true }).click();
 await dialog.getByRole('button', { name: 'Back', exact: true }).click();
 await dialog.getByRole('button', { name: 'Back', exact: true }).click();
 await expect(dialog.getByLabel('Visit location')).toHaveValue('Home visit · Rosebank');
 await dialog.getByRole('button', { name: 'Back', exact: true }).click();
 await expect(dialog.getByLabel('Who is this visit for?')).toHaveValue('Nomsa Molefe');
});

test('service search can recover from an empty category without losing navigation', async ({ page }) => {
 await page.goto('/app/');
 await goSection(page, 'Book a nurse');
 await page.getByRole('button', { name: 'Recovery', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Recovery', exact: true })).toHaveAttribute('aria-pressed', 'true');
 await page.getByLabel('Search services').fill('not a service');
 await expect(page.getByRole('heading', { name: 'No matching care' })).toBeVisible();
 await page.getByRole('button', { name: 'Show all services' }).click();
 await expect(page.getByLabel('Search services')).toHaveValue('');
 await expect(page.locator('.catalog-grid .service-card')).toHaveCount(15);
});

test('upcoming care leads to preparation, contact options and source verification', async ({ page }) => {
 await page.goto('/app/');
 await page.getByRole('button', { name: /Vitals & chronic check/ }).first().click();
 const booking = page.getByRole('dialog');
 for (let step=0; step<4; step++) await booking.getByRole('button', { name: 'Continue', exact: true }).click();
 await booking.getByRole('checkbox').check();
 await confirmBooking(booking);
 await booking.getByRole('button', { name: 'View my visits' }).click();
 await goSection(page, 'Overview');
 await page.getByRole('button', { name: 'Prepare for my visit' }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog.getByRole('heading', { name: 'Have this ready' })).toBeVisible();
 await expect(dialog.getByRole('button', { name: 'Contact options' })).toBeVisible();
 await dialog.getByText('View verification record', { exact: true }).click();
 await expect(dialog.getByText('Fictional preview credentials. No live registration check has been performed.')).toBeVisible();
 await expect(dialog.locator('.clinician-checks li')).toHaveCount(8);
 await expect(dialog.getByText(/A reviewing doctor may decide/)).toBeVisible();
});

test('Passport timeline filters actual records and identifies missing medicine history', async ({ page }) => {
 await page.goto('/app/');
 await goSection(page, 'Health Passport');
 await page.locator('.section-title').filter({ hasText: 'Your care timeline' }).getByRole('button', { name: 'See all' }).click();
 await page.getByRole('button', { name: 'Reviews', exact: true }).click();
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(1);
 await expect(page.locator('.timeline-status')).toHaveText('Review completed');
 await page.getByRole('button', { name: 'Visits', exact: true }).click();
 await page.getByLabel('Time period').selectOption('30');
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(1);
 await page.getByRole('button', { name: 'Medicines', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'No medicine entries on this record' })).toBeVisible();
 await page.getByRole('button', { name: 'Show all entries' }).click();
 await expect(page.getByLabel('Time period')).toHaveValue('All time');
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(8);
});
