import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The nurse safety suite, on both viewports.
 *
 * The journeys check what makes this safe rather than what makes it look finished: the timer starts only
 * when the visit code matches and is due at the service's own duration plus the grace; an extension
 * without a reason is refused in the contract's sentence; the deadline passing says so in words; panic
 * asks once, names the real emergency numbers and says the desk decides; a second press is the same
 * panic; the window ends and the position with it; and the desk sees a nurse and a suburb, never a
 * service, and cannot resolve a panic without saying what happened.
 *
 * Every expected sentence, minute and number is read from the contracts, and time is Playwright's clock,
 * so a grace or a window the founder changes moves these tests with it instead of breaking them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = json('../packages/catalog/field-safety.json');
const services = json('../packages/catalog/services.json') as { id: string; name: string; duration: number }[];
const sos = json('../packages/catalog/sos.json') as { emergency: { numbers: { id: string; number: string }[] } };
const emergencyNumber = (id: string) => sos.emergency.numbers.find(entry => entry.id === id)!.number;
const statement = (id: string) => (contract.refusals as { id: string; statement: string }[]).find(entry => entry.id === id)!.statement;
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

const MINUTE = 60_000;
const START = new Date('2026-09-15T08:00:00+02:00');
const at = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);
const clock = (date: Date) => date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
const grace: number = contract.timer.graceMinutes.value;
const window: number = contract.panic.windowMinutes.value;
/* The first visit on the nurse's day is the catalogue's first service; the schedule is drawn from it. */
const visitMinutes = services[0].duration;

async function startVisit(page: Page) {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  return dialog.getByRole('region', { name: new RegExp(`^${contract.nurse.heading}`) });
}

test('no strip before the code matches; after it, due at the service duration plus the grace, and an extension says why', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: new RegExp(`^${contract.nurse.heading}`) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();

  const strip = await startVisit(page);
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace)) }));

  const step: number = contract.timer.extensionMinutes.value[0];
  await strip.getByRole('button', { name: contract.nurse.extend }).click();
  await strip.getByRole('button', { name: fill(contract.nurse.extendStep, { minutes: String(step) }) }).click();
  await expect(strip.getByRole('alert')).toHaveText(statement('extension-without-reason'));
  await strip.getByLabel(contract.extensionReasons[0].label).check();
  await strip.getByRole('button', { name: fill(contract.nurse.extendStep, { minutes: String(step) }) }).click();
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace + step)) }));
  await expect(strip.getByRole('alert')).toHaveCount(0);
});

test('the deadline passing says so in words, "I am safe" is recorded without moving it, and checking out closes the timer', async ({ page }) => {
  const strip = await startVisit(page);
  await page.clock.fastForward((visitMinutes + grace + 1) * MINUTE);
  await expect(strip).toContainText(fill(contract.nurse.overdue, { since: clock(at(visitMinutes + grace)) }));
  await strip.getByRole('button', { name: contract.nurse.checkIn }).click();
  await expect(strip).toContainText(contract.nurse.answered.split('{at}')[0]);
  await expect(strip).toContainText(fill(contract.nurse.overdue, { since: clock(at(visitMinutes + grace)) }));
  await strip.getByRole('button', { name: contract.nurse.checkOut }).click();
  await expect(strip).toContainText(contract.nurse.closedByNurse.split('{at}')[0]);
  await expect(strip.getByRole('button', { name: contract.nurse.checkOut })).toHaveCount(0);
});

