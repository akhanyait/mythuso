import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
/* The patient's home and Passport, as a review of 1 October 2026 found them (both viewports).
 *
 * Held here: "next visit" is the visit at the door first — under way, then a come-now request, then the
 * booked hours soonest first, and an ended one last — rather than whichever was booked most recently; the
 * home opens on that next visit with no sample readings (5 October 2026); and the Passport is labelled
 * Preview and shows an empty state on every tab until a record exists. */
const read = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}`, import.meta.url), 'utf8'));
const passport = read('passport.json');
const dispensing = read('dispensing.json');

test('next visit is the one under way, then a come-now request, then the soonest booked hour', async ({ page }) => {
 await page.goto('/app/');
 const order = await page.evaluate(async () => {
  const m = await import('/src/lib/scheduling.ts');
  const service = { duration: 30 };
  const visit = (name: string, kind: 'scheduled' | 'asap', date?: string, start?: string) => ({ name, kind, date, start, service });
  /* Newest first, the way a booking lands on the list. */
  const visits = [
   visit('booked last, three days out', 'scheduled', '2026-10-13', '10:00'),
   visit('come now', 'asap'),
   visit('under way', 'scheduled', '2026-10-10', '11:50'),
   visit('tomorrow', 'scheduled', '2026-10-11', '09:00'),
   visit('ended yesterday', 'scheduled', '2026-10-09', '09:00')
  ];
  const now = m.instantOf('2026-10-10', '12:00');
  return m.nextFirst(visits as never[], (v: never) => v, now).map((v: { name: string }) => v.name);
 });
 expect(order).toEqual(['under way', 'come now', 'tomorrow', 'booked last, three days out', 'ended yesterday']);
});

test('the home opens on the next visit and carries no readings (5 October 2026)', async ({ page }) => {
 /* Designer's Home order: greeting, chips, then the next visit. The sample blood pressure and glucose,
    the figure cards and the readings history are gone, because a sample reading read like a real one. */
 await page.goto('/app/');
 await expect(page.locator('.pd-lead, .pd-hero').first()).toBeVisible();
 await expect(page.locator('.pd-metrics, .pd-metric, .pd-history, .pd-health')).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Your care at a glance' })).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Your health over time' })).toHaveCount(0);
});

test('the Passport shows a preview empty state on every tab, with no stored figures (5 October 2026)', async ({ page }) => {
 await page.goto('/app/');
 await goSection(page, 'Health Passport');
 await expect(page.getByText('Preview', { exact: true }).first()).toBeVisible();
 await expect(page.getByText('Nothing here is a stored record yet.').first()).toBeVisible();
 const tabs = page.getByRole('tablist', { name: 'Passport sections' });
 for (const name of ['Overview', 'Vitals', 'Results', 'Medications']) {
  await tabs.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Nothing here is a stored record yet.');
  await expect(page.getByRole('tabpanel').locator('.hp-card, .hp-row')).toHaveCount(0);
 }
});
