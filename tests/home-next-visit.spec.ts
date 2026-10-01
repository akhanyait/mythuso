import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
/* The patient's home and Passport, as a review of 1 October 2026 found them (both viewports).
 *
 * Held here: "next visit" is the visit at the door first — under way, then a come-now request, then the
 * booked hours soonest first, and an ended one last — rather than whichever was booked most recently; the
 * line under the home's readings is passport.json#onRecord's, so the readings are dated and marked as
 * samples; the Passport's overview badge counts the figures it shows and says so; and the prescription
 * card lists what the doctor wrote, with what the pharmacy handed over instead beside a substitution. */
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

test('the home’s readings carry passport.json’s on-record line: how many visits, the last day, and that they are samples', async ({ page }) => {
 await page.goto('/app/');
 const [before, after] = passport.onRecord.sentence.split('{date}');
 const line = page.locator('.pd-health .pd-card-lead');
 await expect(line).toContainText(before.replace('{count}', String(passport.readingSets.length)));
 await expect(line).toContainText(after.trim());
 await expect(line).toContainText('Sample readings.');
});

test('the Passport’s overview badge counts the figures it shows, and the prescription lists what the doctor wrote', async ({ page }) => {
 await page.goto('/app/');
 await goSection(page, 'Health Passport');
 const tabs = page.getByRole('tablist', { name: 'Passport sections' });
 const shown = passport.headline.measures.length;
 await expect(page.getByRole('tabpanel').locator('.hp-card').first()).toContainText(new RegExp(`of the ${shown} shown outside range|All ${shown} shown inside range`));

 await tabs.getByRole('tab', { name: 'Medications', exact: true }).click();
 const rows = page.getByRole('tabpanel').locator('.hp-row');
 await expect(rows).toHaveCount(dispensing.prescription.items.length);
 for (const item of dispensing.prescription.items) {
  const row = rows.filter({ hasText: item.prescribed });
  await expect(row).toHaveCount(1);
  if (item.outcome === 'substituted') await expect(row).toContainText(item.dispensed);
  else await expect(row).not.toContainText('Substituted');
 }
 const substituted = dispensing.prescription.items.filter((i: { outcome: string }) => i.outcome === 'substituted').length;
 await expect(page.getByRole('tabpanel')).toContainText(`${substituted} substituted at the pharmacy`);
});
