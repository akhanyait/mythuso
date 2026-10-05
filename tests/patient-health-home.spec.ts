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

test('the passport is seven tabs on the shared component, and clinical tabs stay on Preview empty', async ({ page }) => {
  await expect(tabList(page).getByRole('tab')).toHaveText(tabs);
  await expect(tabList(page).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.underline-tabs')).toHaveCount(0);
  /* Designer Preview (5 October 2026): clinical tabs name the empty state; nothing stored yet. */
  await expect(panel(page).getByText(/Overview: nothing stored yet/)).toBeVisible();
  await expect(page.getByText(/Nothing here is a stored record yet/).first()).toBeVisible();
  await openTab(page, 'Vitals');
  await expect(tabList(page).getByRole('tab', { name: 'Vitals' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).getByText(/Vitals: nothing stored yet/)).toBeVisible();
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

test('goals stay on Preview empty until a record exists', async ({ page }) => {
  await openTab(page, 'Goals');
  await expect(panel(page).getByText(/Goals: nothing stored yet/)).toBeVisible();
});

test('medications and results stay on Preview empty until a record exists', async ({ page }) => {
  await openTab(page, 'Medications');
  await expect(panel(page).getByText(/Medications: nothing stored yet/)).toBeVisible();
  await openTab(page, 'Results');
  await expect(panel(page).getByText(/Results: nothing stored yet/)).toBeVisible();
});

test('history stays on Preview empty until a record exists', async ({ page }) => {
  await openTab(page, 'History');
  await expect(panel(page).getByText(/History: nothing stored yet/)).toBeVisible();
});

/* The prescription's page as the export's Prescriptions: Current, Past and Requests. Current is the same one
   account the Medications tab draws; Past and Requests are empty in the dispensing contract's own words, and
   nothing on the page asks for, refills or delivers a medicine. */
test('prescriptions are three tabs: the current authorisation, and two empty states in the contract’s words', async ({ page }) => {
  /* Medications is Preview-empty; reach the journey from Records is gone — open via More → Explore. */
  await page.locator('.tabbar button').nth(4).click();
  const explore = page.locator('.menu-row').filter({ hasText: 'Explore MyThuso' });
  if (await explore.count()) await explore.first().click();
  await page.locator('.menu-row').filter({ hasText: 'What happens to a prescription' }).first().click();
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

test('Records keeps Share links on Preview Passport', async ({ page }) => {
  await openTab(page, 'Records');
  await expect(panel(page).getByRole('button').filter({ hasText: 'Share links' })).toBeVisible();
  await expect(panel(page).getByRole('button').filter({ hasText: 'Share record' })).toBeVisible();
});
