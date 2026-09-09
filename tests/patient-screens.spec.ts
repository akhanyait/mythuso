import { expect, test, type Page } from '@playwright/test';

/* Five screens the walked-journey audit found no door to.
 *
 * A completed visit, a cancelled one, the trends behind the passport's charts, a device permission,
 * and a family member's profile. Each of these journeys used to stop at the screen before it or at
 * a dialog about the roadmap, so what is asserted here is not that the screen renders — it is that
 * the journey finishes: something a person came for is on it, and there is somewhere to go next.
 *
 * Every one of them also carries a not-connected notice, and that is asserted on all five. A screen
 * that could be mistaken for the real thing and stops saying so is the one defect this codebase
 * does not tolerate, and it is the easiest thing in the world to lose while tidying a layout. */

const tabIndex: Record<string, number> = { 'Overview': 0, 'Book a nurse': 1, 'My visits': 2, 'Health Passport': 3 };
/* The sidebar above 1000px and the tab bar below it. Matched by prefix rather than exactly: the
   visit row carries a count in its accessible name, so "My visits" is really "My visits 3". */
async function navigate(page: Page, label: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: new RegExp(`^${label}`) }).click(); return; }
  if (label in tabIndex) { await page.locator('.tabbar button').nth(tabIndex[label]).click(); return; }
  await page.locator('.tabbar button').last().click();
  await page.locator('.menu-row').filter({ hasText: label }).first().click();
}
const openVisit = async (page: Page, group: 'Past' | 'Cancelled') => {
  await navigate(page, 'My visits');
  await page.getByRole('group', { name: 'Visit status' }).getByRole('button', { name: group }).click();
  await page.getByRole('button', { name: 'View details' }).first().click();
  return page.getByRole('dialog');
};
/* No horizontal overflow, inside the scroll container as well as on the page. A dialog that scrolls
   vertically also scrolls sideways, and an overflow that hides in there is invisible to a check that
   only measures the document. */
