import { test, expect, type Page } from '@playwright/test';
import { noticeFor } from './notices';
/* The five patient screens that were left behind when the home was rebuilt.
 *
 * The home got the row, the card padding, the icon size and the status badge; Health Passport, My
 * family, Care plans, Thuso Wallet and Privacy & settings kept four row idioms that nearly matched,
 * three sizes of the same glyph, and two different kinds of thing standing in for a status. None of
 * that is a matter of taste when it changes what a person can reach or tell apart, and each test
 * below is one of the things that changed — written as what somebody using the screen would notice,
 * not as a description of the markup underneath it.
 *
 * Every one of these failed before the change. The switch measurement failed by 14 pixels. */

const tabOrder = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'More'];
async function navigate(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    await page.locator('button.settings-link').filter({ hasText: name }).first().click();
    return;
  }
  const index = tabOrder.indexOf(name);
  if (index >= 0) { await page.locator('.tabbar button').nth(index).click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  await page.locator('.menu-row').filter({ hasText: name }).first().click();
}

/* The only controls on the screen where a person turns data sharing on and off were 50x30 — the
   one place left in the app under the 44px floor packages/design-tokens/tokens.json sets, and the
   worst possible place for it. The track is still drawn at 50x30; the button around it is not. */
test('the privacy switches are big enough to hit, and say which way they are set', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Privacy & settings');
  const reminders = page.getByRole('switch', { name: 'Care reminders' });
  const box = (await reminders.boundingBox())!;
  expect(Math.min(box.width, box.height),
    'a switch a finger has to find is at least 44px on its short side').toBeGreaterThanOrEqual(44);
  await expect(reminders).toHaveAttribute('aria-checked', 'true');
  await reminders.click();
  await expect(reminders).toHaveAttribute('aria-checked', 'false');
});

/* Seven rights behind seven identical shields is a list that has to be read word by word. */
test('each privacy right says what is behind it before you open it', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Privacy & settings');
  const history = page.getByRole('button', { name: /^View access history/ });
  await expect(history).toContainText('who was refused');
  await history.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Who opened your record' })).toBeVisible();
});

/* Booking for somebody is not seeing their record. That sentence was in the body of a card; it is a
   badge on every row it applies to now, and a badge is a word rather than a colour. */
test('a family row says what choosing it does and does not give you', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'My family');
  await expect(page.locator('.family-member').filter({ hasText: 'Lerato Molefe' })).toContainText('Your own record');
  const mother = page.locator('.family-member').filter({ hasText: 'Nomsa Molefe' });
  await expect(mother).toContainText('Booking only');
  await expect(page.getByText(/opens their booking, never their record/)).toBeVisible();
  await mother.click();
  await expect(page.getByRole('dialog')).toContainText(/clinical information remains private/);
});

/* Two invitations in one list were told apart by two different kinds of thing: a teal pill for the
   active one and a bare uppercase caption for the other. */
test('every invitation status is the same kind of badge', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'My family');
  const rows = page.locator('.record-row.static');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Nomsa Molefe' }).locator('.pill')).toHaveText('Active');
  await expect(rows.filter({ hasText: 'Kagiso Molefe' }).locator('.pill')).toHaveText('Awaiting acceptance');
  /* Both are badges — same shape, same size, both on a ground of their own. The pending one used to
     be a bare uppercase caption at caption size with no background at all, which reads as a note
     about the row rather than the state of it. */
  const drawn = await rows.locator('.pill').evaluateAll(nodes => nodes.map(n => {
    const s = getComputedStyle(n);
    return { size: s.fontSize, transform: s.textTransform, painted: s.backgroundColor !== 'rgba(0, 0, 0, 0)' };
  }));
  expect(drawn).toHaveLength(2);
  expect(drawn[0].size).toBe(drawn[1].size);
  expect(drawn.map(d => d.painted)).toEqual([true, true]);
  expect(drawn.map(d => d.transform)).toEqual(['none', 'none']);
});

/* The scope and the end date are the whole point of an invitation row — what this person may see,
   and until when. On a phone the badge and the Revoke button crushed the text column to about forty
   pixels and broke "Kagiso Molefe · Brother" a word at a time down the side of the badge, which is
   a privacy boundary rendered unreadable by a layout. */
test('an invitation still says what it grants and when it ends, at a phone width', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'My family');
  const kagiso = page.locator('.record-row.static').filter({ hasText: 'Kagiso Molefe' });
  await expect(kagiso).toContainText('Bookings and payments only');
  await expect(kagiso).toContainText('Ends: 31 December 2026');
  const text = kagiso.locator('span').filter({ hasText: 'Bookings and payments only' }).first();
  const width = (await text.boundingBox())!.width;
  expect(width, 'the column carrying the scope and the end date has been crushed by the badge beside it')
    .toBeGreaterThan(180);
});

/* Nothing on this screen can be bought, so nothing on it gets the button that means "buy this". */
test('no care plan offers a call to action it cannot honour', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Care plans');
  // four cards: MyThuso for Mom is the panel above them, with its own journey in tests/mom-plans.spec.ts
  await expect(page.locator('.plan-card')).toHaveCount(4);
  await expect(page.locator('.plan-card button.primary')).toHaveCount(0);
  /* Exactly one payments notice. The screen now carries a notice beside every group of MyThuso for
     Mom's inclusions as well, so a bare .not-connected matches several and says nothing about money. */
  await expect(page.locator('.not-connected').filter({ hasText: noticeFor('payments') })).toHaveCount(1);
});

/* A payment provider being unavailable is an ordinary Tuesday. The wallet list goes through the
   same shared states as every other list rather than an improvised message of its own. */
test('the wallet activity list carries the shared error state, and says no money moves', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Thuso Wallet');
  await expect(page.locator('.not-connected')).toContainText(noticeFor('payments'));
  await expect(page.getByText('Family care credit')).toBeVisible();
});

/* An absence of prescriptions is an ordinary state with an ordinary empty state, not a tinted note
   with a button underneath it that nothing connects to the note. */
test('the passport uses the shared empty state for prescriptions, and keeps review status on documents', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Health Passport');
  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'Medications' }).click();
  await expect(page.getByRole('heading', { name: 'No active prescriptions' })).toBeVisible();
  await page.getByRole('button', { name: 'See how a prescription reads' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Prescription' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'Records' }).click();
  const lab = page.locator('.record-row').filter({ hasText: 'Laboratory results' });
  await expect(lab).toContainText('Doctor reviewed');
  /* What this row owes a reader is a review status and an issue date, not one particular day. The
     date used to be the literal "4 September" typed beside the document; it is derived from the
     visit the document came out of now, so a document can no longer claim to have been issued on a
     day no visit happened — and an assertion on the old literal would have been asserting the
     defect. */
  await expect(lab).toContainText(/issued \w+, \d{1,2} \w+ \d{4}/);
});

/* The three record actions were three 80px tiles with an 11px caption under an icon, sitting
   directly against the heading of the section below them. They are rows with names now. */
test('the passport record actions say what they do before they are pressed', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Health Passport');
  const exportRow = page.locator('.shortcut-row').filter({ hasText: 'Export sample passport' });
  await expect(exportRow).toContainText('Nothing is sent anywhere');
  const box = (await exportRow.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  const download = page.waitForEvent('download');
  await exportRow.click();
  expect((await download).suggestedFilename()).toBe('mythuso-demo-passport.json');
});
