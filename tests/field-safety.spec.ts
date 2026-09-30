import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';
import { changeTiming, openSettingsPanel, timingRow } from './safety-settings';

/* The nurse safety suite, on both viewports.
 *
 * The journeys check what makes this safe rather than what makes it look finished: the timer starts only
 * when the visit code matches and is due at the service's own duration plus the grace; an extension
 * without a reason is refused in the contract's sentence; the deadline passing says so in words; panic
 * asks once, names the real emergency numbers and says the desk decides; a second press is the same
 * panic; the window ends and the position with it; the desk sees a nurse and a suburb, never a service,
 * and cannot resolve a panic without saying what happened; and an admin changing the grace or the window
 * in the back office never moves a visit already running or a panic already open.
 *
 * Every expected sentence, minute and number is read from the contracts, and time is Playwright's clock,
 * so a grace or a window the founder changes moves these tests with it instead of breaking them. The grace
 * and window a fresh page runs on are the contract's defaults; tests/configuration.spec.ts walks the
 * back office that changes them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = json('../packages/catalog/field-safety.json');
const services = json('../packages/catalog/services.json') as { id: string; name: string; duration: number }[];
const sos = json('../packages/catalog/sos.json') as { emergency: { numbers: { id: string; number: string }[] } };
const visitCode: string = json('../packages/catalog/care.json').preview.visitCode;
const emergencyNumber = (id: string) => sos.emergency.numbers.find(entry => entry.id === id)!.number;
/* A refusal's sentence wherever the contract keeps it: field-safety.json's own, or the route it names at its version. */
const safetyApi = json('../packages/catalog/apis/safety.json') as { routes: { method: string; path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const statement = (id: string): string => {
  const own = (contract.refusals as { id: string; statement: string }[]).find(entry => entry.id === id);
  if (own) return own.statement;
  const named = (contract.routeRefusals as { route: string; id: string }[]).find(entry => entry.id === id)!;
  return safetyApi.routes.find(r => `${r.method} ${r.path}@${r.version}` === named.route)!.refusals.find(entry => entry.id === id)!.statement;
};
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

const MINUTE = 60_000;
const START = new Date('2026-09-15T08:00:00+02:00');
const at = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);
const clock = (date: Date) => date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
const settingDefault = (key: string) => contract.settings.items.find((s: { key: string }) => s.key === key).default.value;
const grace: number = settingDefault('grace');
const window: number = settingDefault('panic-window');
/* The first visit on the nurse's day is the catalogue's first service; the schedule is drawn from it. */
const visitMinutes = services[0].duration;

/* The visit the schedule offers, opened and, the first time, started with the code. Opened again after
   it has started, the strip is already there: the timer is the visit's, not the dialog's. */
async function openVisit(page: Page, withCode: boolean) {
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  if (withCode) {
    await dialog.getByLabel('Visit code, digit 1 of 6').fill(visitCode);
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  }
  return dialog.getByRole('region', { name: new RegExp(`^${contract.nurse.heading}`) });
}
async function startVisit(page: Page) {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  return openVisit(page, true);
}

test('no strip before the code matches; after it, due at the service duration plus the grace, and an extension says why', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: new RegExp(`^${contract.nurse.heading}`) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();

  const strip = await startVisit(page);
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace)) }));

  const step: number = settingDefault('extension-steps')[0];
  await strip.getByRole('button', { name: contract.nurse.extend }).click();
  await strip.getByRole('button', { name: fill(contract.nurse.extendStep, { minutes: String(step) }) }).click();
  await expect(strip.getByRole('alert')).toHaveText(statement('extension-without-reason'));
  await strip.getByLabel(contract.extensionReasons[0].label).check();
  await strip.getByRole('button', { name: fill(contract.nurse.extendStep, { minutes: String(step) }) }).click();
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace + step)) }));
  await expect(strip.getByRole('alert')).toHaveCount(0);

  /* "I am safe" is said back with the sentence that it moved nothing, and the deadline is where the extension left it. */
  await page.clock.fastForward(2 * MINUTE);
  await strip.getByRole('button', { name: contract.nurse.checkIn }).click();
  await expect(strip).toContainText(fill(contract.nurse.saidSafe, { at: clock(at(2)) }));
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace + step)) }));
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

