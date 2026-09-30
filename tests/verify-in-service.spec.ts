import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goConsole, openAdminConsole, openWorkspace, goSection } from './nav';
import { noticeFor } from './notices';

/* Verify in service, on both viewports.
 *
 * The journeys check what makes this safe rather than what makes it look finished: the code the nurse shows is the
 * only thing that makes the patient's check pass; a match shows a name and a badge and never a number; "she is my
 * nurse" needs a match and "this is not my nurse" needs nothing; the tries run out into the sentence that tells a
 * patient not to open the door, with the police number from the contract; a complaint is refused in the route's own
 * sentence until it names what it is about, and says when a reviewer reads it from the window in force; and the
 * reviewer's queue ages each complaint against the window it arrived under, shows no account in a row, and decides
 * nothing without a reason. The desk's board says no face match was performed.
 *
 * Every sentence, try and hour is read from the contracts. The clock is pinned to a morning in Johannesburg so the
 * patient's sample visit is today and the seeded complaints have the ages the engine gave them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const vis = json('../packages/catalog/verify-in-service.json');
const trustApi = json('../packages/catalog/apis/trust.json') as { routes: { method: string; path: string; version: number; refusals: { id: string; statement: string }[]; withdrawn?: unknown }[] };
const trust = json('../packages/catalog/trust.json') as { tiers: { id: string; name: string }[] };
const sos = json('../packages/catalog/sos.json') as { emergency: { numbers: { id: string; number: string }[] } };
const statement = (route: string, id: string) => trustApi.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
const settingDefault = (key: string) => vis.settings.items.find((s: { key: string }) => s.key === key).default.value;
const attempts: number = settingDefault('door-code-attempts');
const reviewHours: number = settingDefault('complaint-review-hours');
const MORNING = new Date('2026-09-10T06:00:00Z');

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(MORNING); });

const openVisits = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: /^My visits/ }).click(); return; }
  await page.locator('.tabbar button').nth(2).click();
};

/* The nurse shows a code for the patient's next visit; the same tab then becomes the patient at the door. */
async function nurseShowsCode(page: Page) {
  await openWorkspace(page, 'Nurse');
  const panel = page.getByRole('region', { name: vis.door.nurse.heading });
  await panel.getByRole('button', { name: vis.door.nurse.button }).click();
  const digits = (await panel.locator('output').textContent())!.trim();
  expect(digits).toMatch(new RegExp(`^\\d{${vis.door.digits}}$`));
  await expect(panel).toContainText(fill(vis.door.nurse.tries, { attempts }));
  const nurse = (await panel.getByText(vis.door.nurse.preview).textContent())!.split(' · ').pop()!.trim();
  return { digits, nurse };
}
async function patientAtTheDoor(page: Page) {
  await chooseRole(page, 'Patient');
  await openVisits(page);
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await page.getByRole('button', { name: vis.door.patient.open }).click();
  const region = page.getByRole('region', { name: vis.door.patient.heading });
  await expect(region).toBeVisible();
  return region;
}

test('the code the nurse shows passes the patient\'s check, which shows a name and a badge and never a number', async ({ page }) => {
  const { digits, nurse } = await nurseShowsCode(page);
  const region = await patientAtTheDoor(page);
  await expect(page.getByText(noticeFor('credential-verification'))).toBeVisible();
  await expect(region).toContainText(vis.door.photo.sentence);

  /* Yes before a code is refused in the route's sentence; there is no yes button until a code fits. */
  await expect(region.getByRole('button', { name: vis.door.answers[0].label })).toHaveCount(0);

  await region.getByLabel(vis.door.patient.codeLabel).fill(digits);
  await region.getByRole('button', { name: vis.door.patient.check }).click();
  await expect(region).toContainText(vis.door.patient.matched);
  await expect(region.locator('dd').first()).toHaveText(nurse);
  await expect(region.locator('dd').nth(1)).toHaveText(trust.tiers.find(t => t.id === 'verified')!.name);
  await expect(region).toContainText(vis.badge.sentence);
  await expect(region).not.toContainText(/score|\b\d{1,3}\s*(\/|out of)\s*100\b|points/i);

  await region.getByRole('button', { name: vis.door.answers.find((a: { id: string }) => a.id === 'she-is-my-nurse').label }).click();
  await expect(region).toContainText(vis.door.patient.verified);
});

test('a wrong code says how many tries are left, and the last one tells the patient not to open the door', async ({ page }) => {
  const { digits } = await nurseShowsCode(page);
  const region = await patientAtTheDoor(page);
  const wrong = digits === '0'.repeat(vis.door.digits) ? '1'.repeat(vis.door.digits) : '0'.repeat(vis.door.digits);
  for (let used = 1; used <= attempts; used++) {
    await region.getByLabel(vis.door.patient.codeLabel).fill(wrong);
    await region.getByRole('button', { name: vis.door.patient.check }).click();
    if (used < attempts) await expect(region).toContainText(fill(vis.door.patient.wrong, { attempts: attempts - used }));
  }
  await expect(region.getByRole('alert')).toContainText(vis.door.patient.mismatch);
  const police = sos.emergency.numbers.find(n => n.id === 'police')!.number;
  await expect(region.getByRole('alert')).toContainText(fill(vis.door.patient.danger, { police }));
  await expect(region.getByLabel(vis.door.patient.codeLabel)).toHaveCount(0);
});

