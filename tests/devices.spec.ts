import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* Thuso Kit's registry, on both viewports.
 *
 * What these journeys hold is what makes a device screen safe rather than finished: the nurse's kit says which
 * instrument is stale, under the interval in force, and which is recalled, with the reading taken after the
 * recall marked and kept rather than gone; each reading says where it came from, how good the sample was and
 * whether it carries clinical weight; the Control Tower's recall is refused without a reason and then marks
 * the readings taken since; and a patient asking to link Apple Health or Health Connect is told, in the
 * contract's words, that nothing is connected and why — before and after the request is recorded.
 *
 * Every expected sentence, label and interval is read from packages/catalog/devices.json, packages/catalog/
 * apis/devices.json and packages/catalog/capture.json, so a reworded sentence or a new default moves these
 * tests with it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const devices = json('../packages/catalog/devices.json');
const api = json('../packages/catalog/apis/devices.json') as { routes: { withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const consent = json('../packages/catalog/consent.json') as { purposes: { id: string; versions: { version: number; wording: string }[] }[] };
const capture = json('../packages/catalog/capture.json') as { devices: { id: string; name: string }[] };
const nurse = devices.screens.nurse;
const ops = devices.screens.ops;
const link = devices.wearableLinks;
const label = (list: { id: string; label: string }[], id: string) => list.find(x => x.id === id)!.label;
const instrument = (id: string) => capture.devices.find(d => d.id === id)!.name;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
const statement = (id: string) => api.routes.filter(r => !r.withdrawn).flatMap(r => r.refusals).find(r => r.id === id)!.statement;
const markSentence = (id: string) => (devices.marks as { id: string; sentence: string }[]).find(m => m.id === id)!.sentence;
/* The interval in force, in the words the kit screen writes it: the same rule lib/devices.ts applies. */
const staleDefault: number = devices.settings.items.find((s: { key: string }) => s.key === 'stale-after-minutes').default.value;
const intervalText = (minutes: number) => minutes % 1440 === 0 ? `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}`
 : minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}` : `${minutes} minutes`;
const wearableWording = consent.purposes.find(p => p.id === link.consentPurpose)!.versions.at(-1)!.wording;

/* The document and the workspace's main, which scrolls on its own: a page can stay inside the phone while its
   main scrolls sideways, and that is how the registry's table once escaped the document-only measure. */
async function noSidewaysScroll(page: Page) {
 return page.evaluate(() => [document.documentElement, document.querySelector('main')]
  .filter((el): el is HTMLElement => Boolean(el)).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName.toLowerCase()} ${el.scrollWidth}`));
}
const card = (region: Locator, kind: string, serial: string) => region.getByRole('listitem', { name: `${instrument(kind)} ${serial}` });

test('the nurse\'s kit says which instrument is stale under the interval in force, which is recalled, and what each reading carries', async ({ page }) => {
 await openWorkspace(page, 'Nurse');
 await goSection(page, 'Thuso Kit');
 const health = page.getByRole('region', { name: nurse.heading });
 await expect(health).toBeVisible();

 const glucometer = card(health, 'glucometer', 'MT-GL-1157');
 await expect(glucometer.getByText(label(devices.health.states, 'stale'), { exact: true }).first()).toBeVisible();
 await expect(glucometer).toContainText(fill(nurse.staleSince, { interval: intervalText(staleDefault) }));

 const oximeter = card(health, 'pulse-oximeter', 'MT-OX-2210');
 await expect(oximeter.getByText(label(devices.health.states, 'recalled'), { exact: true }).first()).toBeVisible();
 await expect(oximeter).toContainText(nurse.doNotUse);
 /* The reading taken after the recall took effect is still there, marked, and without clinical weight. */
 await expect(oximeter).toContainText(markSentence('recalled'));
 await expect(oximeter).toContainText(nurse.carriesNot);

 const cuff = card(health, 'bp-cuff', 'MT-BP-4471');
 await expect(cuff.getByText(label(devices.health.states, 'reporting'), { exact: true }).first()).toBeVisible();
 await expect(cuff).toContainText(`${nurse.readingSource}${label(devices.sources, 'kit-instrument')}`);
 await expect(cuff).toContainText(`${nurse.readingQuality}${label(devices.qualities, 'good')}`);
 await expect(cuff).toContainText(nurse.carries);

 /* The kit's own queue says where each device reading came from and how good the sample was. */
 await expect(page.getByText(`${nurse.readingSource}: ${label(devices.sources, 'kit-instrument')}`).first()).toBeVisible();
 await expect(page.getByText(`${nurse.readingQuality}: ${label(devices.qualities, 'acceptable')}`).first()).toBeVisible();
 expect(await noSidewaysScroll(page)).toEqual([]);
});

test('the Control Tower\'s recall says why, and marks the readings taken since rather than deleting them', async ({ page }) => {
 await openWorkspace(page, 'Control Tower');
 await goSection(page, 'Incidents');
 const registry = page.getByRole('region', { name: ops.heading });
 const row = registry.getByRole('row', { name: new RegExp(`${instrument('bp-cuff')} MT-BP-4471`) });
 await row.getByRole('button', { name: ops.recall }).click();
 const form = registry.getByRole('group', { name: `${ops.recall}: ${instrument('bp-cuff')} MT-BP-4471` });
 await form.getByRole('button', { name: ops.confirm }).click();
 await expect(form.getByRole('alert')).toHaveText(statement('recall-without-reason'));

 await form.getByLabel(ops.reason).selectOption({ label: label(devices.recall.reasons, 'damaged') });
 await form.getByLabel(ops.effectiveFrom).selectOption({ label: 'An hour ago' });
 await form.getByRole('button', { name: ops.confirm }).click();
 await expect(registry.getByText(/Readings from it taken since then, marked and kept: 1\. None was deleted\./)).toBeVisible();
 await expect(row.getByText(label(devices.health.states, 'recalled'), { exact: true })).toBeVisible();
 await expect(row.getByRole('button', { name: ops.recall })).toHaveCount(0);
 /* The registry table is wider than a phone. It scrolls inside its own container, and the Control Tower's
    Incidents page around it must not scroll sideways, before or after the recall form opened and closed. */
 expect(await noSidewaysScroll(page)).toEqual([]);
});

for (const integration of ['Apple Health', 'Health Connect']) {
 test(`asking to link ${integration} records the request and says, before and after, that nothing is connected`, async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'More' }).click();
  await page.locator('.module-card').filter({ hasText: integration }).getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(noticeFor('wearables'), { exact: false }).first()).toBeVisible();

  const request = sheet.getByRole('region', { name: fill(link.heading, { platform: integration }) });
  await expect(request.getByText(link.notConnected)).toBeVisible();
  await expect(request.getByText(link.why)).toBeVisible();
  await expect(request.getByText(link.notInThisBuild)).toBeVisible();
  const record = request.getByRole('button', { name: link.request });
  await expect(record).toBeDisabled();
  await request.getByRole('checkbox', { name: 'Pulse', exact: true }).check();
  await request.getByRole('checkbox', { name: wearableWording }).check();
  await record.click();

  await expect(request.getByText(link.state.label, { exact: true })).toBeVisible();
  await expect(request.getByText(link.notConnected)).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Connect/ })).toHaveCount(0);
  await request.getByRole('button', { name: link.withdraw }).click();
  await expect(request.getByText(link.withdrawn)).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
 });
}
