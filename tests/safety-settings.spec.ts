import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, openAdminConsole } from './nav';
import { changeTiming, fieldSafety, fill, minutesText, openChangeForm, openSettingsPanel, say, timingItem, timingRow, timingRows, type TimingRow } from './safety-settings';

/* The field safety settings on the back office, on both viewports.
 *
 * The founder decided on 15 September 2026 that Operations sets the grace and the panic window here. The
 * journeys check what makes that safe rather than what makes it look finished: each timing says what is in
 * force, its default, who decided it and the range an admin may set, which is itself a proposal; a change
 * is refused in the route's own sentence when it has no reason, is out of range, is nought or lists its
 * steps out of order; a confirmed change first says it does not touch a visit already running, is added
 * to a history with who made it and why, and is what the next visit a nurse starts reads.
 *
 * Every sentence, range and minute is read from the contracts, so a new default or range moves these
 * journeys with it instead of breaking them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const api = json('../packages/catalog/apis/safety.json') as { routes: { path: string; refusals: { id: string; statement: string }[] }[] };
const services = json('../packages/catalog/services.json') as { duration: number }[];
const visitCode: string = json('../packages/catalog/care.json').preview.visitCode;
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/setting-changes')!.refusals.find(r => r.id === id)!.statement;
const defaultOf = (row: TimingRow) => {
  const [block, key] = row.defaultFrom.split('.');
  return fieldSafety[block][key] as { value: number | number[]; decidedBy: string | null; decidedOn?: string };
};
const dayOf = (on: string) => new Date(`${on}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

const MINUTE = 60_000;
const START = new Date('2026-09-15T08:00:00+02:00');
const clock = (date: Date) => date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });

async function openSettings(page: Page) {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  return openSettingsPanel(page);
}

test('each timing says what is in force, its default, who decided it and the range an admin may set', async ({ page }) => {
  const panel = await openSettings(page);
  await expect(panel).toContainText(say.appliesFrom);
  await expect(panel).toContainText(fill(say.version, { version: '1' }));
  for (const row of timingRows) {
    const entry = defaultOf(row);
    const item = timingItem(panel, row);
    await expect(item.locator('.ss-in-force')).toContainText(minutesText(entry.value));
    await expect(item).toContainText(fill(say.defaultIs, { value: minutesText(entry.value) }));
    await expect(item).toContainText(entry.decidedBy ? fill(say.decided, { who: entry.decidedBy, on: dayOf(entry.decidedOn!) }) : say.undecided);
    await expect(item).toContainText(fill(say.range, { lowest: String(row.lowest.value), highest: String(row.highest.value) }));
    await expect(item).toContainText(say.rangeIsAProposal);
  }
  await expect(panel).toContainText(say.historyEmpty);
  await expect(panel).toContainText(say.preview);
  const overflow = await panel.evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow, 'the settings panel scrolls sideways').toBeLessThanOrEqual(0);
});

test('a change is refused in the route’s own words: out of range, nought, no reason, steps out of order', async ({ page }) => {
  const panel = await openSettings(page);
  const grace = timingRow('grace');
  const form = await openChangeForm(panel, grace);
  const review = () => form.getByRole('button', { name: say.review }).click();
  await form.getByLabel(say.newMinutes).fill(String(grace.lowest.value - 1));
  await form.getByLabel(say.reason).fill('Trying a shorter wait than the range allows.');
  await review();
  await expect(form.getByRole('alert')).toHaveText(statement('setting-out-of-range'));
  await form.getByLabel(say.newMinutes).fill('0');
  await review();
  await expect(form.getByRole('alert')).toHaveText(statement('setting-not-above-zero'));
  await form.getByLabel(say.newMinutes).fill(String(grace.highest.value));
  await form.getByLabel(say.reason).fill('');
  await review();
  await expect(form.getByRole('alert')).toHaveText(statement('setting-change-without-reason'));
  await form.getByRole('button', { name: say.cancel }).click();

  const steps = timingRow('extension-steps');
  const stepsForm = await openChangeForm(panel, steps);
  await stepsForm.getByLabel(say.newSteps).fill(`${steps.highest.value}, ${steps.lowest.value}`);
  await stepsForm.getByLabel(say.reason).fill('Largest first.');
  await stepsForm.getByRole('button', { name: say.review }).click();
  await expect(stepsForm.getByRole('alert')).toHaveText(statement('extension-steps-not-rising'));

  await expect(panel).toContainText(say.historyEmpty);
  await expect(panel).toContainText(fill(say.version, { version: '1' }));
});

test('a confirmed change is recorded with who and why, and the next visit a nurse starts reads it', async ({ page }) => {
  const panel = await openSettings(page);
  const grace = timingRow('grace');
  const from = defaultOf(grace).value as number;
  const to = grace.lowest.value;
  const reason = 'Dressings are finishing inside the booked time, so the desk can look for a nurse sooner.';
  await changeTiming(panel, grace, from, to, reason);

  await expect(panel).toContainText(fill(say.version, { version: '2' }));
  const history = panel.locator('table tbody tr');
  await expect(history).toHaveCount(1);
  for (const cell of [grace.label, minutesText(from), minutesText(to), reason]) await expect(history.first()).toContainText(cell);
  await expect(history.first().locator('td').nth(1)).not.toBeEmpty();
  await expect(panel).toContainText(say.historyNeverEdited);
  await expect(timingItem(panel, grace)).toContainText(fill(say.defaultIs, { value: minutesText(from) }));

  /* The same tab, as the nurse: the visit she starts now is timed by the grace in force. */
  await chooseRole(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Visit code, digit 1 of 6').fill(visitCode);
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  const strip = dialog.getByRole('region', { name: new RegExp(`^${fieldSafety.nurse.heading}`) });
  await expect(strip).toContainText(fill(fieldSafety.nurse.due, { due: clock(new Date(START.getTime() + (services[0].duration + to) * MINUTE)) }));
});
