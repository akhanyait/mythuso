import { test, expect, type Page } from '@playwright/test';
import { goSection, openWorkspace } from './nav';
/* The nurse in a house with one bar, and the nurse deciding whether to take Saturday.
 *
 * Two features, one audience. What these journeys are for is not that the screens render — it is
 * that the product never claims work has left the phone when it has not, and never states a
 * forecast as a total when the only honest form of it is a difference and a range.
 *
 * The offline journeys walk the whole capture path rather than one stage, because the defect they
 * exist against was that four of the five stages had nowhere to wait. */

const openAssessment = async (page: Page) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Assessments');
  return page.locator('main');
};
const overflow = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('main') ?? document.documentElement;
  return el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
});

test('every part of a visit is held, and the sign-off says what has not left the phone', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openAssessment(page);
  // the queue is found with work already on it: yesterday's readings never sent
  const strip = d.locator('.vq-strip');
  await expect(strip).toContainText('No signal');
  await expect(strip).toContainText('1 piece of work held on this phone');

  // identity — and with no signal the code is checked against what this phone already had
  await expect(d.getByText(/the code is checked against the visit already on this phone/)).toBeVisible();
  await d.locator('.code-input input').first().click();
  await page.keyboard.type('482190');
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();

  // consent
  await d.getByRole('checkbox').first().check();
  await d.getByRole('checkbox').nth(1).check();
  await d.getByRole('button', { name: 'Start observations' }).click();

  // three readings, then findings
  for (const [label, value] of [['Blood pressure — systolic', '148'], ['Pulse', '86'], ['Temperature', '37.1']]) {
    await d.locator('.obs-field').filter({ hasText: label }).locator('input').fill(value);
  }
  await expect(strip).toContainText('3 pieces of work held on this phone');
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.locator('.chip').filter({ hasText: 'Headache' }).click();
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await d.getByRole('button', { name: 'Sign assessment' }).click();

  // sealed, not filed — and the closing screen says so rather than promising a Health Passport entry
  await expect(d.getByRole('heading', { name: 'Assessment sealed.' })).toBeVisible();
  await expect(d.getByText(/5 pieces of this visit are sealed and waiting for a connection/)).toBeVisible();
  await expect(d.getByText(/Nothing is in Lerato’s Health Passport yet and no doctor can read it/)).toBeVisible();
  await expect(strip).toContainText('6 pieces of work held on this phone');

  // and the queue names each part in the nurse's own words
  await d.getByRole('button', { name: /See what is waiting/ }).click();
  const queue = d.locator('.vq-panel');
  for (const part of ['Identity check', 'Consent', 'Readings', 'What you found', 'Your sign-off']) {
    await expect(queue.getByText(part, { exact: true }).first()).toBeVisible();
  }
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

test('nothing sends without a connection, and the queue admits what it cannot survive', async ({ page }) => {
  const d = await openAssessment(page);
  await d.locator('.vq-strip').click();
  const queue = d.locator('.vq-panel');
  await expect(queue.getByRole('button', { name: /^Send/ })).toBeDisabled();
  await expect(queue.getByText(/Nothing is dropped to make a send succeed/)).toBeVisible();
  // what she can still do, beside what nobody else has yet
  await expect(queue.getByText('You can still')).toBeVisible();
  await expect(queue.getByText(/None of it is in the patient’s Health Passport/)).toBeVisible();
  await expect(queue.getByText(/The Control Tower does not know this visit is done/)).toBeVisible();
  // the admission, in the contract's own words, on the screen rather than only in the file
  await expect(queue.getByText(/This queue is held in memory/)).toBeVisible();
  await expect(queue.getByText(/It is owed, not met/)).toBeVisible();

  // with a connection it lands, and the receipt is what orders it
  await queue.getByRole('button', { name: 'Connection: off' }).click();
  await queue.getByRole('button', { name: /^Send/ }).click();
  await expect(queue.getByText('This device’s copy of the record')).toBeVisible({ timeout: 8000 });
  await expect(d.locator('.vq-strip')).toContainText('Nothing is waiting');
  await expect(overflow(page)).resolves.toBe(true);
});

test('work that arrives against a signed record is never applied behind the signature', async ({ page }) => {
  const d = await openAssessment(page);
  await d.locator('.vq-strip').click();
  const queue = d.locator('.vq-panel');
  await queue.getByRole('button', { name: 'Connection: off' }).click();
  await queue.locator('.checkbox').filter({ hasText: 'A doctor has signed this visit' }).click();
  await queue.getByRole('button', { name: /^Send/ }).click();
  await expect(queue.getByText('Needs a decision', { exact: true }).first()).toBeVisible({ timeout: 8000 });
  await expect(queue.getByText(/The record moved on/)).toBeVisible();
  await expect(queue.getByText(/never applied silently after the fact/).first()).toBeVisible();
  // nothing is merged and nothing is discarded: it is still on the phone with a reason against it
  await expect(queue.getByText(/Nothing here is filed and nothing is thrown away/)).toBeVisible();
});

/* ---- The forecast ---------------------------------------------------------------------------- */

const openEarnings = async (page: Page) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Earnings & payouts');
  return page.locator('main');
};