test('an admin change never moves a visit already running or a panic already open, and the next press states the window in force', async ({ page }) => {
  const strip = await startVisit(page);
  await expect(strip).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace)) }));
  await strip.getByRole('button', { name: contract.panic.press, exact: true }).click();
  await strip.getByRole('group', { name: contract.panic.confirmQuestion }).getByRole('button', { name: contract.panic.confirm }).click();
  await expect(strip.locator('.fs-pressed')).toContainText(fill(contract.panic.sharingUntil, { ends: clock(at(window)) }));
  await page.getByRole('button', { name: 'Close dialog' }).click();

  /* In the same tab, the back office shortens the grace and lengthens the window. */
  const graceRow = timingRow('grace');
  const windowRow = timingRow('panic-window');
  const shorterGrace = graceRow.bounds.lowest.value;
  const longerWindow = windowRow.bounds.highest.value;
  await chooseRole(page, 'Back office');
  const panel = await openSettingsPanel(page);
  await changeTiming(panel, graceRow, grace, shorterGrace, 'The desk wants to look for a nurse sooner after a visit runs over.');
  await changeTiming(panel, windowRow, window, longerWindow, 'Help is taking longer than half an hour to reach the outer suburbs.');

  await chooseRole(page, 'Nurse');
  const again = await openVisit(page, false);
  await expect(again).toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + grace)) }));
  await expect(again).not.toContainText(fill(contract.nurse.due, { due: clock(at(visitMinutes + shorterGrace)) }));
  await expect(again.locator('.fs-pressed')).toContainText(fill(contract.panic.sharingUntil, { ends: clock(at(window)) }));
  await again.getByRole('button', { name: contract.panic.press, exact: true }).click();
  await expect(again.getByRole('group', { name: contract.panic.confirmQuestion })).toContainText(fill(contract.panic.whatHappens, { ends: clock(at(longerWindow)) }));
});

/* The panic she has outside a visit: in the staff shell's top bar on every page, the strip's own confirmation and
   what the strip shows after a press, word for word, and nothing more — no sentence that help is coming. The desk's
   queue and the Control Tower's field alert count it exactly as they count a press from inside a visit: one more
   open panic on each. */
