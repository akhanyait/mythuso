import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
 await dialog.getByRole('button', { name: 'Continue', exact: true }).click(); // nurse → when, whoever is nearest
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
 for (let step=0; step<5; step++) await booking.getByRole('button', { name: 'Continue', exact: true }).click();
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

/* The timeline is the Passport's History tab since the Lovable alignment of 30 September 2026, drawn as a rail.
   It used to say "No medicine entries on this record" beside a prescription screen counting the repeats left
   on an authorisation; the medicines are dispensing.json's now, so this counts them from the contract. */
const dispensing = JSON.parse(readFileSync(new URL('../packages/catalog/dispensing.json', import.meta.url), 'utf8'));
const passportContract = JSON.parse(readFileSync(new URL('../packages/catalog/passport.json', import.meta.url), 'utf8'));
test('Passport timeline filters actual records and reads the medicines from the dispensing contract', async ({ page }) => {
 await page.goto('/app/');
 await goSection(page, 'Health Passport');
 await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'History' }).click();
 await page.getByRole('button', { name: 'Reviews', exact: true }).click();
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(1);
 await expect(page.locator('.timeline-status')).toHaveText('Review completed');
 await page.getByRole('button', { name: 'Visits', exact: true }).click();
 await page.getByLabel('Time period').selectOption('30');
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(1);
 await page.getByRole('button', { name: 'Medicines', exact: true }).click();
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(1);
 await expect(page.locator('.care-timeline .record-row')).toContainText(`Prescription ${dispensing.prescription.reference} issued`);
 await page.getByLabel('Time period').selectOption('All time');
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(2);
 await expect(page.locator('.care-timeline .record-row').last()).toContainText(dispensing.authorisation.reference);
 await page.getByRole('button', { name: 'All entries', exact: true }).click();
 await expect(page.locator('.care-timeline .record-row')).toHaveCount(passportContract.readingSets.length + 1 + passportContract.documents.length + 2);
});