test('panic asks once, names the real numbers, says who can see her and until when, and the window ends', async ({ page }) => {
  const strip = await startVisit(page);
  await strip.getByRole('button', { name: contract.panic.press, exact: true }).click();
  const confirm = strip.getByRole('group', { name: contract.panic.confirmQuestion });
  await expect(confirm).toContainText(fill(contract.panic.whatHappens, { ends: clock(at(window)) }));
  await expect(confirm).toContainText(fill(contract.panic.whatDoesNotHappen, { police: emergencyNumber('police'), ambulance: emergencyNumber('ambulance') }));
  await expect(confirm.locator('.not-connected')).toContainText(noticeFor('emergency'));
  await confirm.getByRole('button', { name: contract.panic.confirm }).click();
  const pressed = strip.locator('.fs-pressed');
  await expect(pressed).toContainText(fill(contract.panic.sharingUntil, { ends: clock(at(window)) }));

  /* A second press for the same visit while the window is open is the same panic, not a second one. */
  await page.clock.fastForward(2 * MINUTE);
  await strip.getByRole('button', { name: contract.panic.press, exact: true }).click();
  await strip.getByRole('group', { name: contract.panic.confirmQuestion }).getByRole('button', { name: contract.panic.confirm }).click();
  await expect(pressed).toHaveCount(1);
  await expect(pressed).toContainText(fill(contract.panic.pressedAt, { at: clock(START) }));

  await page.clock.fastForward((window - 1) * MINUTE);
  await expect(pressed).toContainText(fill(contract.panic.sharingStopped, { ended: clock(at(window)) }));
  await expect(pressed).toContainText(contract.panic.pressAgain);
});

test('the desk sees a nurse and a suburb, never a service, and resolves or closes only with a true reason', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Incidents');
  const desk = page.getByRole('region', { name: contract.desk.heading });
  await expect(desk).toBeVisible();
  const rows = desk.locator('.fs-row');
  await expect(rows.first()).toContainText('PNC-0088');
  await expect(rows.nth(1)).toContainText('CHK-0412');

  const text = await desk.innerText();
  for (const service of services) expect(text, `the desk names the service "${service.name}"`).not.toContain(service.name);
  /* One notice per capability on the screen, even with the incident register underneath. */
  await expect(page.locator('.not-connected').filter({ hasText: noticeFor('dispatch') })).toHaveCount(1);
  await expect(page.locator('.not-connected').filter({ hasText: noticeFor('emergency') })).toHaveCount(1);

  const panicRow = rows.filter({ hasText: 'PNC-0088' });
  await expect(panicRow).toContainText(contract.desk.position);
  await panicRow.getByRole('button', { name: contract.desk.pickUp }).click();
  await panicRow.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panicRow.getByRole('alert')).toHaveText(statement('panic-resolved-without-outcome'));
  await panicRow.getByLabel(contract.desk.outcomeQuestion).selectOption(contract.outcomes[0].id);
  await panicRow.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panicRow).toContainText(fill(contract.desk.closedLine, { outcome: contract.outcomes[0].label }));
  await expect(panicRow).toContainText(statement('position-after-the-window').split('{ended}')[0]);

  const overdueRow = rows.filter({ hasText: 'CHK-0412' });
  await overdueRow.getByRole('button', { name: contract.desk.pickUp }).click();
  const untrue = contract.silenceReasons.find((reason: { needsNurseAnswer: boolean }) => reason.needsNurseAnswer);
  const reached = contract.silenceReasons.find((reason: { needsNurseAnswer: boolean }) => !reason.needsNurseAnswer);
  await overdueRow.getByLabel(contract.desk.reasonQuestion).selectOption(untrue.id);
  await overdueRow.getByRole('button', { name: contract.desk.close, exact: true }).click();
  await expect(overdueRow.getByRole('alert')).toHaveText(statement('silence-reason-untrue'));
  await overdueRow.getByLabel(contract.desk.reasonQuestion).selectOption(reached.id);
  await overdueRow.getByRole('button', { name: contract.desk.close, exact: true }).click();
  await expect(overdueRow).toContainText(fill(contract.desk.closedLine, { outcome: reached.label }));

  const overflow = await desk.evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow, 'the desk queue scrolls sideways').toBeLessThanOrEqual(0);
});

test('the desk stops seeing a position when the window ends, and keeps no coordinate', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Incidents');
  const panicRow = page.getByRole('region', { name: contract.desk.heading }).locator('.fs-row').filter({ hasText: 'PNC-0088' });
  await expect(panicRow.locator('.fs-position-at')).toContainText(/-?\d+\.\d+, -?\d+\.\d+/);
  /* The seeded panic was pressed four minutes before the page opened. */
  await page.clock.fastForward((window - 4 + 1) * MINUTE);
  await expect(panicRow).toContainText(statement('position-after-the-window').split('{ended}')[0]);
  await expect(panicRow.locator('.fs-position-at')).toHaveCount(0);
  await expect(panicRow).not.toContainText(/-?\d+\.\d{3}, -?\d+\.\d{3}/);
});
