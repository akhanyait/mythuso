import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
/* The Health Passport as the export's tabbed "My Health" (30 September 2026).
 *
 * What is held here is what a restyle would most easily undo: every figure on the home is the contract's and
 * can be checked against it, the panels the export fills with invented numbers stay honest (no weight, no
 * progress bar, no "Improving", no "On track"), the Goals tab is wellbeing.json's refusal word for word, and
 * the History rail carries every event the record and the dispensing contract hold. Both viewports. */
const read = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}`, import.meta.url), 'utf8'));
const passport = read('passport.json');
const dispensing = read('dispensing.json');
const wellbeing = read('wellbeing.json');
const latest = passport.readingSets.at(-1).values as Record<string, number>;
const tabs = ['Overview', 'Vitals', 'Results', 'Medications', 'History', 'Goals', 'Records'];

const tabList = (page: Page) => page.getByRole('tablist', { name: 'Passport sections' });
const panel = (page: Page) => page.getByRole('tabpanel');
async function openTab(page: Page, name: string) {
  await tabList(page).getByRole('tab', { name, exact: true }).click();
  await expect(tabList(page).getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  await expect(page.getByRole('heading', { level: 1, name: 'Health Passport' })).toBeVisible();
});

test('the passport is seven tabs on the shared component, and the overview figures are the record’s', async ({ page }) => {
  await expect(tabList(page).getByRole('tab')).toHaveText(tabs);
  await expect(tabList(page).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.underline-tabs')).toHaveCount(0);
  /* One tile per headline measure, each carrying the last visit's value out of passport.json. */
  const tiles = panel(page).locator('.hp-stat');
  await expect(tiles).toHaveCount(passport.headline.measures.length);
  for (const [i, id] of (passport.headline.measures as string[]).entries())
    await expect(tiles.nth(i).locator('.hp-stat__value')).toContainText(String(latest[id]));
  /* Nothing is booked from this account yet, so the next-visit card says so in scheduling.json's words. */
  await expect(panel(page).getByRole('heading', { name: read('scheduling.json').labels.noUpcoming })).toBeVisible();
  /* The jump buttons choose a tab rather than leaving the page. */
  await panel(page).getByRole('button', { name: 'Review your vitals' }).click();
  await expect(tabList(page).getByRole('tab', { name: 'Vitals' })).toHaveAttribute('aria-selected', 'true');
});

test('the arrow keys move between the passport’s tabs', async ({ page }) => {
  await tabList(page).getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabList(page).getByRole('tab', { name: 'Vitals' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabList(page).getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');
});

test('no tab draws what the export invents: no weight, no progress bar, no verdict, no goal', async ({ page }) => {
  for (const name of tabs) {
    await openTab(page, name);
    await expect(panel(page)).not.toContainText(/\bBMI\b|Weight|Improving|On track|30-day average|Take now/);
    await expect(panel(page).locator('[role="progressbar"], progress, meter')).toHaveCount(0);
    expect(await page.evaluate(() => { const m = document.querySelector('main')!; return m.scrollWidth <= m.clientWidth; })).toBe(true);
  }
});

test('goals are the wellbeing contract’s refusal, with a door to care plans', async ({ page }) => {
  await openTab(page, 'Goals');
  const refuse = (id: string) => wellbeing.refusals.find((r: { id: string }) => r.id === id).sentence;
  await expect(panel(page).getByText(refuse('no-target'))).toBeVisible();
  await expect(panel(page).getByText(refuse('no-cheerfulness-about-illness'))).toBeVisible();
  await panel(page).getByRole('button', { name: 'Open Care plans' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'A healthier rhythm.' })).toBeVisible();
});

test('medications are the dispensing contract’s one account, and results are documents with their review', async ({ page }) => {
  await openTab(page, 'Medications');
  await expect(panel(page).getByText(`${dispensing.authorisation.reference} · authorised`)).toBeVisible();
  const repeatsLeft = dispensing.authorisation.repeatsAuthorised - dispensing.authorisation.repeatsUsed;
  await expect(panel(page).locator('.lead')).toContainText(String(repeatsLeft));
  await expect(panel(page).locator('.hp-row')).toHaveCount(dispensing.prescription.items.length);
  await expect(panel(page)).not.toContainText('No active prescriptions');

  await openTab(page, 'Results');
  const results = passport.documents.filter((d: { kind: string }) => /report/i.test(d.kind));
  await expect(panel(page).locator('.hp-row')).toHaveCount(results.length);
  for (const doc of results) await expect(panel(page).locator('.hp-row').filter({ hasText: doc.name })).toContainText(doc.reviewed ? 'Doctor reviewed' : 'Awaiting review');
  await expect(panel(page)).not.toContainText('Normal');
});

test('history is a rail of every event the record and the dispensing contract hold', async ({ page }) => {
  await openTab(page, 'History');
  const rail = panel(page).locator('.hp-rail__item');
  await expect(rail).toHaveCount(passport.readingSets.length + 1 + passport.documents.length + 2);
  await expect(panel(page).locator('.hp-rail__node')).toHaveCount(await rail.count());
  await expect(rail.filter({ hasText: dispensing.authorisation.reference })).toHaveCount(1);
  /* Each card still opens on what the act produced. */
  await rail.filter({ hasText: 'Doctor review completed' }).getByRole('button').first().click();
  await expect(panel(page).getByText(passport.lastReview.assessment)).toBeVisible();
});

/* The prescription's page as the export's Prescriptions: Current, Past and Requests. Current is the same one
   account the Medications tab draws; Past and Requests are empty in the dispensing contract's own words, and
   nothing on the page asks for, refills or delivers a medicine. */
test('prescriptions are three tabs: the current authorisation, and two empty states in the contract’s words', async ({ page }) => {
  await openTab(page, 'Medications');
  await page.getByRole('button', { name: /What happens after a doctor signs one/ }).click();
  await expect(page.getByRole('heading', { name: 'What happens to a prescription.' })).toBeVisible();
  const rx = page.getByRole('tablist', { name: 'Prescriptions' });
  await expect(rx.getByRole('tab')).toHaveText(['Current', 'Past', 'Requests']);
  const rxPanel = page.locator('#rx-panel');
  await expect(rxPanel.getByText(`${dispensing.authorisation.reference} · authorised`)).toBeVisible();
  await expect(rxPanel.getByRole('heading', { name: `Prescription ${dispensing.prescription.reference}` })).toBeVisible();
  await expect(rxPanel.locator('.hp-row')).toHaveCount(dispensing.prescription.items.length);
  await rx.getByRole('tab', { name: 'Past' }).click();
  await expect(rxPanel).toContainText(dispensing.rules.find((r: { id: string }) => r.id === 'ends-in-a-review').sentence);
  await expect(rxPanel.locator('.hp-row')).toHaveCount(0);
  await rx.getByRole('tab', { name: 'Requests' }).click();
  await expect(rxPanel).toContainText(dispensing.refusals.find((r: { id: string }) => r.id === 'software-renewal').sentence);
  await expect(page.getByRole('button', { name: /request a (new )?prescription|refill|deliver/i })).toHaveCount(0);
  /* The handover under the tabs is unchanged. */
  await expect(page.locator('.timeline li')).toHaveCount(dispensing.handover.length);
  const overflow = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('main')].filter(el => el.scrollWidth > el.clientWidth + 1).length);
  expect(overflow).toBe(0);
});
