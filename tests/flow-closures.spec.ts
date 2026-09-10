import { noticeFor } from './notices';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* Read rather than imported: a JSON import needs an attribute under Node's ESM loader, and every
   other spec in this suite reads its contract the same way. */
const passport = JSON.parse(readFileSync(new URL('../packages/catalog/passport.json', import.meta.url), 'utf8'));
import { goSection, openWorkspace } from './nav';

/* The rows docs/FLOW-COMPLETENESS.md listed as open, held so they cannot re-open.
 *
 * That document's own complaint about itself is that it is prose, and prose does not re-run:
 * several of its rows were stale within a day of being written and two of them were stale by the
 * time this file was added — the referral letter and the returned question had both been built and
 * the rows still said they had not. tests/journeys.spec.ts holds one class of defect, a navigation
 * name with no screen behind it. Every row below is the other class: something reached from inside
 * a screen — a card, a document row, a button on a queue — which no navigation walk can see.
 *
 * What is asserted is that the journey continues and that it continues to the right thing. Nothing
 * here reads a capability notice: fifteen capabilities are declared and none is connected, and a
 * screen that finishes by saying so is finished. */

const patientTab: Record<string, string> = {
  'Overview': 'Home', 'Book a nurse': 'Book care', 'My visits': 'Visits', 'Health Passport': 'Passport'
};
async function goPatient(page: Page, name: string) {
  const sidebar = page.locator('.sidebar');
  if (await sidebar.isVisible()) {
    const row = sidebar.locator('nav[aria-label="Main navigation"] button, button.settings-link').filter({ hasText: name });
    if (await row.count()) { await row.first().click(); return; }
    await page.locator('.app-footer button').filter({ hasText: 'Help' }).click();
    return;
  }
  const short = patientTab[name];
  if (short) { await page.locator('.tabbar button').filter({ hasText: short }).first().click(); return; }
  await page.locator('.tabbar button').last().click();
  await page.locator('.menu-row').filter({ hasText: name }).first().click();
}

/* ---- The blocking row --------------------------------------------------------------------------
   "Not sure what you need? Chat to our care team", at the foot of the booking catalogue, opened the
   four-step booking modal for Vitals & chronic check: a person who had just said they did not know
   what to book was handed a booking. */
test('the care-team row says what help exists rather than opening an unrelated booking', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Book a nurse');
  await page.locator('.menu-row').filter({ hasText: 'Not sure what you need?' }).click();

  /* Not a dialog, and specifically not the booking one. */
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Not sure what you need?' })).toBeVisible();
  /* The contract's own sentence about why nobody can be written to, word for word — read from the
     contract rather than copied into it, because it was copied and then the contract moved. */
  await expect(page.getByText(noticeFor('messaging'))).toBeVisible();
  await expect(page.getByText('Nothing on this screen opens a conversation, joins a queue or tells anybody you were here.')).toBeVisible();

  /* And the three things that do exist. The emergency route leads, because somebody who cannot
     decide what to book is occasionally somebody who should not be booking. */
  const routes = page.locator('.menu-list .menu-row');
  await expect(routes.first()).toContainText('If it will not wait');
  await routes.filter({ hasText: 'Read what each visit is for' }).click();
  await expect(page.getByRole('heading', { name: 'Professional care at your door' })).toBeVisible();
});

/* ---- The Health Passport's four --------------------------------------------------------------- */
test('a visit on the care timeline opens on what it recorded', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Health Passport');
  await page.locator('.record-row').filter({ hasText: 'Nurse home visit' }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Everything on your record.' })).toBeVisible();

  /* Four visits, one doctor review and three documents, each opening on what it produced. */
  const rows = page.locator('.explain-row');
  expect(await rows.count()).toBeGreaterThan(6);
  await rows.filter({ hasText: 'Nurse home visit' }).first().click();
  /* The readings, against the ranges the record contract holds them to — never typed on a screen. */
  await expect(page.getByRole('row', { name: /Oxygen saturation/ }).first()).toContainText('95–100 %');
  await expect(page.getByRole('row', { name: /Blood glucose/ }).first()).toContainText('4–7.8 mmol/L');

  /* The doctor's review is a separate act by a separate person, and opens separately. */
  await rows.filter({ hasText: 'Doctor review completed' }).click();
  await expect(page.getByText(/Blood pressure is coming down again/)).toBeVisible();
});