test('a shift is shown as a difference and a range, never as one confident number', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openEarnings(page);
  const shift = d.locator('.fc');
  await expect(shift.getByText('No hours offered yet')).toBeVisible();
  for (const hour of ['08:00', '09:00', '10:00']) await shift.getByRole('button', { name: hour, exact: true }).click();
  await expect(shift.getByText('3 hours · 3 visits at most')).toBeVisible();
  // the ends of the range are the catalogue's own shares: nothing, and three at the highest, R299
  await expect(shift.getByText('R 0', { exact: true })).toBeVisible();
  await expect(shift.getByText('R 897', { exact: true })).toBeVisible();
  await expect(shift.getByText(/If nothing is booked into them/)).toBeVisible();
  /* And it is a difference from a week that already has a figure in it — or it is honestly not one.
   *
   * Which of those depends on the day this runs. A shift after the Sunday the cycle ends on is next
   * week's money, so the screen says so and changes this week's figure by nothing at all. That is
   * the product being right, and this assertion used to know only the first branch: it passed
   * Monday to Thursday and failed at the weekend, which is the worst kind of test — one that is red
   * for a reason nobody can find in the diff. Both branches are asserted, and the one that is not
   * showing is asserted absent, so a screen that quietly rendered neither would still fail. */
  await expect(shift.getByText('This week so far')).toBeVisible();
  const thisWeek = shift.getByText('With that shift, on your own mix');
  if (await thisWeek.count()) {
    await expect(thisWeek).toBeVisible();
    await expect(shift.getByText(/It would reach your account on/)).toBeVisible();
  } else {
    await expect(shift.getByText('Next week', { exact: true })).toBeVisible();
    await expect(shift.getByText(/falls after this week ends on/)).toBeVisible();
  }
  // the two refusals a forecast most needs
  await expect(shift.getByText(/does not advance money against work you have not done/)).toBeVisible();
  await expect(shift.getByText(/Offering an hour does not book a visit into it/)).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

test('a day after this week ends changes this week by nothing at all', async ({ page }) => {
  const d = await openEarnings(page);
  const shift = d.locator('.fc');
  // the fifth day the app offers is four days after tomorrow, which is past this week's end
  await shift.locator('.date-chip').nth(4).click();
  await shift.getByRole('button', { name: '08:00', exact: true }).click();
  await expect(shift.getByText('Next week', { exact: true })).toBeVisible();
  await expect(shift.getByText(/changes this week’s figure by nothing at all/)).toBeVisible();
  await expect(shift.getByText(/Added to next week/)).toBeVisible();
});
