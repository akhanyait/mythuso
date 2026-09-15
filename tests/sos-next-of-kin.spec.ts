import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* Patient SOS on the Safety engine's rules, next of kin, and the desk that reads both — on both viewports.
 *
 * What these journeys hold is what keeps the feature from lying: the emergency numbers stay the first thing on the SOS
 * screen after a press, and the press says in the contract's words that no ambulance partner is connected and nobody is
 * on the way because of it; a next of kin is nominated only with consent to the wording shown, never by a guardian, is
 * recorded as not sent with the reason when SOS is pressed, and is withdrawn in one action; and the desk sees the press,
 * its concern and whether next of kin could be told, reads the area only inside its window, and is never shown what was
 * ticked. Every sentence and number is read from the contracts and the settings defaults, and time is Playwright's
 * clock, inside the urgent-visit hours, so a reworded refusal or a changed default moves these tests with it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sos = json('../packages/catalog/sos.json');
const press = json('../packages/catalog/sos-press.json');
/* The press's sentences write {ambulance} and {mobile}; the screen shows sos.json's numbers in their place. */
const numbers: Record<string, string> = Object.fromEntries((sos.emergency.numbers as { id: string; number: string }[]).map(n => [n.id, n.number]));
const filled = (sentence: string) => sentence.replace(/\{(ambulance|mobile|police)\}/g, (whole, id: string) => numbers[id] ?? whole);
const safetyApi = json('../packages/catalog/apis/safety.json') as { routes: { method: string; path: string; version: number; refusals: { id: string; statement: string }[] }[]; refusals: { id: string; statement: string; answeredBy?: string[] }[] };
const fieldSafety = json('../packages/catalog/field-safety.json') as { settings: { items: { key: string; default: { value: number } }[] } };
const statement = (route: string, id: string) => {
  const own = safetyApi.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)?.refusals.find(r => r.id === id);
  return (own ?? safetyApi.refusals.find(r => r.id === id && (r.answeredBy ?? []).includes(route)))!.statement;
};
const settingDefault = (key: string) => fieldSafety.settings.items.find(s => s.key === key)!.default.value;
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const MORNING = new Date('2026-09-15T09:00:00+02:00');
const NOMINATE = 'POST /v1/safety/next-of-kin@2';

/* The SOS pathway from wherever the patient already is, without reloading: a reload would forget every press and
   nomination this tab holds, which is the preview keeping nothing, not a journey. */
async function openSosHere(page: Page) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click();
  else {
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button', { name: /^Explore MyThuso/ }).click();
  }
  await page.getByRole('button', { name: /Thuso SOS/ }).click();
  return page.getByRole('dialog');
}
type Dialog = ReturnType<Page['getByRole']>;
const answerForAVisit = async (d: Dialog) => {
  await d.locator('.sos-flags label').filter({ hasText: sos.redFlags.noneLabel }).click();
  await d.getByLabel(sos.routing.questions[1].prompt).selectOption(sos.coverage.areas[1]);
  await d.locator('.sos label').filter({ hasText: 'Yes' }).first().click();
};
const emergencyIsFirst = (d: Dialog) => d.evaluate(root => Array.from(root.querySelector('.sos')!.children).findIndex(child => child.classList.contains('sos-emergency')));

test('pressing SOS keeps the numbers first, says no ambulance partner is connected, and stands down with a reason', async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await page.goto('/app/');
  const d = await openSosHere(page);
  await answerForAVisit(d);
  await d.getByRole('button', { name: press.engine.raised.press }).click();

  const raised = d.locator('.sos-raised');
  await expect(raised).toContainText(filled(press.engine.partner.notConnected));
  await expect(raised).toContainText(press.engine.raised.routed['urgent-visit']);
  await expect(raised).toContainText(press.engine.raised.noNextOfKin);
  await expect(raised).toContainText(press.engine.priority.statement);
  expect(await emergencyIsFirst(d)).toBeLessThanOrEqual(1);
  await expect(d.locator('.sos-emergency')).toContainText('10177');
  expect(await d.locator('a[href^="tel:"]').count()).toBe(0);

  await raised.getByRole('button', { name: sos.standDown.reasons[0].label }).click();
  await expect(raised.getByRole('status').filter({ hasText: sos.standDown.reasons[0].label })).toBeVisible();
  await expect(raised.getByRole('button', { name: sos.standDown.reasons[1].label })).toHaveCount(0);
});

test('a condition ticked sends nobody, and the press says so under the numbers', async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await page.goto('/app/');
  const d = await openSosHere(page);
  await d.locator('.sos-flags label').filter({ hasText: sos.redFlags.conditions[0].name }).click();
  await d.getByRole('button', { name: press.engine.raised.press }).click();
  await expect(d.locator('.sos-raised')).toContainText(filled(press.engine.raised.routed['emergency-services']));
  expect(await emergencyIsFirst(d)).toBeLessThanOrEqual(1);
});