test('the care team names who has been in the record and what that does not grant', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Health Passport');
  await page.locator('.shortcut-row').filter({ hasText: 'Doctors' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Who has been in your record.' })).toBeVisible();
  /* Both clinicians, each under the registration the vetting register holds them to. */
  /* Read, not typed. packages/catalog/passport.json owns the reviewer, and a boundary check refuses
     a second copy — including one in a test, which is where a stale number survives longest. */
  await expect(page.locator('.record-row').filter({ hasText: passport.reviewer.name }))
    .toContainText(passport.reviewer.registration);
  await expect(page.locator('.record-row').filter({ hasText: 'Sister Naledi Mokoena' })).toContainText('SANC 20016688');
  /* And the limit, which is the vetting contract's own refusal rather than a paraphrase. */
  await expect(page.getByText('A protected category is released by the patient, entry by entry, even to a treating doctor.')).toBeVisible();
});

test('both of the passport documents that had no screen now open', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Health Passport');
  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'Records' }).click();

  await page.locator('.record-row').filter({ hasText: 'Visit summary' }).click();
  let sheet = page.getByRole('dialog');
  /* The visit summary is the completed visit the app already had and had no door to from here. */
  await expect(sheet.getByRole('heading', { name: 'What the nurse found' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Book .* again$/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.locator('.record-row').filter({ hasText: 'Medical certificate' }).click();
  sheet = page.getByRole('dialog');
  /* And the certificate says what it would carry and that this preview holds none — rather than
     "The production record will show the issuing clinician…", which was a sentence about a
     document offered in place of one. */
  await expect(sheet.getByText(/There is no certificate here to open, download or hand to anybody/)).toBeVisible();
  await expect(sheet.getByText(passport.reviewer.registration, { exact: false })).toBeVisible();
});

test('the device permission cards are under the notice rather than behind a button that grants nothing', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Health Passport');
  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('button', { name: /Review permission/ })).toHaveCount(0);
  await expect(page.getByText('We need your permission first')).toBeVisible();
  await expect(page.locator('.module-card')).toHaveCount(3);
});

test('the medications tab explains what happens to a prescription rather than opening the roadmap', async ({ page }) => {
  await page.goto('/');
  await goPatient(page, 'Health Passport');
  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'Medications' }).click();
  await page.getByRole('button', { name: /What happens after a doctor signs one/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What happens to a prescription.' })).toBeVisible();
  /* The five steps are the dispensing contract's handover, and the refusals are its own sentences. */
  await expect(page.locator('.timeline li')).toHaveCount(5);
  await expect(page.getByText(/Medicine collected early is medicine somebody has not been taking as prescribed/)).toBeVisible();
});

/* ---- The clinical rows -------------------------------------------------------------------------- */
test('the patient file\'s actions open screens about the patient the file is on', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Patient context');
  const patient = 'Thando Mokoena';

  for (const [action, heading] of [['New consultation', patient], ['Referral', patient], ['Upload document', patient]] as const) {
    await page.locator('button.pf-action').filter({ hasText: action }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet, `${action} opened no screen`).toBeVisible();
    /* The patient travels with the action. Routing these to the worked examples would have shown
       one patient's record under another's name, which is worse than the stub they replaced. */
    await expect(sheet, `${action} opened a screen about somebody else`).toContainText(heading);
    await sheet.getByRole('button', { name: 'Close' }).first().click();
  }

  /* Prescribing is the one that says no, and says why: a prescription is produced by a signed
     decision, so a file cannot issue one. */
  await page.locator('button.pf-action').filter({ hasText: 'Prescription' }).click();
  await expect(page.getByRole('dialog')).toContainText('A prescription comes out of a decision');
  await expect(page.getByRole('dialog')).toContainText(patient);
});

