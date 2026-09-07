import { test, expect, type Page } from '@playwright/test';
import { goSection } from './nav';
/* Substitution and chronic authorisation.
 *
 * These journeys check the four things that make the screen a design rather than a list: that an
 * item which must not be substituted has no control on it at all, that nothing can be handed over
 * before the patient has been told what it is in words, that the decision carries a name and a
 * registration, and that a repeat is refused with a date rather than quietly filled. */
const openDispensing = async (page: Page) => {
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText('Partner', { exact: true }) }).click();
  await goSection(page, 'Substitution & repeats');
  return page.locator('main');
};
const itemNamed = (d: ReturnType<Page['locator']>, name: string) => d.locator('.disp-item').filter({ hasText: name });

test('a medicine that must not be substituted has no control, and says where the route is', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openDispensing(page);
  const levothyroxine = itemNamed(d, 'Eltroxin 100 µg');
  await expect(levothyroxine).toHaveClass(/must-not/);
  await expect(levothyroxine.getByText('Prescriber only')).toBeVisible();
  await expect(levothyroxine.getByText(/Narrow therapeutic index/)).toBeVisible();
  await expect(levothyroxine.getByText(/The patient is stable on this one/)).toBeVisible();
  // the refusal is the absence of a control, and the sentence says so rather than a disabled button
  await expect(levothyroxine.locator('.disp-refusal')).toContainText('there is no button here that overrides it');
  // the insulin is refused on the prescriber's own hand, and on being a biological
  const insulin = itemNamed(d, 'Lantus');
  await expect(insulin.getByText(/The prescriber wrote ‘no substitution’ · section 22F\(1\)\(b\)/)).toBeVisible();
  await expect(insulin.getByText(/Declared not substitutable · section 22F\(1\)\(c\)/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('nothing is handed over before the patient has been told, in words', async ({ page }) => {
  const d = await openDispensing(page);
  const amlodipine = itemNamed(d, 'Amlodipine 5 mg tablets (Aspen)');
  const handOver = amlodipine.getByRole('checkbox', { name: /^Hand over/ });
  await expect(handOver).toBeDisabled();
  await expect(amlodipine.getByText('Nothing is handed over before the patient has been told what it is')).toBeVisible();
  await amlodipine.getByRole('button', { name: 'Read this to the patient' }).click();
  const telling = amlodipine.locator('.disp-telling');
  await expect(telling.getByText('This is not what was written on your prescription')).toBeVisible();
  await expect(telling).toContainText('It replaces Norvasc 5 mg tablets.');
  await expect(telling).toContainText('The tablet is white and round');
  await expect(telling).toContainText('If you would rather have the one the doctor wrote, say so and you will have it.');
  await expect(handOver).toBeEnabled();
  await handOver.check();
  await expect(amlodipine.getByText('Handed over')).toBeVisible();
});

test('the patient may refuse the swap, and a swap on judgement is signed and reasoned', async ({ page }) => {
  const d = await openDispensing(page);
  // section 22F(1)(a): the refusal belongs to the person swallowing the tablet and needs no reason
  const metformin = itemNamed(d, 'Glucophage 850 mg tablets — as written');
  await expect(metformin.getByText(/The patient said no · section 22F\(1\)\(a\)/)).toBeVisible();
  await metformin.getByRole('button', { name: 'Read this to the patient' }).click();
  await expect(metformin.locator('.disp-telling')).toContainText('That is your decision and it needs no reason.');
  // and the one substituted on the pharmacist's own judgement carries a name, a registration and why
  const hctz = itemNamed(d, 'Hydrochlorothiazide 12.5 mg tablets (Sandoz)');
  await expect(hctz.getByText("Pharmacist's judgement")).toBeVisible();
  await expect(hctz.locator('.disp-signed')).toContainText('Nadia Abrahams · SAPC Y118406');
  await expect(hctz.locator('.disp-signed')).toContainText('out of stock nationally');
  await expect(hctz.locator('.disp-signed')).toContainText('Prescriber notified the same day');
  await expect(d.getByText(/is a change nobody can be asked about/)).toBeVisible();
});

test('a repeat is boxed twice, and an early collection is refused with a date', async ({ page }) => {
  const d = await openDispensing(page);
  const authorisation = d.locator('.disp-authorisation');
  await expect(authorisation.getByText('CHR-0114')).toBeVisible();
  await expect(authorisation.getByText('3 of 5 repeats left')).toBeVisible();
  // 3 repeats of 30 days is 90 days of medicine against 74 days of authorisation, so the date binds
  await expect(authorisation.getByText('90 days')).toBeVisible();
  await expect(authorisation.locator('.disp-box').filter({ hasText: 'Ends on' })).toContainText('the date');
  await expect(authorisation.locator('.disp-box').filter({ hasText: 'Ends on' })).toContainText('cannot be collected before it expires');
  await authorisation.getByRole('button', { name: 'Collect a repeat' }).click();
  await expect(authorisation.getByText(/The next is due in 13 days/)).toBeVisible();
  await expect(authorisation.getByText(/how the last month went/).first()).toBeVisible();
  // and it ends in a review rather than renewing itself
  await expect(authorisation.locator('.disp-ends')).toContainText('Nothing continues by default.');
  await expect(d.getByText(/No repeat is ever authorised by software/)).toBeVisible();
});

test('a lapsed pharmacist or a lapsed prescriber closes the screen, in the register’s own words', async ({ page }) => {
  const d = await openDispensing(page);
  await expect(d.getByText('Awaiting handover')).toBeVisible();
  await d.getByLabel('Dispensing pharmacy').selectOption('P-502');
  await expect(d.getByText(/never routed to a pharmacy whose licence or responsible pharmacist is not current/)).toBeVisible();
  await expect(d.locator('.order-head').first().locator('.pill')).toHaveText('Held');
  await expect(d.getByRole('button', { name: 'Collect a repeat' })).toBeDisabled();
  await d.getByLabel('Dispensing pharmacy').selectOption('P-501');
  await expect(d.locator('.order-head').first().locator('.pill')).toHaveText('Awaiting handover');
  await d.getByLabel('Prescriber').selectOption('D-402');
  await expect(d.getByText(/HPCSA registration lapsed/)).toBeVisible();
  await expect(d.getByRole('button', { name: 'Collect a repeat' })).toBeDisabled();
});

test('the prescription detail points at this screen rather than saying it does not exist', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.demo-pill').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
  await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText('Partner', { exact: true }) }).click();
  await goSection(page, 'Orders');
  await page.locator('.record-row').filter({ hasText: 'RX-0081' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Substitution and chronic authorisation are modelled on the Substitution & repeats screen/)).toBeVisible();
  await expect(dialog.getByText(/are not modelled here/)).toHaveCount(0);
});