test('a next of kin is nominated with consent and never by a guardian, recorded as not sent, and withdrawn in one action', async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await page.goto('/app/');
  await goSection(page, 'Privacy & settings');
  await page.getByRole('button', { name: /^Next of kin/ }).click();
  let d = page.getByRole('dialog');
  await expect(d).toContainText(press.nextOfKin.consent.wording);
  await expect(d).toContainText(fill(press.nextOfKin.tries, { retries: String(settingDefault('next-of-kin-alert-retries')), minutes: String(settingDefault('next-of-kin-alert-window')) }));

  await d.getByLabel(press.nextOfKin.name).fill('Thandi Molefe');
  await d.getByRole('button', { name: press.nextOfKin.nominate, exact: true }).click();
  await expect(d.getByRole('alert')).toHaveText(statement(NOMINATE, 'nomination-without-consent'));
  await d.getByLabel(press.nextOfKin.consent.tick).check();
  await d.getByRole('button', { name: press.nextOfKin.asGuardian }).click();
  await expect(d.getByRole('alert')).toHaveText(statement(NOMINATE, 'guardian-authority-not-proven'));
  await expect(d.locator('.nok-list li')).toHaveCount(0);
  await d.getByRole('button', { name: press.nextOfKin.nominate, exact: true }).click();
  await expect(d.locator('.nok-list li').filter({ hasText: 'Thandi Molefe' })).toContainText('for emergencies only');

  await page.getByRole('button', { name: 'Close dialog' }).click();
  d = await openSosHere(page);
  await answerForAVisit(d);
  await d.getByRole('button', { name: press.engine.raised.press }).click();
  const told = d.locator('.sos-raised .sos-nok');
  await expect(told).toContainText('Thandi Molefe');
  await expect(told).toContainText(press.nextOfKin.statuses[0].label);
  await expect(told).toContainText(press.nextOfKin.notSent[0].sentence);

  await page.getByRole('button', { name: 'Close dialog' }).click();
  await goSection(page, 'Privacy & settings');
  await page.getByRole('button', { name: /^Next of kin/ }).click();
  d = page.getByRole('dialog');
  const row = d.locator('.nok-list li').filter({ hasText: 'Thandi Molefe' });
  await row.getByRole('button', { name: press.nextOfKin.withdraw }).click();
  await expect(row).toContainText(press.nextOfKin.withdrawn.slice(0, press.nextOfKin.withdrawn.indexOf('{at}')));
  await expect(row.getByRole('button', { name: press.nextOfKin.withdraw })).toHaveCount(0);
});

test('the desk sees each SOS, its concern and whether next of kin could be told, reads the area only in its window, and is never shown what was ticked', async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Incidents');
  const desk = page.getByRole('region', { name: press.engine.desk.heading });
  await expect(desk).toContainText(press.engine.desk.intro);
  const rows = desk.locator('.sos-desk-row');
  await expect(rows).toHaveCount(2);

  const open = rows.filter({ hasNotText: 'Stood down at' });
  await expect(open).toContainText(/Concern with the .+ until \d{2}:\d{2}, then the /);
  await expect(open).toContainText(press.nextOfKin.notSent[0].sentence);
  await open.getByRole('button', { name: press.engine.desk.readArea }).click();
  await expect(open).toContainText(/shared with the desk until \d{2}:\d{2}/);
  for (let tries = 0; tries < settingDefault('next-of-kin-alert-retries'); tries++) {
    await open.getByRole('button', { name: press.engine.desk.tryAgain }).click();
    /* Up to the time, which the seed chose: the sentence the contract holds, filled with the try and the tries the settings allow. */
    const attempt = press.engine.desk.attempt as string;
    await expect(open).toContainText(fill(attempt.slice(0, attempt.indexOf('{ends}')), { status: press.nextOfKin.statuses[0].label, attempt: String(tries + 2), allowed: String(settingDefault('next-of-kin-alert-retries') + 1) }));
  }
  await open.getByRole('button', { name: press.engine.desk.tryAgain }).click();
  await expect(open.getByRole('alert')).toHaveText(statement('POST /v1/safety/next-of-kin/{nominationRef}/alert@2', 'alert-tries-used'));

  const closed = rows.filter({ hasText: 'Stood down at' });
  await expect(closed).toContainText(/Concern closed · /);
  await closed.getByRole('button', { name: press.engine.desk.readArea }).click();
  await expect(closed.getByRole('alert')).toHaveText(statement('GET /v1/safety/sos/{sosRef}/area@1', 'location-kept-after-the-window'));
  await closed.getByRole('button', { name: press.engine.desk.tryAgain }).click();
  await expect(closed.getByRole('alert')).toHaveText(statement('POST /v1/safety/next-of-kin/{nominationRef}/alert@2', 'alert-after-stand-down'));

  for (const condition of sos.redFlags.conditions) await expect(desk).not.toContainText(condition.name);
});