test('a signed visit has a state on the nurse\'s day', async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkspace(page, 'Nurse');
  await expect(page.locator('.next-visit')).not.toHaveClass(/is-signed/);
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Start observations' }).click();
  await d.getByLabel('Blood pressure — systolic').fill('132');
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.getByLabel('Next step').selectOption('Refer for doctor review today');
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await d.getByRole('button', { name: 'Sign assessment' }).click();
  await d.getByRole('button', { name: /Back to the workspace/ }).click();

  /* The visit she has just signed is no longer the thing she is about to do. */
  const card = page.locator('.next-visit');
  await expect(card).toHaveClass(/is-signed/);
  await expect(card).toContainText('Signed');
  await expect(card).toContainText('Signed by Sister Naledi Mokoena');
  await expect(card.getByRole('button', { name: 'Start this visit' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /Open what this produced/ })).toBeVisible();
  /* And the strip above the day says the same thing the day says. A header reading "one to sign
     off" over a day with nothing left to sign is the drift the one-number rule exists to stop. */
  await expect(page.locator('.s-metric').filter({ hasText: 'Today’s visits' })).toContainText('1 signed, 2 to go');
});

test('the nurse\'s two more-tools say what they will not do rather than that they are not drawn', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Locum shifts', exact: true }).click();
  let sheet = page.getByRole('dialog');
  await expect(sheet.locator('.staff-blank')).toHaveCount(0);
  /* The share is the catalogue's, not a rate typed onto a marketplace. */
  await expect(sheet).toContainText('75% of the visit');
  await expect(sheet).toContainText('Urgency is not a reason to send somebody');
  await sheet.getByRole('button', { name: 'Close' }).first().click();

  await page.getByRole('button', { name: 'Academy', exact: true }).click();
  sheet = page.getByRole('dialog');
  await expect(sheet.locator('.staff-blank')).toHaveCount(0);
  /* The line that runs the other way from what a training product usually claims. */
  await expect(sheet).toContainText('A course is never a check');
});

test('an applicant can see where the application stands', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Vetting');
  /* Straight to the attestation: the five steps are held by another spec, and what this one is
     about is the screen after them. */
  for (let step = 0; step < 8; step += 1) {
    /* Answer whatever this step asks before looking for the way on: every step but Evidence keeps
       its primary disabled until it has been answered, so a walk that reads the button first reads
       a disabled one and stops on step one. */
    const credential = page.getByLabel('SANC registration number');
    if (await credential.count()) await credential.fill('20016688');
    for (const box of await page.locator('#main input[type="checkbox"]').all()) await box.check().catch(() => {});
    const on = page.locator('#main button.primary:not([disabled])').last();
    if (!(await on.count())) break;
    await on.click();
    if (await page.getByRole('heading', { name: 'Nothing was submitted.' }).count()) break;
  }
  await expect(page.getByRole('heading', { name: 'Nothing was submitted.' })).toBeVisible();
  /* And now the half only the Control Tower could see. */
  await expect(page.getByRole('heading', { name: 'Where this application stands' })).toBeVisible();
  await expect(page.getByText('Sister Naledi Mokoena · SANC 20016688')).toBeVisible();
  await expect(page.getByText(/Nothing on this screen can be changed from here/)).toBeVisible();
});

test('a prescription\'s state chip moves with the prescription', async ({ page }) => {
  await openWorkspace(page, 'Partner');
  await page.locator('.record-row').filter({ hasText: 'RX-0081' }).first().click();
  const sheet = page.getByRole('dialog');
  const chip = sheet.locator('.order-head .pill');
  await expect(chip).toHaveText('Awaiting pharmacist');
  for (const box of await sheet.locator('input[type="checkbox"]').all()) await box.check();
  await expect(chip).toHaveText('Checked');
  await sheet.getByRole('button', { name: /Dispense and seal/ }).click();
  await expect(chip).toHaveText('Sealed');
  await sheet.getByLabel('How it reaches the patient').selectOption('Collected at the pharmacy');
  await expect(chip).toHaveText('Handed over');
  await expect(sheet.getByText('This script is finished.')).toBeVisible();
});
