import { test, expect, type Page, type Locator } from '@playwright/test';
import { goSection } from './nav';
/* The teleconsultation call.
 *
 * These journeys check the four things that make this a design rather than a video window: that
 * everyone who can hear the patient is named before the call opens and can be asked to leave at a
 * stated cost; that recording is refused separately and visibly; that a doctor whose registration
 * lapsed is refused in the clinical queue's own words; and — the one that matters — that an
 * encounter which lost its line cannot be closed as a completed consultation, does not write an
 * assessment or a plan, and is not charged for. */
const openCall = async (page: Page) => {
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText('Doctor', { exact: true }) }).click();
  await goSection(page, 'Teleconsultation');
  return page.locator('main');
};
/* Through the roster and the identity check into the call itself, which is where most of the
   interesting states live. */
const intoTheCall = async (d: Locator) => {
  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await d.locator('label.checkbox').filter({ hasText: /May she stay/ }).locator('input').check();
  await d.getByRole('button', { name: /Check identity/ }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('button', { name: /Confirm and continue/ }).click();
  await d.getByRole('button', { name: /Open the call/ }).click();
};

test('everyone who can hear the patient is named, and asking the nurse out has a cost said first', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openCall(page);
  const roster = d.locator('.tc-roster').first();
  // three people, resolved from the vetting register rather than typed into this screen
  await expect(roster.getByText('Lerato Molefe')).toBeVisible();
  await expect(roster.getByText('Dr Ayanda Dlamini')).toBeVisible();
  await expect(roster.getByText('Sister Naledi Mokoena')).toBeVisible();
  await expect(roster.getByText('In the room with the patient')).toBeVisible();
  // the doctor is the one person who cannot be asked to step out
  await expect(roster.getByText('Cannot be asked to leave')).toBeVisible();
  // the cost of declining is on the screen before the question is answered, not after
  await expect(d.locator('.tc-consent').filter({ hasText: /May she stay/ })).toContainText('no examination and no readings taken during the call');
  await expect(d.getByText(/Nobody sits in on a MyThuso consultation to learn/)).toBeVisible();
  // nothing can proceed until the consultation itself is consented to
  await expect(d.getByRole('button', { name: /Check identity/ })).toBeDisabled();
  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await expect(d.getByRole('button', { name: /Check identity/ })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a doctor whose registration lapsed is refused in the clinical queue’s own words', async ({ page }) => {
  const d = await openCall(page);
  await d.getByLabel('Doctor for this appointment').selectOption('D-402');
  await expect(d.getByText(/HPCSA registration lapsed/)).toBeVisible();
  await expect(d.getByText(/The queue refuses the signature rather than warning about it/)).toBeVisible();
  // the only way forward is a different doctor, and it writes a non-consultation into the record
  await d.getByRole('button', { name: /Rebook with a doctor whose registration is current/ }).click();
  await expect(d.getByRole('heading', { name: 'The clinician may not consult' })).toBeVisible();
  await expect(d.getByText('Not a consultation', { exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: /Write it up in the consultation record/ })).toHaveCount(0);
});

test('the wrong visit code stops the call, in the same words the nurse gets at the door', async ({ page }) => {
  const d = await openCall(page);
  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await d.getByRole('button', { name: /Check identity/ }).click();
  await expect(d.getByText('HPCSA MP0483217')).toBeVisible();
  await d.getByLabel('Visit code, digit 1 of 6').fill('111111');
  await d.getByRole('button', { name: /Confirm and continue/ }).click();
  await expect(d.getByText(/That code doesn’t match this visit/)).toBeVisible();
  await d.getByRole('button', { name: /Close the encounter/ }).click();
  await expect(d.getByRole('heading', { name: 'Identity not confirmed' })).toBeVisible();
  await expect(d.getByText('Not a consultation', { exact: true })).toBeVisible();
});

test('recording is a second question, refused with its reasons and its retention stated', async ({ page }) => {
  const d = await openCall(page);
  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await d.getByRole('button', { name: /Check identity/ }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('button', { name: /Confirm and continue/ }).click();
  await expect(d.getByText(/does not offer recording, and it does not offer a switch for it either/)).toBeVisible();
  await expect(d.getByText(/saying no to the second costs you nothing/)).toBeVisible();
  await expect(d.getByText('30 days', { exact: true })).toBeVisible();
  await expect(d.getByText(/An indicator that can be dismissed is a recording nobody consented to/)).toBeVisible();
  // there is no control to grant it, which is the point
  await expect(d.locator('input[type=checkbox]')).toHaveCount(0);
});

test('a dropped line cannot be closed as a completed consultation', async ({ page }) => {
  const d = await openCall(page);
  await intoTheCall(d);
  // never asked is a different screen from refused
  await expect(d.getByText(/has never asked this device for the camera or the microphone/)).toBeVisible();
  await d.locator('.tc-switch label').filter({ hasText: 'You said no' }).click();
  await expect(d.getByText(/You were asked and you declined/)).toBeVisible();

  await d.locator('.tc-switch label').filter({ hasText: 'The call dropped' }).click();
  await expect(d.locator('.tc-dropped')).toContainText('The doctor calls back');
  await expect(d.locator('.tc-dropped')).toContainText('she stays with the patient');
  await expect(d.getByText(/Stay where you are — the doctor is calling you back/)).toBeVisible();
  // nothing on a dropped line may be concluded, and there is no button that would
  await expect(d.getByRole('button', { name: /Reach a decision and end the consultation/ })).toBeDisabled();
  await expect(d.getByText(/no way to close this encounter as a completed consultation/)).toBeVisible();

  await d.getByRole('button', { name: /End without a decision/ }).click();
  await expect(d.getByRole('heading', { name: 'Interrupted and not resumed' })).toBeVisible();
  await expect(d.getByText('Not a consultation', { exact: true })).toBeVisible();
  // the record it writes: a reason and a note, and neither an assessment nor a plan
  const sections = d.locator('.tc-sections');
  await expect(sections.locator('tr', { hasText: 'Assessment' })).toContainText('Not reached');
  await expect(sections.locator('tr', { hasText: 'Treatment plan' })).toContainText('Not reached');
  await expect(sections.locator('tr', { hasText: 'Reason for visit' })).toContainText('Yes');
  await expect(d.getByText(/is never closed off as a completed consultation/)).toBeVisible();
  await expect(d.getByRole('button', { name: /Write it up in the consultation record/ })).toHaveCount(0);
  // and nobody pays for their own bad signal
  await expect(d.getByText(/puts the cost of South African bandwidth on the person least able/)).toBeVisible();
});

test('sound only is a designed path, and asking the nurse out withdraws what needed hands', async ({ page }) => {
  const d = await openCall(page);
  await intoTheCall(d);
  await expect(d.locator('.tc-limit.ok').filter({ hasText: 'Take a history' })).toBeVisible();
  await d.locator('.tc-switch label').filter({ hasText: 'Sound only' }).click();
  await expect(d.getByText(/uses far less of your data and works on a weak signal/)).toBeVisible();
  await expect(d.getByText(/Sound only is an ordinary way to be seen in South Africa, not a failure/)).toBeVisible();
  // what the doctor may no longer do alone is withdrawn, by name
  await expect(d.locator('.tc-limit.no').filter({ hasText: 'Assess something visible' })).toBeVisible();
  // the nurse is still there, so the doctor may still ask her to examine
  await expect(d.locator('.tc-limit.ok').filter({ hasText: 'Ask the nurse to examine' })).toBeVisible();
  await d.getByRole('button', { name: 'Ask to step out' }).first().click();
  await expect(d.locator('.tc-limit.no').filter({ hasText: 'Ask the nurse to examine' })).toContainText('Nobody is in the room');
  await expect(d.getByText(/the doctor is told the room no longer has a clinician in it/)).toBeVisible();
  await expect(d.getByText(/Anything felt, measured or looked at closely is the nurse.s finding/)).toBeVisible();
});

test('a call that finished ends in the consultation record, with the interruption on its face', async ({ page }) => {
  const d = await openCall(page);
  await intoTheCall(d);
  // dropped, then back, then a decision: still a consultation, and it says it was interrupted
  await d.locator('.tc-switch label').filter({ hasText: 'The call dropped' }).click();
  await d.locator('.tc-switch label').filter({ hasText: 'Video and sound' }).click();
  await d.getByRole('button', { name: /Reach a decision and end the consultation/ }).click();
  await expect(d.getByRole('heading', { name: 'Interrupted, then finished' })).toBeVisible();
  await expect(d.getByText('Counts as a consultation')).toBeVisible();
  await expect(d.getByText(/confirmed the visit code again before continuing/)).toBeVisible();
  await d.getByRole('button', { name: /Write it up in the consultation record/ }).click();
  // the same twelve-section record every other encounter writes into, opened as the signing doctor
  await expect(d.getByText('Draft — not signed')).toBeVisible();
  await expect(d.getByLabel('Reason for visit')).toHaveValue(/Teleconsultation · TH-2048/);
  await expect(d.getByLabel(/Symptoms and history/)).toHaveValue(/The line dropped during the consultation/);
});