test('this is not my nurse needs no code, and tells the patient the desk has been told', async ({ page }) => {
  await page.goto('/app/');
  await openVisits(page);
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await page.getByRole('button', { name: vis.door.patient.open }).click();
  const region = page.getByRole('region', { name: vis.door.patient.heading });
  await region.getByLabel(vis.door.patient.codeLabel).fill('1'.repeat(vis.door.digits));
  await region.getByRole('button', { name: vis.door.patient.check }).click();
  await expect(region).toContainText(statement('POST /v1/trust/door-verifications@2', 'no-door-code-for-this-visit'));
  await region.getByRole('button', { name: vis.door.answers.find((a: { id: string }) => a.id === 'not-my-nurse').label }).click();
  await expect(region.getByRole('alert')).toContainText(vis.door.patient.mismatch);
});

test('a complaint about a past visit is refused until it says what it is about, then says when a reviewer reads it', async ({ page }) => {
  await page.goto('/app/');
  await openVisits(page);
  await page.getByRole('tablist', { name: 'Visit status' }).getByRole('tab', { name: 'Past' }).click();
  await page.getByRole('button', { name: 'View details' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: vis.complaints.patient.open }).click();
  const form = page.getByRole('region', { name: vis.complaints.patient.heading });
  await expect(page.getByRole('heading', { name: vis.complaints.patient.heading })).toBeVisible();
  await expect(page.getByText(fill(vis.complaints.patient.intro, { hours: reviewHours }))).toBeVisible();
  await expect(form).toContainText(vis.complaints.patient.nurseNotTold);

  await form.getByLabel(vis.complaints.patient.account).fill('She left before my mother had finished her questions.');
  await form.getByRole('button', { name: vis.complaints.patient.submit }).click();
  await expect(form.getByRole('alert')).toHaveText(statement('POST /v1/trust/complaints@2', 'complaint-category-unknown'));

  await form.getByLabel(vis.complaints.patient.category).selectOption({ label: vis.complaints.categories.find((c: { id: string }) => c.id === 'conduct').label });
  await form.getByRole('button', { name: vis.complaints.patient.submit }).click();
  const receivedAt = MORNING.getTime();
  const due = new Date(receivedAt + reviewHours * 3_600_000);
  const at = `${due.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })} ${due.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })}`;
  await expect(form.getByRole('status')).toHaveText(fill(vis.complaints.patient.sent, { at }));
});

test('the reviewer\'s queue ages each complaint against its window, carries no account in a row, and decides nothing without a reason', async ({ page }) => {
  await openAdminConsole(page);
  await goConsole(page, 'Vetting');
  /* The console's views are the shared Tabs since the vetting screen's restyle; a tab or, before it, a button. */
  await page.getByRole('tab', { name: vis.complaints.reviewer.heading, exact: true })
    .or(page.getByRole('button', { name: vis.complaints.reviewer.heading, exact: true })).first().click();
  const queue = page.getByRole('region', { name: vis.complaints.reviewer.heading });
  await expect(queue).toContainText(vis.complaints.reviewer.noScore);
  /* The preview seeds one complaint six hours past its window and one three hours old, by running the engine then. */
  await expect(queue).toContainText(fill(vis.complaints.reviewer.overdue, { hours: reviewHours }));
  await expect(queue).toContainText(fill(vis.complaints.reviewer.age, { age: 3, hours: reviewHours }));
  await expect(queue).not.toContainText('nobody phoned');

  const overdue = queue.getByRole('button').filter({ hasText: fill(vis.complaints.reviewer.overdue, { hours: reviewHours }) });
  await overdue.click();
  await expect(queue).toContainText('nobody phoned');
  await queue.getByLabel(vis.complaints.reviewer.decide).selectOption({ label: vis.complaints.outcomes.find((o: { id: string }) => o.id === 'upheld').label });
  await queue.getByRole('button', { name: vis.complaints.reviewer.decide }).click();
  await expect(queue.getByRole('alert')).toHaveText(statement('POST /v1/trust/complaints/{complaintRef}/decide@1', 'complaint-decision-without-reason'));
  await queue.getByLabel(vis.complaints.reviewer.reason).fill('The visit record agrees with the family.');
  await queue.getByRole('button', { name: vis.complaints.reviewer.decide }).click();
  await expect(queue).toContainText(fill(vis.complaints.reviewer.decided, { outcome: 'Upheld' }));
});

test('the desk\'s board of shift starts says no face match was performed, and never that one was', async ({ page }) => {
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Vetting queue');
  const board = page.getByRole('region', { name: vis.shiftStart.deskHeading });
  await expect(board).toContainText(vis.shiftStart.deskIntro);
  const rule = vis.shiftStart.dispatchRules.find((r: { id: string }) => r.id === settingDefault('unmatched-shift-start-dispatch'));
  await expect(board.getByText(rule.desk).first()).toBeVisible();
  await expect(board).not.toContainText(/\bmatched\b/i);
});
