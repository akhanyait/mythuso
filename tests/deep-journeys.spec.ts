import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noticeFor } from './notices';
import { goSection, goConsole, openAdminConsole, openFirstRun, openWorkspace } from './nav';
/* Tab-bar labels are translated, so the phone path addresses tabs by position, not by text. */
const tabOrder = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'More'];
const tab = (page: Page, index: number) => page.locator('.tabbar button').nth(index);
async function navigate(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name, exact: true }).click(); return; }
  const index = tabOrder.indexOf(name);
  if (index >= 0) { await tab(page, index).click(); return; }
  await tab(page, 4).click();
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
/* A workspace is its own application at its own entry now, so a journey opens it rather than
   switching into it. The eyebrow it lands on is the role; the heading is the section. */
async function switchRole(page: Page, role: string) {
  await openWorkspace(page, role);
  await expect(page.getByText(role.toUpperCase(), { exact: true }).first()).toBeVisible();
}
test('sign-up refuses a bad code and a bad ID number, then completes', async ({ page }) => {
  await page.goto('/app/');
  await openFirstRun(page);
  await page.getByRole('radio', { name: 'isiZulu' }).check();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('button', { name: 'Send my code' })).toBeDisabled();
  await page.getByLabel('Mobile number').fill('082000000');
  await expect(page.getByText('Enter a 10-digit South African mobile number, starting with 0.')).toBeVisible();
  await page.getByLabel('Mobile number').fill('0820000000');
  await page.getByRole('button', { name: 'Send my code' }).click();
  await page.getByLabel('Verification code, digit 1 of 6').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code doesn’t match. Check the message and try again.')).toBeVisible();
  await page.getByLabel('Verification code, digit 1 of 6').fill('240924');
  await page.getByRole('button', { name: 'Verify' }).click();
  const id = page.getByLabel('South African ID number');
  await id.fill('8001015009088');
  await id.blur();
  await expect(page.getByText('That number fails its check digit. Please re-enter it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await id.fill('8001015009087');
  await expect(page.getByText('Checks out. Date of birth 01/01/1980.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Recovery word').fill('umoya');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Enter MyThuso' })).toBeDisabled();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Enter MyThuso' }).click();
  // the language chosen during sign-up carries into the app shell
  await expect(page.locator('html')).toHaveAttribute('lang', 'zu-ZA');
  await expect(page.getByRole('heading', { name: 'Sawubona, Lerato' })).toBeVisible();
});
test('account recovery offers a route that does not need the lost phone', async ({ page }) => {
  await page.goto('/app/');
  await openFirstRun(page);
  await page.getByRole('button', { name: 'I’ve lost access to my account' }).click();
  await expect(page.getByRole('button', { name: 'Start recovery' })).toBeDisabled();
  await page.getByRole('radio', { name: /Ask my trusted contact/ }).check();
  await page.getByRole('button', { name: 'Start recovery' }).click();
  await expect(page.getByRole('heading', { name: 'We’ve started your recovery.' })).toBeVisible();
  await expect(page.getByText('Up to 24 hours')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
});
test('a guardian invitation names its scope, its end date and can be revoked', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'My family');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Their name').fill('Kagiso Molefe');
  await dialog.getByLabel('Their relationship to you').selectOption('Child under 18');
  await expect(dialog.getByText(/proof of parental responsibility/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('radio', { name: /Visit summaries only/ }).check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByLabel('Access expires').selectOption('For 30 days');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByText('Identity verification and proof of guardianship')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send demo invitation' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Send demo invitation' }).click();
  const row = page.locator('.record-row.static').filter({ hasText: 'Kagiso Molefe · Child under 18' });
  await expect(row).toContainText('Visit summaries only');
  await expect(row).toContainText('Ends: For 30 days');
  await row.getByRole('button', { name: 'Revoke' }).click();
  await expect(row.getByRole('button', { name: 'Revoked' })).toBeDisabled();
});
test('a nurse assessment checks identity, flags an out-of-range reading and signs off', async ({ page }) => {
  await page.goto('/app/');
  await switchRole(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Visit code, digit 1 of 6').fill('111111');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  await expect(dialog.getByText(/Call the Control Tower before continuing/)).toBeVisible();
  await dialog.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  await expect(dialog.getByRole('button', { name: 'Start observations' })).toBeDisabled();
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Start observations' }).click();
  await expect(dialog.getByRole('button', { name: 'Record findings' })).toBeDisabled();
  await dialog.getByLabel('Blood pressure — systolic').fill('165');
  await dialog.getByLabel('Pulse', { exact: false }).first().fill('72');
  await expect(dialog.getByText('Above the indicative range (90–140)')).toBeVisible();
  await expect(dialog.getByText(/it is not a validated early-warning score/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Record findings' }).click();
  await dialog.getByRole('checkbox', { name: 'Headache' }).check();
  await dialog.getByLabel('Next step').selectOption('Refer for doctor review today');
  await dialog.getByRole('button', { name: 'Review sign-off' }).click();
  await expect(dialog.getByText('165 mmHg ⚠')).toBeVisible();
  await expect(dialog.getByText('Refer for doctor review today')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign assessment' }).click();
  /* "Assessment closed" was the old heading and it was the one sentence on this flow that could
     mislead somebody downstream: with no connection the visit is signed and sealed on the handset,
     and nothing has reached the Health Passport. The heading is now written from the queue, so this
     asserts the honest outcome rather than the reassuring one. The closed wording still exists and
     is what the screen says once the queue has actually landed. */
  await expect(dialog.getByRole('heading', { name: 'Assessment sealed.' })).toBeVisible();
  await expect(dialog.getByText(/waiting for a connection/)).toBeVisible();
});
test('control tower assigns a nurse and logs an incident action', async ({ page }) => {
  await page.goto('/app/');
  await switchRole(page, 'Control Tower');
  await page.getByRole('button', { name: 'TH-2052', exact: true }).click();
  await expect(page.getByText('Unassigned')).toBeVisible();
  const candidate = page.locator('.record-row.static').filter({ hasText: 'Sister Palesa Khumalo' });
  await candidate.getByRole('button', { name: 'Assign', exact: true }).click();
  /* The control on an assigned nurse's row used to read "Assigned" and un-assign her when pressed —
     a state label with an action hidden inside it, which is why an audit could walk this board and
     conclude there was no way back from an assignment. The state is the tick beside the status line
     now and the button is the verb, so this asserts both. */
  await expect(candidate.getByRole('button', { name: /Unassign Sister Palesa Khumalo/ })).toBeVisible();
  await expect(page.getByText('Assigned to Sister Palesa Khumalo')).toBeVisible();
  /* And it goes back, which is the half the audit found missing. */
  await candidate.getByRole('button', { name: /Unassign Sister Palesa Khumalo/ }).click();
  await expect(page.getByText('Unassigned')).toBeVisible();
  await candidate.getByRole('button', { name: 'Assign', exact: true }).click();
  await goSection(page, 'Incidents');
  await page.getByRole('button', { name: /INC-015/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/pages the on-call clinical lead immediately/)).toBeVisible();
  await dialog.getByLabel('Immediate action').selectOption('Escalate to the on-call clinical lead');
  await dialog.getByRole('button', { name: 'Add this action to the log' }).click();
  await expect(dialog.getByRole('list', { name: 'Incident log' })).toContainText('Escalate to the on-call clinical lead');
});
test('partner orders show chain of custody and every integration state', async ({ page }) => {
  await page.goto('/app/');
  await switchRole(page, 'Partner');
  /* Orders is master and detail since 30 September 2026: a row chooses the order, and the panel opens it. */
  await page.getByRole('button', { name: /^RX-0081/ }).click();
  await page.getByRole('button', { name: 'Open the prescription to act on it' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Amlodipine 5 mg')).toBeVisible();
  /* A pharmacy is told what to dispense and never who for: no patient. The prescriber is drawn as the register's
     answer and, by the founder's decision of 2 October 2026 — the system admin's setting, on by default — by name
     and registration in front of it, as a real prescription shows them. */
  for (const who of ['Lerato Molefe', '01/01/1980', 'D-401'])
    await expect(dialog, `the prescription names ${who} to the partner`).not.toContainText(who);
  await expect(dialog.getByText(/^Dr Ayanda Dlamini · HPCSA MP0483217 · May prescribe/)).toBeVisible();
  await expect(dialog.getByText(/Who prescribed is the system admin's setting/)).toBeVisible();
  await expect(dialog.getByText('0 of 2 items checked by the pharmacist')).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Mark Amlodipine 5 mg checked by pharmacist' }).check();
  await expect(dialog.getByText('1 of 2 items checked by the pharmacist')).toBeVisible();
  /* The state picker that used to force this dialog offline is gone — it was a design-review
     control shipped inside the product, and nothing behind this screen could fail anyway. What the
     screen owes the reader instead is the contract's own sentence about what it is not wired to. */
  await expect(dialog.locator('.not-connected')).toContainText(noticeFor('dispensing'));
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /^LAB-0023/ }).click();
  await page.getByRole('button', { name: 'Open the laboratory order' }).click();
  await expect(dialog.getByText('SEAL-77341 · Intact on receipt')).toBeVisible();
  /* It asserted a typed "High" beside a typed fasting glucose until 30 September 2026. No contract holds a
     laboratory reference range, and the synthetic laboratory answers with a reference and never a value
     (packages/catalog/medicines.json#labs), so the order names the tests it asked for, says what comes back
     and flags nothing — and the laboratory's own notice, not the pharmacy's, stands over it. */
  const tests = dialog.getByRole('list', { name: 'Tests ordered' });
  await expect(tests.getByRole('listitem').filter({ hasText: 'Fasting glucose' })).toHaveCount(1);
  const medicines = JSON.parse(readFileSync(new URL('../packages/catalog/medicines.json', import.meta.url), 'utf8'));
  await expect(dialog.getByText(medicines.screen.results.ordered)).toBeVisible();
  await expect(dialog.locator('.not-connected')).toContainText(noticeFor('laboratory-results'));
  await expect(dialog.getByText(/mmol\/L|Within range|\bHigh\b/)).toHaveCount(0);
  /* Release is the clinician's, as the partner's own Results board says, and the partner is drawn the sentence
     rather than a control (1 October 2026). Nor does the order name the patient or the nurse who drew the sample:
     medicines.json#partnerQueue lists them among what a partner's screen never carries. */
  await expect(dialog.getByRole('button', { name: 'Release with an explanation' })).toHaveCount(0);
  await expect(dialog.getByText('A result reaches a patient when a clinician sends it with an explanation, and this partner cannot do that for them.')).toBeVisible();
  for (const who of ['Lerato Molefe', 'Naledi Mokoena', 'Rosebank', 'D-401'])
    await expect(dialog, `the laboratory order names ${who} to the partner`).not.toContainText(who);
  /* Who asked for the tests, under the same setting: the laboratory reads the requesting doctor and their standing. */
  await expect(dialog.getByText(/^Dr Ayanda Dlamini · HPCSA MP0483217 · May prescribe/)).toBeVisible();
});
test('vetting refuses a malformed credential, and states the refusal it is under', async ({ page }) => {
  await switchRole(page, 'Nurse');
  /* Her own vetting application is a section of her workspace rather than a door that opens a
     dialog, so the journey reads the screen rather than a modal over it. */
  await goSection(page, 'Vetting');
  const dialog = page.locator('main');
  // the credential the role hangs on is checked for the shape the issuing body actually uses
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await dialog.getByLabel('SANC registration number').fill('2001');
  await expect(dialog.getByText('A SANC registration number has 8 digits.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled();
  // and the applicant is told what they are refused, on the step that asks for it
  await expect(dialog).toContainText('An unvetted nurse is never offered a visit');
  await dialog.getByLabel('SANC registration number').fill('20012345');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  // scope is its own decision, and a nurse is only ever dispatched inside it
  await expect(dialog.getByText('You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Wound care' }).check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  // passing is not something an applicant can do for themselves
  await expect(dialog).toContainText('passing is not something you can do for yourself');
});
test('an identity number is checked against its own check digit, not just its length', async ({ page }) => {
  await openAdminConsole(page);
  await goConsole(page, 'Vetting');
  await page.getByRole('button', { name: /Preview an application/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Care sponsor/ }).click();
  await dialog.getByRole('textbox').fill('8001015009088');            // one digit off
  await expect(dialog.getByText('That number fails its check digit. Please re-enter it.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await dialog.getByRole('textbox').fill('8001015009087');
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled();
  // paying for care is not a permission, and the flow says so rather than implying it
  await expect(dialog).toContainText('Sponsorship is a payment, not a permission.');
});
test('a doctor whose registration has lapsed cannot sign, and is told which check refused it', async ({ page }) => {
  await switchRole(page, 'Doctor');
  /* The queue is master and detail since 30 September 2026: the row chooses the case and the panel beside it
     opens it. The review it opens, and everything asserted in it, is unchanged. */
  await page.getByRole('button', { name: /TH-2048/ }).click();
  await page.getByRole('button', { name: 'Open the case to sign' }).click();
  const dialog = page.getByRole('dialog');
  const sign = dialog.getByRole('button', { name: 'Sign decision' });
  await dialog.getByLabel('Signing doctor').selectOption({ label: 'Dr Sanjay Naidoo · HPCSA MP0559104' });
  await expect(dialog).toContainText('HPCSA registration lapsed');
  await expect(dialog.getByLabel('Your decision')).toBeDisabled();
  await expect(sign).toBeDisabled();
  // a doctor in good standing may sign, once there is a decision and a reason for it
  await dialog.getByLabel('Signing doctor').selectOption({ label: 'Dr Ayanda Dlamini · HPCSA MP0483217' });
  await expect(dialog.getByLabel('Your decision')).toBeEnabled();
  await dialog.getByLabel('Your decision').selectOption('Request laboratory tests');
  await dialog.getByLabel('Clinical rationale').fill('Systolic trending up over four readings.');
  await expect(sign).toBeEnabled();
});
test('every clinical chart is also available as a table', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Health Passport');
  /* The charts are the Passport's Vitals tab since the tabbed health home of 30 September 2026. */
  await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Vitals' }).click();
  const chart = page.locator('.chart-card').filter({ hasText: 'Blood pressure' }).first();
  /* The date is not pinned any more. These readings were four literal arrays typed into the passport
     and dated "12 Aug" through "4 Sep" — labels that were right the week they were written; they are
     day offsets in lib/passport.ts now, so the day this chart names moves with the calendar and an
     assertion on "4 Sep" would have been a test that failed on its own next winter. The reading, its
     unit and the range it is judged against are what this journey is about, and all three are still
     asserted exactly. */
  await expect(chart.locator('svg.chart-plot')).toHaveAttribute('aria-label', /Latest reading 136 mmHg on \d/);
  await expect(chart.locator('svg.chart-plot')).toHaveAttribute('aria-label', /reference range 90 to 140 mmHg; the latest reading is inside that range/);
  await expect(chart.getByRole('table')).toBeHidden();
  await chart.getByRole('button', { name: 'Show readings as a table' }).click();
  await expect(chart.getByRole('table')).toBeVisible();
  /* The note travels with the reading it belongs to, whatever day that reading now falls on. */
  await expect(chart.getByRole('row').filter({ hasText: 'Missed medication' })).toContainText('141');
});
test('the shell can be read in isiZulu, Sesotho and Afrikaans', async ({ page }) => {
  await page.goto('/app/');
  for (const [language, overview, passport, tabLabel] of [['Sesotho', 'Kakaretso', 'Phasepoto ya Bophelo', 'Lehae'], ['Afrikaans', 'Oorsig', 'Gesondheidspaspoort', 'Tuis'], ['isiZulu', 'Uhlolojikelele', 'Iphasiphothi Yezempilo', 'Ikhaya']]) {
    const settings = page.locator('button.settings-link').first();
    if (await settings.isVisible()) await settings.click();
    else { await tab(page, 4).click(); await page.getByRole('button', { name: /^Language Read MyThuso/ }).click(); }
    await page.getByRole('dialog').getByRole('radio', { name: language }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    if (await nav.isVisible()) { await expect(nav).toContainText(overview); await expect(nav).toContainText(passport); }
    else await expect(page.locator('.tabbar')).toContainText(tabLabel);
  }
});
/* The state gallery is gone, and so is this journey. It was the last thing holding a demo pill on
   every screen, and what it proved is now held in two better places: check-boundaries.mjs asserts
   at source that all five states exist and that each still says something a person can act on, and
   tests/states.spec.ts drives offline and a failed request from the real condition on the access
   log. A gallery could only ever prove the five could be rendered by a button that rendered them. */
test('new surfaces do not overflow the viewport or throw', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/');
  await navigate(page, 'Health Passport');
  await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Vitals' }).click();
  await expect(page.locator('.chart-card').first()).toBeVisible();
  await page.screenshot({ path: `test-results/passport-charts-${testInfo.project.name}.png` });
  await switchRole(page, 'Control Tower');
  // the board draws on real streets where a tile token exists and on the schematic where it does
  // not; both are .livemap-canvas, and neither is what this journey is measuring
  await expect(page.locator('.livemap-canvas')).toBeVisible();
  // a visit is plotted at the centre of its suburb and never at its address, so the pin a
  // controller reaches names the suburb rather than a street
  await expect(page.locator('.map-pin.visit-waiting').first()).toBeVisible();
  await page.screenshot({ path: `test-results/dispatch-${testInfo.project.name}.png` });
  await page.goto('/app/');
  await openFirstRun(page);
  await expect(page.getByRole('heading', { name: 'Care that comes to you.' })).toBeVisible();
  await page.screenshot({ path: `test-results/onboarding-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => (() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; })())).toBe(true);
  expect(errors).toEqual([]);
});

/* By position, not by name: this runs after the shell has been switched to isiZulu, where the
   entry is called something else — which is the point of that journey.

   Last rather than eighth. The index was the eighth row until Live well was added above it, and an
   ordinal into a navigation list is a selector that breaks on a row nobody touched. Explore is the
   end of that list and has been since the roadmap stopped being a menu. */
async function openExplore(page: Page) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button').last().click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  await page.locator('main').getByRole('button').filter({ hasText: /Explore|Hlola/ }).first().click();
}
test('the hero rotates on its own, and can be stopped', async ({ page }) => {
  /* Twenty of the next thirty seconds are spent waiting on purpose: twelve for the banner to
     advance by itself and eight more proving it does not advance once stopped, which is the whole
     of WCAG 2.2.2. Against the default budget that left almost nothing for the rest of the journey
     and the test failed under load rather than on its merits. */
  test.setTimeout(60_000);
  // the carousel lives on Explore, not on the returning patient's home, where an auto-rotating
  // promotion stood between them and the thing they opened the app to do
  await page.goto('/app/');
  await openExplore(page);
  const hero = page.getByRole('region', { name: 'MyThuso highlights' });
  await expect(hero.getByRole('heading', { name: 'Care that comes to you.' })).toBeVisible();
  // only the current slide is exposed; the others are hidden from assistive technology
  await expect(hero.getByRole('heading', { name: 'Your health. One safe place.' })).toBeHidden();
  // it advances by itself
  await expect(hero.getByRole('heading', { name: 'Your health. One safe place.' })).toBeVisible({ timeout: 12000 });
  // and a viewer can stop it — WCAG 2.2.2
  await page.getByRole('button', { name: 'Pause the highlights' }).click();
  const current = await hero.getByRole('heading').first().textContent();
  await page.waitForTimeout(8000);
  expect(await hero.getByRole('heading').first().textContent()).toBe(current);
  await page.getByRole('button', { name: 'Play the highlights' }).click();
  // the dots jump straight to a slide and take over from the timer
  await page.getByRole('button', { name: /^Highlight 3 of 3/ }).click();
  await expect(hero.getByRole('heading', { name: 'Feel better. Right at home.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the highlights' })).toBeVisible();
  await hero.getByRole('button', { name: 'Book a nurse' }).click();
  await expect(page.getByRole('heading', { name: 'Professional care at your door' })).toBeVisible();
});
test('the hero banner is translated with the rest of the shell', async ({ page }) => {
  await page.goto('/app/');
  await openExplore(page);
  const settings = page.locator('button.settings-link').first();
  if (await settings.isVisible()) await settings.click();
  else { await tab(page, 4).click(); await page.getByRole('button', { name: /^Language Read MyThuso/ }).click(); }
  await page.getByRole('dialog').getByRole('radio', { name: 'isiZulu' }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  // the banner is on Explore; the greeting is on the home. Both are translated.
  await openExplore(page);
  await expect(page.getByRole('region', { name: 'MyThuso highlights' })).toContainText('Thola usizo manje');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  await (await sidebar.isVisible() ? sidebar.getByRole('button').first() : tab(page, 0)).click();
  await expect(page.getByRole('heading', { name: 'Sawubona, Lerato' })).toBeVisible();
});