const noSidewaysScroll = async (page: Page) => page.evaluate(() =>
  [document.documentElement, ...document.querySelectorAll('main, dialog.modal, .workspace')]
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`));

test('a completed visit says what was measured, what was in range and what the doctor said', async ({ page }) => {
  await page.goto('/');
  const visit = await openVisit(page, 'Past');
  await expect(visit.getByRole('heading', { name: 'What the nurse found' })).toBeVisible();
  await expect(visit.getByText(/This record is sample data/)).toBeVisible();

  /* The figures, in the shape every figure in this product takes: a status word above a large thin
     numeral with its name below. The word matters more than the chip — colour is never the only
     difference between two states. */
  const findings = visit.locator('.visit-findings');
  await expect(findings.locator('.s-metric')).toHaveCount(7);
  await expect(findings.locator('.s-metric').filter({ hasText: 'Blood pressure — systolic' })).toContainText('In range');
  await expect(findings.locator('.s-metric').filter({ hasText: 'Blood pressure — systolic' })).toContainText('136');

  /* The reference range is read out of the assessment's own observation table and never typed on a
     screen. If somebody retypes one, this row is where the two copies stop agreeing. */
  const readings = visit.getByRole('row', { name: /Blood pressure — systolic/ });
  await expect(readings).toContainText('90–140 mmHg');

  await expect(visit.getByText(/Blood pressure is coming down again/)).toBeVisible();
  await expect(visit.getByText('Reviewed by')).toBeVisible();
  await expect(visit.getByRole('button', { name: /^Book .* again/ })).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('booking a completed visit again opens the catalogue with the same patient chosen', async ({ page }) => {
  await page.goto('/');
  const visit = await openVisit(page, 'Past');
  await visit.getByRole('button', { name: /^Book .* again/ }).click();
  await expect(page.getByText(/^Booking for/)).toContainText('Lerato Molefe');
  await page.locator('.service-card').first().click();
  /* The point of the whole thing: the review step must not arrive with somebody else's name on it. */
  await expect(page.getByRole('dialog').getByLabel('Who is this visit for?')).toHaveValue('Lerato Molefe');
});

test('a cancelled visit shows the reason, the window it fell on and what cancelling did not undo', async ({ page }) => {
  await page.goto('/');
  const visit = await openVisit(page, 'Cancelled');
  await expect(visit.getByRole('heading', { name: 'A cancelled visit' })).toBeVisible();
  await expect(visit.getByText('I no longer need this visit')).toBeVisible();
  /* The state was recorded when the visit was stood down rather than computed from a date that has
     since gone past — which would make every cancelled visit read "the nurse has arrived". */
  await expect(visit.getByText('More than 2 hours before')).toBeVisible();
  await expect(visit.getByText('This visit is cancelled. Nothing was charged.')).toBeVisible();
  /* The refund sentence is the payments contract's and disappears the moment payments are connected,
     which is the only way it stays true. */
  await expect(visit.getByText('Nothing has been charged for this visit, so there is nothing to refund.')).toBeVisible();
  await expect(visit.getByText(/No payment is taken/)).toBeVisible();
  await expect(visit.getByText('A cancelled visit is not deleted. It stays under Cancelled with the reason given.')).toBeVisible();
  await expect(visit.getByText(/Cancelling a visit withdraws nothing you have consented to/)).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('cancelling a visit records the reason and the side of the window it was on', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'My visits');
  /* Scoped to the visit's own action row: there is another control with this accessible name on the
     page, and a bare getByRole would find it first. */
  await page.locator('.visit-actions').first().getByRole('button', { name: 'Cancel' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'I will not be at the address' }).check();
  await dialog.getByRole('button', { name: 'Cancel this visit' }).click();
  await dialog.getByRole('button', { name: 'View my visits' }).click();
  const visit = await openVisit(page, 'Cancelled');
  await expect(visit.getByText('I will not be at the address')).toBeVisible();
  await expect(visit.getByText(/^Recorded on /)).toBeVisible();
});

test('the trends screen draws every reading against the range the contract holds it to', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Health Passport');
  await page.getByRole('button', { name: /See all/ }).click();
  await expect(page.getByRole('heading', { name: 'How your readings have changed.' })).toBeVisible();
  await expect(page.getByText(/This record is sample data/)).toBeVisible();

  /* Four charts to begin with, and the other three a press away. Seven on one phone screen is a
     wall; these four are what somebody with a blood-pressure diagnosis actually watches. */
  await expect(page.locator('.chart-card')).toHaveCount(4);
  await page.getByRole('button', { name: /^Show the other 3 readings/ }).click();
  await expect(page.locator('.chart-card')).toHaveCount(7);

  /* Not one of these ranges is typed on a screen. They come from the assessment's observation table
     — the same one scripts/check-boundaries.mjs holds the iOS and Android assessments to. */
  await expect(page.getByRole('row', { name: /Oxygen saturation/ })).toContainText('95–100 %');
  await expect(page.getByRole('row', { name: /Blood glucose/ })).toContainText('4–7.8 mmol/L');
  await expect(page.getByText(/Nothing on this screen interprets a reading for you/)).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
});

const integrations = ['Apple Health', 'Health Connect', 'Thuso Kit'] as const;
for (const integration of integrations) {
  test(`the ${integration} permission screen says what would be read and what never would`, async ({ page }) => {
    await page.goto('/');
    await navigate(page, 'Health Passport');
    await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: /Review permission/ }).click();
    await page.locator('.module-card').filter({ hasText: integration }).getByRole('button').click();
    const sheet = page.getByRole('dialog');

    /* The contract's own sentence, above everything, because the decision this screen is asking
       about has not got a subject yet. */
    await expect(sheet.getByText('No device is connected. These readings are sample data and no instrument has been paired.')).toBeVisible();
    await expect(sheet.getByRole('row', { name: /Blood pressure — systolic/ })).toContainText('90–140 mmHg');
    /* The half of a permission screen that is usually missing, and the reason this screen exists. */
    await expect(sheet.getByText('Anything in a protected category')).toBeVisible();
    await expect(sheet.getByText(/Sexual and reproductive health/)).toBeVisible();
    await expect(sheet.getByText(`Nothing on your MyThuso record is written back to ${integration}.`)).toBeVisible();
    await expect(sheet.getByText(/No Bluetooth or eSIM permission is declared/)).toBeVisible();
    /* No Connect button, disabled or otherwise: a greyed-out primary is the biggest thing on a
       screen promising the one thing the screen has just said it cannot do. */
    await expect(sheet.getByRole('button', { name: new RegExp(`^Connect ${integration}`) })).toHaveCount(0);
    expect(await noSidewaysScroll(page)).toEqual([]);
  });
}

test('a family member’s profile shows their visits, both directions of sharing, and books for them', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'My family');
  await page.locator('.family-member').filter({ hasText: 'Nomsa Molefe' }).click();
  const profile = page.getByRole('dialog');
  await expect(profile.getByText(/Nothing is sent/)).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'Visits you arranged for Nomsa' })).toBeVisible();
  await expect(profile.locator('.record-row').filter({ hasText: 'Blood tests' })).toBeVisible();

  /* Sharing has a direction, and this screen used to have it backwards. An invitation names the
     person it was sent to, so it is what they may see of you — never the other way round. */
  await expect(profile.getByRole('heading', { name: 'What you may see of Nomsa' })).toBeVisible();
  await expect(profile.getByText('Bookings and payments only')).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'What Nomsa may see of your record' })).toBeVisible();
  await expect(profile.getByText('Visit summaries only · Ends: Until I revoke it')).toBeVisible();

  /* And it can be changed from here, which was the third thing the audit said was missing. */
  await profile.getByRole('button', { name: 'Revoke' }).click();
  await expect(profile.locator('.pill.danger')).toHaveText('Revoked');

  await profile.getByRole('button', { name: /^Book a visit for Nomsa/ }).click();
  await expect(page.getByText(/^Booking for/)).toContainText('Nomsa Molefe');
  await page.locator('.service-card').first().click();
  await expect(page.getByRole('dialog').getByLabel('Who is this visit for?')).toHaveValue('Nomsa Molefe');
});

test('a preselected patient does not outlive the journey that set it', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'My family');
  await page.locator('.family-member').filter({ hasText: 'Thabo Molefe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Book a visit for Thabo/ }).click();
  await expect(page.getByText(/^Booking for/)).toContainText('Thabo Molefe');
  /* Leaving the catalogue forgets it. A patient chosen three screens ago and still selected is how
     somebody books a visit for the wrong person and finds out when a nurse knocks. */
  await navigate(page, 'Health Passport');
  await navigate(page, 'Book a nurse');
  await expect(page.getByText(/^Booking for/)).toHaveCount(0);
  await page.locator('.service-card').first().click();
  await expect(page.getByRole('dialog').getByLabel('Who is this visit for?')).toHaveValue('Lerato Molefe');
});

/* The layer under the reference ranges: what a reading actually is.
 *
 * The passport has drawn seven ranges since it was written and has never said what one of them
 * measures, so the question a person opened the screen with — should I be worried — got asked of a
 * search engine instead. What is asserted here is the line the answer must not cross: it explains a
 * measurement, it never diagnoses, it says who decides, and it says out loud that no clinician has
 * read the wording. All four are sentences somebody could quietly soften, and `screening` is the
 * capability in this product easiest to overstate. */
test('the passport explains a measurement, refuses to diagnose, and says who decides', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Health Passport');
  await page.getByRole('button', { name: /What these readings mean/ }).click();
  await expect(page.getByRole('heading', { name: 'What your readings mean.' })).toBeVisible();
  /* The screening capability's own notice, above everything, because this is where screening will
     eventually live and a written explanation is not a screening result. */
  await expect(page.getByText(/Nothing here is screened by software/)).toBeVisible();

  /* One row per observation, and the row carries where the last reading fell as a word rather than
     only as a tint. */
  await expect(page.locator('.explain-item')).toHaveCount(7);
  const oxygen = page.locator('.explain-item').filter({ hasText: 'Oxygen saturation' });
  await expect(oxygen).toContainText('95–100 %');
  await oxygen.getByRole('button').first().click();
  await expect(oxygen.getByText(/The share of your blood that is carrying oxygen/)).toBeVisible();
  /* What to do is never a change to a medicine, and the entry says what a low reading is usually
     caused by before it says anything else. */
  await expect(oxygen.getByText(/Warm your hand/)).toBeVisible();
  /* The red flags are the emergency contract's, by id, with the door out of this screen on the row.
     A screen that explains blood pressure to somebody having a stroke has done harm. */
  await expect(oxygen.getByText(/Any of those is an emergency and needs an ambulance rather than a reading/)).toBeVisible();
  await expect(oxygen.getByRole('button', { name: /Open Thuso SOS/ })).toBeVisible();

  await expect(page.getByText(/No clinician has reviewed this wording yet/)).toBeVisible();
  await expect(page.getByText(/What it means for you is a clinical judgement/)).toBeVisible();
  await expect(page.getByText(/Nothing here is a reason to start, stop or change a medicine/)).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
});
