import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* The HL7 v2 bridge (Wave 5), on both viewports, as the three people it reaches use it.
 *
 * The patient reads the log of who opened their record and finds each message a hospital or a laboratory sent, by who
 * sent it and what kind, beside the one the Passport refused — and nothing any message said. The doctor orders a test,
 * receives the synthetic laboratory's result as an HL7 message read by the Passport's own parser, is refused the close
 * until she acknowledges it, and closes it after. A development operator reads the quarantine: who, what kind and why,
 * with no identifier on the screen.
 *
 * Every sentence, label and count is read from the contracts. Nothing here is a real service. */

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const hl7 = read('../packages/catalog/hl7v2-inbound.json');
const sharing = read('../packages/catalog/passport-sharing.json');
const gateway = read('../packages/catalog/passport-gateway.json');
const medicines = read('../packages/catalog/medicines.json');
const medicinesApi = read('../packages/catalog/apis/medicines.json');
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const refusal = (id: string) => gateway.refusals.find((r: { id: string }) => r.id === id).sentence as string;
const label = (id: string) => sharing.accessLog.actions.find((a: { id: string }) => a.id === id).label as string;
const facility = (kind: string) => hl7.facilities.find((f: { kind: string }) => f.kind === kind);
const noOverflow = (page: Page) => page.evaluate(() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; });

async function tool(page: Page, name: string) {
  await page.locator('.tool-link').filter({ hasText: name }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name })).toBeVisible();
  return dialog;
}

test('the patient finds each message a hospital or laboratory sent in the log of who opened the record, by who sent it and what kind, and nothing it said', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  await page.getByRole('button').filter({ hasText: 'Share links' }).first().click();
  await page.getByRole('button').filter({ hasText: sharing.screens.sharing.logLink }).click();
  await expect(page.getByRole('heading', { name: sharing.screens.log.title })).toBeVisible();

  const log = page.locator('.ps-log');
  const hospital = facility('hospital').label, laboratory = facility('laboratory').label;
  await expect(log.locator('.ps-entry').filter({ hasText: label('hl7v2.adt.admit') }).filter({ hasText: hospital }).filter({ hasText: gateway.statements.hl7Received }).first()).toBeVisible();
  await expect(log.locator('.ps-entry').filter({ hasText: label('hl7v2.adt.discharge') }).filter({ hasText: hospital }).first()).toBeVisible();
  await expect(log.locator('.ps-entry.is-refused').filter({ hasText: label('hl7v2.oru.result') }).filter({ hasText: laboratory }).filter({ hasText: refusal('hl7-pid-field-without-consent-basis') }).first()).toBeVisible();
  await expect(log.locator('.ps-entry').filter({ hasText: label('identifier.link') }).first()).toBeVisible();
  await expect(page.getByText(hl7.preview.patient.identifier)).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('a doctor receives a lab result as an HL7 message, is refused the close until she acknowledges it, and closes it after', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const words = medicines.screen.results;
  const incomplete = medicinesApi.refusals.find((r: { id: string }) => r.id === 'lab-result-complete-before-acknowledgement').statement as string;
  const laboratory = facility('laboratory').label;
  const kind = hl7.messageTypes.find((t: { storesAs?: string }) => t.storesAs === 'DiagnosticReport').code as string;
  await openWorkspace(page, 'Doctor');
  const dialog = await tool(page, words.heading);
  await expect(dialog.getByRole('note').filter({ hasText: hl7.screens.results.preview })).toBeVisible();
  await dialog.getByRole('button', { name: words.order }).click();
  await expect(dialog).toContainText(words.ordered);

  await dialog.getByRole('button', { name: fill(hl7.screens.results.receiveHl7, { facility: laboratory }) }).click();
  await expect(dialog).toContainText(fill(hl7.screens.results.arrivedBy, { kind, facility: laboratory }));
  await expect(dialog).toContainText(hl7.screens.results.notComplete);

  await dialog.getByRole('button', { name: words.close, exact: true }).click();
  await expect(dialog).toContainText(incomplete);
  await dialog.getByRole('button', { name: words.acknowledge, exact: true }).click();
  await expect(dialog).toContainText(words.acknowledged);
  await dialog.getByRole('button', { name: words.close, exact: true }).click();
  await expect(dialog).toContainText(words.closed);
  expect(errors).toEqual([]);
});

test('the development quarantine shows who sent each refused message, what kind and why, when its record goes, and nothing any message said', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const q = hl7.screens.quarantine;
  await openWorkspace(page, 'Control Tower');
  const dialog = await tool(page, q.heading);
  await expect(dialog.getByRole('note').filter({ hasText: q.preview })).toBeVisible();
  const rows = dialog.locator('.hq-row');
  await expect(rows).toHaveCount(hl7.preview.quarantine.length);
  for (const item of hl7.preview.quarantine) {
    const from = item.facility ? hl7.facilities.find((f: { id: string }) => f.id === item.facility).label : q.unknownFacility;
    await expect(rows.filter({ hasText: refusal(item.refusal) }).filter({ hasText: from }).first()).toBeVisible();
  }
  const retention = sharing.settings.items.find((s: { key: string }) => s.key === 'hl7-quarantine-retention-days').default.value;
  await expect(dialog.getByText(fill(q.retention, { days: retention }))).toBeVisible();
  await expect(dialog.getByText(q.noRelease)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /release/i })).toHaveCount(0);
  await expect(dialog.getByText(hl7.preview.patient.identifier)).toHaveCount(0);
  expect(errors).toEqual([]);
});