const portalContract = json('../packages/catalog/control-tower-portal.json');
const fieldAlertCounts = async (page: Page) => {
  await goSection(page, 'Dispatch');
  const alert = page.locator('#pt-category .pt-field-alert');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
  const panicsOnAlert = await alert.count() ? Number(await alert.locator('li', { hasText: portalContract.fieldAlert.nursePanics }).locator('strong').textContent()) : 0;
  await goSection(page, 'Incidents');
  const desk = page.getByRole('region', { name: contract.desk.heading });
  await expect(desk).toBeVisible();
  const panicsOnDesk = await desk.locator('.fs-row:not(.is-closed)').filter({ has: page.locator('.fs-row-kind', { hasText: contract.desk.kinds.panic }) }).count();
  return { panicsOnAlert, panicsOnDesk };
};
test('outside a visit the bar\'s panic asks the strip\'s question, shows what the strip shows, and the desk counts it the same', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Control Tower');
  const before = await fieldAlertCounts(page);
  expect(before.panicsOnAlert).toBe(before.panicsOnDesk);

  await chooseRole(page, 'Nurse');
  await goSection(page, 'Academy');
  const bar = page.locator('.staff-topbar');
  const press = bar.getByRole('button', { name: contract.panic.press, exact: true });
  await press.click();
  const confirm = bar.getByRole('group', { name: contract.panic.confirmQuestion });
  await expect(confirm).toContainText(fill(contract.panic.whatHappens, { ends: clock(at(window)) }));
  await expect(confirm).toContainText(fill(contract.panic.whatDoesNotHappen, { police: emergencyNumber('police'), ambulance: emergencyNumber('ambulance') }));
  await expect(confirm.locator('.not-connected')).toContainText(noticeFor('emergency'));
  /* Not now and Escape both put it away without pressing anything, and Escape hands focus back to the control. */
  await confirm.getByRole('button', { name: contract.panic.cancel }).click();
  await expect(confirm).toHaveCount(0);
  await press.click();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(press).toBeFocused();
  await expect(page.locator('.fs-pressed')).toHaveCount(0);

  await press.click();
  await confirm.getByRole('button', { name: contract.panic.confirm }).click();
  await expect(confirm).toHaveCount(0);
  const pressed = page.getByRole('region', { name: 'Waiting for you' }).locator('.fs-pressed');
  const raised = contract.states.panic.find((s: { id: string }) => s.id === 'raised').label;
  /* Exactly the strip's two lines after a press, and not a word more. */
  await expect(pressed.locator('strong')).toHaveText(`${raised} · ${fill(contract.panic.pressedAt, { at: clock(START) })}`);
  await expect(pressed.locator('p')).toHaveText([fill(contract.panic.sharingUntil, { ends: clock(at(window)) })]);
  await expect(pressed).not.toContainText(/help is (coming|on (its|the) way)|on (its|their) way|coming to you|has been sent/i);
  /* On every page she goes to, and a second press while the window is open is the panic she already has. */
  await goSection(page, 'Team');
  await expect(pressed).toBeVisible();
  await page.clock.fastForward(2 * MINUTE);
  await press.click();
  await confirm.getByRole('button', { name: contract.panic.confirm }).click();
  await expect(pressed).toHaveCount(1);
  await expect(pressed.locator('strong')).toContainText(fill(contract.panic.pressedAt, { at: clock(START) }));

  await chooseRole(page, 'Control Tower');
  const after = await fieldAlertCounts(page);
  expect(after).toEqual({ panicsOnAlert: before.panicsOnAlert + 1, panicsOnDesk: before.panicsOnDesk + 1 });
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
  /* Pick-up comes first: resolving before anybody picked it up is answered in the route's own sentence. */
  await panicRow.getByLabel(contract.desk.outcomeQuestion).selectOption(contract.outcomes[0].id);
  await panicRow.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panicRow.getByRole('alert')).toHaveText(statement('panic-resolved-before-acknowledged'));
  await panicRow.getByLabel(contract.desk.outcomeQuestion).selectOption('');
  await panicRow.getByRole('button', { name: contract.desk.pickUp }).click();
  await expect(panicRow.getByRole('button', { name: contract.desk.pickUp })).toHaveCount(0);
  await panicRow.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panicRow.getByRole('alert')).toHaveText(statement('panic-resolved-without-outcome'));
  await panicRow.getByLabel(contract.desk.outcomeQuestion).selectOption(contract.outcomes[0].id);
  await panicRow.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panicRow).toContainText(fill(contract.desk.closedLine, { outcome: contract.outcomes[0].label }));
  await expect(panicRow).toContainText(statement('position-after-the-window').split('{ended}')[0]);

  const overdueRow = rows.filter({ hasText: 'CHK-0412' });
  const untrue = contract.silenceReasons.find((reason: { needsNurseAnswer: boolean }) => reason.needsNurseAnswer);
  const reached = contract.silenceReasons.find((reason: { needsNurseAnswer: boolean }) => !reason.needsNurseAnswer);
  /* A true reason does not close an overdue nobody picked up. */
  await overdueRow.getByLabel(contract.desk.reasonQuestion).selectOption(reached.id);
  await overdueRow.getByRole('button', { name: contract.desk.close, exact: true }).click();
  await expect(overdueRow.getByRole('alert')).toHaveText(statement('overdue-acknowledged-first'));
  await overdueRow.getByRole('button', { name: contract.desk.pickUp }).click();
  await expect(overdueRow.getByRole('alert')).toHaveCount(0);
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
