import { test, expect, type Page } from '@playwright/test';
import { openWorkspace } from './nav';
/* Employer and sponsor programme administration.
 *
 * These journeys check the four things that make the screen a design rather than a dashboard: that
 * a group too small to be anonymous is not reported and says why, that a near-unanimous group is
 * treated the same way, that the published groups deliberately do not add up to the total, and that
 * a sponsor is shown what they paid for and never what was found. */
const openProgrammes = async (page: Page) => {
  /* The design-review menu that used to open this is gone. Employer programmes is one of the
     Control Tower's More tools, which is where an operator would look for it. */
  await openWorkspace(page, 'Control Tower');
  await page.getByRole('button', { name: 'Employer programmes' }).click();
  return page.getByRole('dialog');
};
const row = (d: ReturnType<Page['getByRole']>, name: string) => d.locator('.prog-table tbody tr').filter({ hasText: name });

test('a group too small to be anonymous is not reported, and says why', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openProgrammes(page);
  await expect(d.getByText('people, minimum')).toBeVisible();
  await expect(d.getByText(/A department of four is not anonymous/)).toBeVisible();
  // four people and a shift of nine: neither is reported, and neither is left as a blank
  for (const group of ['Executive', 'Night shift, Germiston']) {
    const suppressed = row(d, group);
    await expect(suppressed).toHaveClass(/prog-suppressed/);
    await expect(suppressed).toContainText('Fewer than twelve people');
    await expect(suppressed).toContainText('not a rounded version of either');
  }
  // and the ones that are reported carry a rounded count, not an exact one
  await expect(row(d, 'Shaft operations')).toContainText('95');
  expect(errors).toEqual([]);
});

test('thirteen of fourteen is one person, so that group is not reported either', async ({ page }) => {
  const d = await openProgrammes(page);
  const drivers = row(d, 'Drivers');
  await expect(drivers).toHaveClass(/prog-suppressed/);
  await expect(drivers).toContainText('One answer covers four fifths of this group');
  await expect(d.getByText(/‘almost nobody’ identifies as surely as ‘almost everybody’/)).toBeVisible();
});

test('the groups do not add up to the total, and the report says so', async ({ page }) => {
  const d = await openProgrammes(page);
  // 95 + 60 + 20 published against a total of 200: the difference is the point, not a defect
  await expect(d.locator('.prog-reconcile')).toContainText('The groups shown add up to 175, and the total says 200');
  await expect(d.locator('.prog-reconcile')).toContainText('That is not an error');
  await expect(d.locator('.prog-reconcile')).toContainText('work out what was withheld by subtracting');
  await expect(d.getByText('3 of 6 groups not reported')).toBeVisible();
});

test('a report that would hide only one group hides a second one as well', async ({ page }) => {
  const d = await openProgrammes(page);
  await d.getByLabel('Programme').selectOption({ index: 1 });
  // mine health and safety is seven people; administration is withheld with it, and says why
  await expect(row(d, 'Mine health and safety')).toContainText('Fewer than twelve people');
  const administration = row(d, 'Administration');
  await expect(administration).toHaveClass(/prog-suppressed/);
  await expect(administration).toContainText('cannot be worked out by subtracting');
  await expect(administration).toContainText('it is the arithmetic that is not');
  await expect(d.getByText('2 of 4 groups not reported')).toBeVisible();
});

test('an employer with an unfinished undertaking gets no report at all', async ({ page }) => {
  const d = await openProgrammes(page);
  await expect(d.locator('.prog-table')).toBeVisible();
  await d.getByLabel('Employer').selectOption('E-011');
  await expect(d.getByText(/cannot be opened to staff until the company, its signatory and its operator agreement are verified/)).toBeVisible();
  await expect(d.locator('.prog-table')).toHaveCount(0);
});

test('declining is invisible, and an employer is never sent a name', async ({ page }) => {
  const d = await openProgrammes(page);
  await expect(d.getByText('Declining is invisible')).toBeVisible();
  await expect(d.getByText(/There is no route in this product that separates them/)).toBeVisible();
  await expect(d.getByText(/The employer is not on that conversation at any point/)).toBeVisible();
  await expect(d.getByText(/Not on request, not under a contract, not in an emergency/).first()).toBeVisible();
  await expect(d.getByText(/nothing MyThuso produces says who took part/).first()).toBeVisible();
  // leaving stops the counting without rewriting what was counted, and without telling the employer
  await expect(d.getByText('The employer is not told you left')).toBeVisible();
  await expect(d.getByText(/cannot have you taken out of it/).first()).toBeVisible();
});

test('a sponsor sees what they paid for and never what was found', async ({ page }) => {
  const d = await openProgrammes(page);
  const sponsorPanel = d.locator('.prog-sponsor');
  await expect(sponsorPanel).toContainText('Zodwa Radebe is paying for Grace Mokoena');
  // R399 + R249 + R399 out of R3 000 set aside, all read from the service catalogue
  await expect(sponsorPanel.locator('.prog-statement tfoot')).toContainText('R 1 047');
  await expect(sponsorPanel).toContainText('R 1 953 left');
  // naming the service is the recipient's switch, and turning it off leaves an amount and a date
  await expect(sponsorPanel.getByText('Elderly care').first()).toBeVisible();
  await sponsorPanel.getByRole('checkbox', { name: /Name the service/ }).uncheck();
  await expect(sponsorPanel.getByText('Elderly care')).toHaveCount(0);
  await expect(sponsorPanel.getByText('Care was given').first()).toBeVisible();
  await expect(sponsorPanel.getByText(/A sponsor cannot make payment conditional on being told what the care was for/)).toBeVisible();
  // and a sponsor whose recipient has not agreed cannot pay for anything yet
  await d.locator('select').last().selectOption('S-021');
  await expect(d.getByText(/Sponsorship is a payment, not a permission/)).toBeVisible();
});
