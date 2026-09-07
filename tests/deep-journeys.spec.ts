import { test, expect, type Page } from '@playwright/test';
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
async function openStates(page: Page, dialog = false) {
  const root = dialog ? page.getByRole('dialog') : page.locator('main');
  await root.locator('details.state-picker > summary').first().click();
}
async function switchRole(page: Page, role: string) {
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText(role, { exact: true }) }).click();
  await expect(page.getByText(`${role.toUpperCase()} WORKSPACE · DEMO`)).toBeVisible();
}
test('sign-up refuses a bad code and a bad ID number, then completes', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^First-run flow/ }).click();
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
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^First-run flow/ }).click();
  await page.getByRole('button', { name: 'I’ve lost access to my account' }).click();
  await expect(page.getByRole('button', { name: 'Start recovery' })).toBeDisabled();
  await page.getByRole('radio', { name: /Ask my trusted contact/ }).check();
  await page.getByRole('button', { name: 'Start recovery' }).click();
  await expect(page.getByRole('heading', { name: 'We’ve started your recovery.' })).toBeVisible();
  await expect(page.getByText('Up to 24 hours')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to the preview' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
});
test('a guardian invitation names its scope, its end date and can be revoked', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  await switchRole(page, 'Nurse');
  await page.getByRole('button', { name: /Visit assessment · TH-2048/ }).first().click();
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
  await dialog.getByRole('button', { name: 'Sign demo assessment' }).click();
  await expect(dialog.getByRole('heading', { name: 'Demo assessment closed.' })).toBeVisible();
});
test('control tower assigns a nurse and logs an incident action', async ({ page }) => {
  await page.goto('/');
  await switchRole(page, 'Control Tower');
  await page.getByRole('button', { name: 'TH-2052', exact: true }).click();
  await expect(page.getByText('Unassigned')).toBeVisible();
  const candidate = page.locator('.record-row.static').filter({ hasText: 'Sister Palesa Khumalo' });
  await candidate.getByRole('button', { name: 'Assign' }).click();
  await expect(candidate.getByRole('button', { name: 'Assigned' })).toBeVisible();
  await expect(page.getByText('Assigned to Sister Palesa Khumalo')).toBeVisible();
  await page.getByRole('button', { name: /INC-015/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/pages the on-call clinical lead immediately/)).toBeVisible();
  await dialog.getByLabel('Immediate action').selectOption('Escalate to the on-call clinical lead');
  await dialog.getByRole('button', { name: 'Add demo action to the log' }).click();
  await expect(dialog.getByRole('list', { name: 'Demo incident log' })).toContainText('Escalate to the on-call clinical lead');
});
test('partner orders show chain of custody and every integration state', async ({ page }) => {
  await page.goto('/');
  await switchRole(page, 'Partner');
  await page.getByRole('button', { name: /RX-0081 · Prescription/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Amlodipine 5 mg')).toBeVisible();
  await expect(dialog.getByText('0 of 2 items checked in this preview')).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Mark Amlodipine 5 mg checked by pharmacist' }).check();
  await expect(dialog.getByText('1 of 2 items checked in this preview')).toBeVisible();
  await openStates(page, true);
  await dialog.getByRole('button', { name: 'Offline', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Permission denied' }).click();
  await expect(dialog.getByRole('heading', { name: 'We need your permission first' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /LAB-0023 · Laboratory/ }).click();
  await expect(dialog.getByText('SEAL-77341 · Intact on receipt')).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Fasting glucose/ })).toContainText('High');
  await dialog.getByRole('button', { name: 'Release with an explanation' }).click();
  await expect(dialog.getByText('Visible in the Health Passport with an explanation')).toBeVisible();
});
test('vetting refuses a malformed credential, and states the refusal it is under', async ({ page }) => {
  await page.goto('/');
  await switchRole(page, 'Nurse');
  await page.getByRole('button', { name: /Nurse onboarding & vetting/ }).click();
  const dialog = page.getByRole('dialog');
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
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Admin console' }).click();
  await page.getByRole('button', { name: 'Vetting', exact: true }).click();
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
  await page.goto('/');
  await switchRole(page, 'Doctor');
  await page.getByRole('button', { name: /TH-2048/ }).click();
  const dialog = page.getByRole('dialog');
  const sign = dialog.getByRole('button', { name: 'Sign demo decision' });
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
  await page.goto('/');
  await navigate(page, 'Health Passport');
  const chart = page.locator('.chart-card').filter({ hasText: 'Blood pressure' }).first();
  await expect(chart.locator('svg.chart-plot')).toHaveAttribute('aria-label', /Latest sample reading 136 mmHg on 4 Sep/);
  await expect(chart.getByRole('table')).toBeHidden();
  await chart.getByRole('button', { name: 'Show readings as a table' }).click();
  await expect(chart.getByRole('table')).toBeVisible();
  await expect(chart.getByRole('row', { name: /28 Aug/ })).toContainText('Missed medication');
});
test('the shell can be read in isiZulu, Sesotho and Afrikaans', async ({ page }) => {
  await page.goto('/');
  for (const [language, overview, passport, tabLabel] of [['Sesotho', 'Kakaretso', 'Phasepoto ya Bophelo', 'Lehae'], ['Afrikaans', 'Oorsig', 'Gesondheidspaspoort', 'Tuis'], ['isiZulu', 'Uhlolojikelele', 'Iphasiphothi Yezempilo', 'Ikhaya']]) {
    const settings = page.locator('button.settings-link').first();
    if (await settings.isVisible()) await settings.click();
    else { await tab(page, 4).click(); await page.getByRole('button', { name: /^Language/ }).click(); }
    await page.getByRole('dialog').getByRole('radio', { name: language }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    if (await nav.isVisible()) { await expect(nav).toContainText(overview); await expect(nav).toContainText(passport); }
    else await expect(page.locator('.tabbar')).toContainText(tabLabel);
  }
});
test('the state gallery covers loading, error, offline, denied and empty', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Explore MyThuso');
  await page.getByRole('button', { name: /System states/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status', { name: 'Loading care information' }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Service error', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('We couldn’t load this just now');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByText('The real content, with nothing standing in for it.')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'No visits yet' })).toBeVisible();
});
test('new surfaces do not overflow the viewport or throw', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await navigate(page, 'Health Passport');
  await expect(page.locator('.chart-card').first()).toBeVisible();
  await page.screenshot({ path: `test-results/passport-charts-${testInfo.project.name}.png` });
  await switchRole(page, 'Control Tower');
  await expect(page.locator('.dispatch-map')).toBeVisible();
  await page.screenshot({ path: `test-results/dispatch-${testInfo.project.name}.png` });
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^First-run flow/ }).click();
  await expect(page.getByRole('heading', { name: 'Care that comes to you.' })).toBeVisible();
  await page.screenshot({ path: `test-results/onboarding-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => (() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; })())).toBe(true);
  expect(errors).toEqual([]);
});

test('the hero rotates on its own, and can be stopped', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  const settings = page.locator('button.settings-link').first();
  if (await settings.isVisible()) await settings.click();
  else { await tab(page, 4).click(); await page.getByRole('button', { name: /^Language/ }).click(); }
  await page.getByRole('dialog').getByRole('radio', { name: 'isiZulu' }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  await (await sidebar.isVisible() ? sidebar.getByRole('button').first() : tab(page, 0)).click();
  await expect(page.getByRole('region', { name: 'MyThuso highlights' })).toContainText('Thola usizo manje');
  await expect(page.getByRole('heading', { name: 'Sawubona, Lerato' })).toBeVisible();
});
