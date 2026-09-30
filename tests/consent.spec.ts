import { test, expect, type Page } from '@playwright/test';
/* Consent, and the log of who opened a record.
   The point of these journeys is not that two screens render. It is that a consent given to wording
   that has since changed is shown as neither agreed nor never-asked; that withdrawing takes exactly
   as many taps as agreeing did and says what it does not undo; that refusing an optional consent
   leaves the care sentence alone; and that the access log shows the refused attempts, which are the
   entries somebody actually opens it looking for. */

const overflow = (page: Page) => page.evaluate(() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; });

/* Privacy & settings is in the sidebar on a desktop and behind the More tab on a phone. Both are
   real routes a person uses, so the journey takes whichever one this viewport has. */
async function openPrivacy(page: Page) {
  await page.goto('/app/');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  /* The sidebar's row, by name inside the sidebar: the shell's footer has carried a Privacy & settings button of its
     own since 30 September, and an unscoped name now matches both. */
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Privacy & settings' }).click();
  else {
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button').filter({ hasText: 'Privacy & settings' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Your data. Your choices.' })).toBeVisible();
}

test('consent is to a version, and the old one does not carry over', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPrivacy(page);
  await page.getByRole('button', { name: 'My consents, and how to withdraw them' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: 'Your consents' })).toBeVisible();

  // required and optional are two lists, not one list with a badge
  await expect(d.getByRole('heading', { name: 'Needed to give you care' })).toBeVisible();
  await expect(d.getByRole('heading', { name: 'Entirely up to you' })).toBeVisible();
  await expect(d.getByText(/A platform that quietly makes the refusers wait longer/)).toBeVisible();

  // the consent given to version 1 is neither "agreed" nor "not yet answered"
  const care = d.locator('.consent-card').filter({ hasText: 'Arranging and delivering your care' });
  await expect(care.locator('.consent-state')).toHaveText('Needs answering again');
  await expect(care.getByText('The wording has changed since you agreed.')).toBeVisible();
  await expect(care.getByText(/still a real agreement to those words, and it is not an agreement to these ones/)).toBeVisible();
  await expect(care.getByText(/Why the old wording was replaced/)).toBeVisible();

  // and care is blocked until it is answered again — with only the required purpose named
  await expect(d.getByText(/MyThuso cannot arrange care until arranging and delivering your care is settled/)).toBeVisible();
  await expect(d.getByText(/Nothing optional is being asked for here/)).toBeVisible();

  // the proof is on the screen: the version, the date it came into force, and the fingerprint
  await expect(care.getByText(/^Version 2, in force since /)).toBeVisible();
  await expect(care.locator('.consent-proof span').nth(1)).toHaveText(/^[0-9a-f]{16}…$|fingerprint of these exact words/);

  await care.getByRole('button', { name: 'Agree to version 2' }).click();
  await expect(care.locator('.consent-state')).toHaveText('Agreed');
  await expect(d.getByText(/Everything MyThuso needs to arrange care is on your record/)).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

test('withdrawal is one tap, is recorded, and says what it does not undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPrivacy(page);
  await page.getByRole('button', { name: 'My consents, and how to withdraw them' }).click();
  const d = page.getByRole('dialog');

  // what withdrawing keeps is on the card before anything is touched, not behind a confirmation
  const wearable = d.locator('.consent-card').filter({ hasText: 'Readings from your own watch or band' });
  await expect(wearable.getByText('What withdrawing does not undo')).toBeVisible();
  await expect(wearable.getByText(/Readings already written into your health record/)).toBeVisible();
  await expect(wearable.getByText(/A law requires it/)).toBeVisible();

  // one tap in, one tap out
  await wearable.getByRole('button', { name: 'I agree' }).click();
  await expect(wearable.locator('.consent-state')).toHaveText('Agreed');
  await wearable.getByRole('button', { name: 'Withdraw' }).click();
  await expect(wearable.locator('.consent-state')).toHaveText('Withdrawn');
  await expect(wearable.getByText(/on your record as a withdrawal, not as an absence/)).toBeVisible();

  // a withdrawal that already happened still reads as a withdrawal on reopening the screen
  const updates = d.locator('.consent-card').filter({ hasText: 'Health tips and news about MyThuso' });
  await expect(updates.locator('.consent-state')).toHaveText('Withdrawn');
  await expect(d.getByText(/It does not delete what was lawfully processed while it stood/)).toBeVisible();

  // and the acknowledgement is not a consent: there is nothing to withdraw
  const notice = d.locator('.consent-card').filter({ hasText: 'How your information is used, stored and deleted' });
  await expect(notice.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  await expect(notice.getByText(/has manufactured a permission/)).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

test('refusing every optional consent changes nothing about care', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPrivacy(page);
  await page.getByRole('button', { name: 'My consents, and how to withdraw them' }).click();
  const d = page.getByRole('dialog');

  // settle the required ones first, so the care sentence is the good one
  await d.locator('.consent-card').filter({ hasText: 'Arranging and delivering your care' }).getByRole('button', { name: 'Agree to version 2' }).click();
  await expect(d.getByText(/Everything MyThuso needs to arrange care is on your record/)).toBeVisible();

  const optional = d.locator('.consent-group').nth(1);
  for (const name of ['Health tips and news about MyThuso', 'Readings from your own watch or band', 'Using de-identified information to improve MyThuso']) {
    const card = optional.locator('.consent-card').filter({ hasText: name });
    const no = card.getByRole('button', { name: 'No thanks' });
    if (await no.count()) await no.click();
    await expect(card.locator('.consent-state')).toHaveText(/Declined|Withdrawn/);
  }
  // the care sentence is untouched, and names nothing optional
  await expect(d.getByText(/Everything MyThuso needs to arrange care is on your record/)).toBeVisible();
  await expect(d.getByText(/cannot arrange care/)).toHaveCount(0);
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

test('the access log shows the refused attempts as well as the allowed ones', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPrivacy(page);
  await page.getByRole('button', { name: 'View access history' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: 'Who opened your record' })).toBeVisible();

  // it is not the sign-in log, and it says so
  await expect(d.getByText(/Who signed in and who opened whose record are two questions/)).toBeVisible();
  await expect(d.getByText(/You can read your own access log, in full, without asking anybody/)).toBeVisible();

  // an allowed read names who, under which law, and against which consent
  const allowed = d.locator('.access-row').filter({ hasText: 'Sister Naledi Mokoena' });
  await expect(allowed).toContainText('Opened your vitals');
  await expect(allowed).toContainText('You said yes — Arranging and delivering your care, version 2');

  // and the two refusals are there, in their own colour, with the reason
  const refused = d.locator('.access-row.is-refused');
  await expect(refused).toHaveCount(2);
  await expect(d.getByText(/Refused at the vetting-standing check/)).toBeVisible();
  await expect(d.getByText(/A billing purpose does not reach Diagnosis/)).toBeVisible();
  await expect(d.getByText(/2 of them refused/)).toBeVisible();

  // and what it never holds is stated rather than assumed
  await expect(d.getByText(/An access log holding the contents of what was opened is a second copy of the record/)).toBeVisible();
  await expect(d.getByText(/Kept for six years from the day the entry was written/)).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});
