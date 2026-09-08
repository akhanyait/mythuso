import { test, expect, type Page } from '@playwright/test';
/* Thuso Kit: pairing, capture, the offline queue and the four conflicts a queue actually produces.
   The point of these three journeys is not that the screens render. It is that a reading carries
   where it came from — device, hand or patient — all the way from the instrument to the
   consultation record, and that the queue refuses to merge anything on its own. */
const overflow = (page: Page) => page.evaluate(() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; });
test('kit surface: pair, capture, queue, all four conflicts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Thuso Kit/ }).click();
  const d = page.getByRole('dialog');
  await expect(d.locator('.not-connected')).toContainText('No device is connected');
  await expect(d.getByText(/This queue is held in memory/)).toBeVisible();
  // pairing
  await d.getByRole('button', { name: 'Look for instruments' }).click();
  await expect(d.getByText('MT-GL-1157 · Bluetooth Low Energy')).toBeVisible();
  await expect(d.getByText('Calibration overdue').first()).toBeVisible();
  await d.locator('.kit-device').filter({ hasText: 'Glucose meter' }).getByRole('button', { name: 'Pair' }).click();
  // capture: the note is on screen, and the strip lot gates the reading while the calibration does not
  await d.getByLabel('Instrument').selectOption({ index: 1 });
  await expect(d.getByText(/Strips expire separately from the meter/).first()).toBeVisible();
  await expect(d.getByText(/days past its calibration date/).first()).toBeVisible();
  await d.getByLabel('What to measure').selectOption('glucose');
  await expect(d.getByRole('button', { name: 'Take a reading' })).toBeDisabled();
  await d.getByLabel('Which strip lot, and when does it expire?').selectOption('Lot 23K902 · expired Jun 2026');
  await d.getByRole('button', { name: 'Take a reading' }).click();
  await expect(d.getByText('Invented reading · nothing was measured')).toBeVisible();
  await d.getByRole('button', { name: 'Hold it on this device' }).click();
  await d.getByRole('button', { name: /Finish and seal/ }).click();
  await expect(overflow(page)).resolves.toBe(true);
  // send
  await expect(d.getByRole('button', { name: /^Send/ })).toBeDisabled();
  await d.getByRole('button', { name: 'Connection: off' }).click();
  await d.getByRole('button', { name: /^Send/ }).click();
  // in flight first: the send settles on a timer, and asserting the outcome without waiting for the
  // state in between raced the timer under a loaded machine
  await expect(d.getByText('Sending').first()).toBeVisible({ timeout: 5000 });
  await expect(d.getByText('Two readings, one observation').first()).toBeVisible({ timeout: 8000 });
  await expect(d.getByText(/The capturer.s standing lapsed/)).toBeVisible();
  await expect(d.getByText(/The instrument's own clock is|The instrument’s own clock is/).first()).toBeVisible();
  // duplicate: choose one, other superseded
  const dup = d.locator('.kit-conflict').filter({ hasText: 'Two readings, one observation' }).first();
  await dup.locator('.panel').filter({ hasText: 'Arrived from the queue' }).getByRole('button', { name: 'This one stands' }).click();
  await expect(d.getByText(/marked superseded/).first()).toBeVisible();
  // lapsed nurse: refused countersigner, then a cleared one
  const lapsed = d.locator('.kit-conflict').filter({ hasText: /The capturer.s standing lapsed/ });
  await lapsed.getByLabel('Countersigned by').selectOption('D-402');
  await expect(lapsed.getByRole('button', { name: 'Countersign and file' })).toBeDisabled();
  await lapsed.getByLabel('Countersigned by').selectOption('D-401');
  await lapsed.getByRole('button', { name: 'Countersign and file' }).click();
  await expect(d.getByText(/stays on the reading as the person who took it/).first()).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});
test('assessment carries provenance through to the consultation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText('Nurse', { exact: true }) }).click();
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Start observations' }).click();
  await d.getByLabel('Blood pressure — systolic').fill('165');
  await expect(d.locator('.obs-field').filter({ hasText: 'systolic' }).locator('.prov-manual').first()).toBeVisible();
  await d.getByLabel('Blood pressure — diastolic').fill('95');
  await expect(d.getByText('Mean arterial pressure')).toBeVisible();
  // patient-reported re-attribution
  await d.getByLabel('Blood glucose').fill('12');
  const glucose = d.locator('.obs-field').filter({ hasText: 'Blood glucose' });
  await glucose.getByRole('button', { name: 'She told me this' }).click();
  await expect(glucose.locator('.prov-patient-reported')).toBeVisible();
  // device capture into the assessment
  await d.getByRole('button', { name: 'Take a reading from a paired instrument' }).click();
  await d.getByRole('button', { name: 'Look for instruments' }).click();
  await d.locator('.kit-device').filter({ hasText: 'Pulse oximeter' }).getByRole('button', { name: 'Pair' }).click();
  await d.getByLabel('Instrument').selectOption({ index: 1 });
  await d.getByLabel('What to measure').selectOption('oxygen');
  await d.getByLabel('Where is the probe, and how is the trace?').selectOption({ index: 1 });
  await d.getByRole('button', { name: 'Take a reading' }).click();
  await d.getByRole('button', { name: 'Add to the assessment' }).click();
  const ox = d.locator('.obs-field').filter({ hasText: 'Oxygen saturation' });
  await expect(ox.locator('.prov-device')).toBeVisible();
  await expect(ox.locator('.calib-due')).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await expect(d.getByText('165 mmHg ⚠')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Sign assessment' })).toBeEnabled();
  await d.getByRole('button', { name: 'Sign assessment' }).click();
  await d.getByRole('button', { name: /Open the consultation record/ }).click();
  await expect(d.getByText('Blood pressure — systolic')).toBeVisible();
  await expect(d.locator('.review-line').filter({ hasText: 'Oxygen saturation' }).locator('.prov-device').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('patient file vitals carry origins', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Patient file' }).click();
  await expect(page.locator('.pf-vital').filter({ hasText: 'Blood pressure' }).locator('.prov-device')).toBeVisible();
  await expect(page.locator('.pf-vital').filter({ hasText: 'Weight' }).locator('.prov-patient-reported')).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});
