import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { chooseRole, goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The partner's boards in the Lovable export's arrangement (30 September 2026, builder S3), on both
 * viewports: the fourth tile, Orders as master and detail, a track on every result, the repeats summary
 * and the sealed bags to hand over. What stays refused: no patient on a pharmacy's board (medicines.json's
 * partnerQueue.neverCarries), no Approve or Decline on a substitution, no invented handover time. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const medicines = json('../packages/catalog/medicines.json');
const main = (page: Page) => page.locator('main .cl-chapter');
/* The fixture patients' names — none may appear on the partner's boards. */
const names = ['Lerato Molefe', 'Thabo Molefe', 'Nomsa Molefe'];
/* Every fixture patient the preview holds, read rather than typed: the ThusoIQ sandbox's care queue, which the
   workbench under Orders is drawn from, and every name a catalog contract files under "patient". */
const catalogDir = new URL('../packages/catalog/', import.meta.url);
const fixturePatients = [...new Set([
  ...[...readFileSync(new URL('../packages/thusoiq/fixtures.ts', import.meta.url), 'utf8').matchAll(/name:'([^']+)'/g)].map(m => m[1]),
  ...readdirSync(catalogDir).filter(f => f.endsWith('.json'))
    .flatMap(f => [...readFileSync(new URL(f, catalogDir), 'utf8').matchAll(/"patient"\s*:\s*"([A-Z][a-z]+ [A-Z][A-Za-z'-]+)"/g)].map(m => m[1]))
])];
const partnerSections = ['Orders', 'Substitution & repeats', 'Collections', 'Results'];
/* The words the workbench is written in, read from the contracts it reads them from. */
const records = json('../packages/catalog/records.json') as { consultation: { soap: { name: string }[] } };
const workbench = (page: Page) => page.getByRole('region', { name: 'ThusoIQ clinical workspace' });
/* Everything a section holds, closed disclosures included: a name in a collapsed trail is still on the screen. */
const everything = (page: Page) => page.locator('main').evaluate(el => el.textContent ?? '');

test.beforeEach(async ({ page }) => { await openWorkspace(page, 'Partner'); });

test('Orders counts what is yours, and a row chooses the order its chain stands beside', async ({ page }) => {
  const yours = main(page).locator('.fulfil-row').filter({ hasText: 'Yours' });
  const tile = main(page).locator('.s-metric').filter({ hasText: 'Yours to act on' });
  await expect(tile.locator('.s-metric-value')).toHaveText(String(await yours.count()));
  const panel = main(page).locator('.rq-case');
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('RX-0081');
  await expect(panel.getByRole('list', { name: /Where RX-0081 is/ }).getByRole('listitem')).toHaveCount(3);
  await main(page).locator('.fulfil-row').filter({ hasText: 'LAB-0019' }).click();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('LAB-0019');
  await panel.getByRole('button', { name: 'Open the laboratory order' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  for (const name of names) await expect(main(page).locator('.dp-split')).not.toContainText(name);
  await expect(panel).toContainText(medicines.partnerQueue.why.split('. ')[0]);
});

test('Results carries a track on every row and names no patient', async ({ page }) => {
  await goSection(page, 'Results');
  const rows = main(page).locator('.fulfil-row');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(main(page).locator('.fo-track')).toHaveCount(await rows.count());
  for (const name of names) await expect(main(page).locator('.fulfil-list')).not.toContainText(name);
});

test('Substitution & repeats opens on a summary that reads and does not approve', async ({ page }) => {
  await goSection(page, 'Substitution & repeats');
  const summary = main(page).getByRole('list', { name: 'Items on the script' });
  expect(await summary.getByRole('listitem').count()).toBeGreaterThan(1);
  await expect(main(page).locator('.dp-page').getByRole('button', { name: /Approve|Decline/ })).toHaveCount(0);
});

test('Collections lists sealed bags by custody state and says nothing is collected', async ({ page }) => {
  await goSection(page, 'Collections');
  const bags = main(page).getByRole('region', { name: 'Sealed bags to hand over' });
  await expect(bags).toContainText(noticeFor('medicine-collection'));
  await expect(bags).toContainText(medicines.custody.states[0].label.toLowerCase());
  await expect(bags.getByRole('button', { name: /hand over/i })).toHaveCount(0);
});

/* The workbench under Orders drew a care queue of named patients with their initials, and a patient card with the
   reason for care and the allergy record, directly under a board that had had its names taken off. None of the
   fixture's patients is named anywhere on any of the four sections now, hidden text included, and the workbench's
   queue is of requests rather than people. */
test('no fixture patient is named anywhere on the partner\'s four sections', async ({ page }) => {
  expect(fixturePatients.length).toBeGreaterThanOrEqual(names.length);
  for (const section of partnerSections) {
    await goSection(page, section);
    await expect(page).toHaveTitle(new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Partner`));
    await expect(main(page)).not.toBeEmpty();
    const text = await everything(page);
    for (const name of fixturePatients) expect(text, `${section} names ${name}`).not.toContain(name);
  }
  await goSection(page, 'Orders');
  const bench = workbench(page);
  await expect(bench.getByRole('complementary', { name: 'Medication requests' })).toBeVisible();
  await expect(bench.getByRole('complementary', { name: 'Clinical patients' })).toHaveCount(0);
  /* The contract's sentence stands on the Orders panel above the bench, where the first journey reads it. */
  await expect(main(page).locator('.rq-case')).toContainText(medicines.partnerQueue.why.split('. ')[0]);
  await expect(bench.getByRole('group', { name: 'Clinical tools' })).toHaveCount(0);
  await expect(bench).not.toContainText('PATIENT CONTEXT');
  await expect(bench).not.toContainText('Allergy record');
});

/* A request a doctor sends, opened at the pharmacy: what to dispense and the three acts, with no patient, no initials
   and no prescriber on the bench or in its trail, before and after the pharmacist acts on it. */
test('a request a doctor sends reaches the pharmacy by its reference, and names nobody there', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  const bench = workbench(page);
  const tool = (name: string) => bench.getByRole('group', { name: 'Clinical tools' }).getByRole('button', { name });
  await tool('Consultation').click();
  for (const step of records.consultation.soap) await bench.getByRole('textbox', { name: step.name, exact: true }).fill(`A fictional ${step.name.toLowerCase()} for the sandbox.`);
  await bench.getByRole('button', { name: 'Save clinical draft' }).click();
  await tool('Diagnostic review').click();
  await bench.locator('textarea[name="impression"]').fill('A fictional impression.');
  await bench.locator('textarea[name="evidence"]').fill('A fictional finding it rests on.');
  await bench.getByRole('button', { name: 'Submit assessment for review' }).click();
  await bench.locator('textarea[name="rationale"]').fill('A fictional reason to confirm it.');
  await bench.getByRole('button', { name: 'Record doctor decision' }).click();
  await tool('Consultation').click();
  await bench.getByRole('button', { name: 'Sign consultation' }).click();
  await tool('Dispensary').click();
  await bench.locator('textarea[name="directions"]').fill('One a day, with food.');
  await bench.getByRole('button', { name: 'Send to dispensary' }).click();
  await expect(bench.getByRole('status')).toContainText('Medication request added');
  const reference = (await bench.locator('.iq-record-line').first().textContent())!.match(/RX-\d+/)![0];

  await chooseRole(page, 'Pharmacy partner');
  const pharmacy = workbench(page);
  const row = pharmacy.getByRole('complementary', { name: 'Medication requests' }).getByRole('button', { name: new RegExp(reference) });
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  /* The disc on a request's row is the medicine's mark, never a person's initials. */
  await expect(row.locator('.avatar')).toHaveText('');
  await expect(pharmacy.locator('.iq-record-head h4')).not.toBeEmpty();
  await expect(pharmacy).not.toContainText('Prescriber');
  await pharmacy.getByRole('checkbox', { name: 'Original prescription checked' }).check();
  await pharmacy.getByRole('checkbox', { name: 'Allergy record reconciled' }).check();
  await pharmacy.getByRole('button', { name: 'Verify prescription' }).click();
  await expect(pharmacy.getByRole('status')).toContainText('Pharmacist verification recorded.');
  await pharmacy.getByRole('checkbox', { name: 'Recipient identity checked' }).check();
  await pharmacy.getByRole('button', { name: 'Record handover' }).click();
  await expect(pharmacy.getByRole('status')).toContainText('handover recorded');
  await expect(pharmacy.locator('.iq-audit summary')).toHaveText(/· 2 events/);
  const text = await everything(page);
  for (const name of fixturePatients) expect(text, `the pharmacy's Orders names ${name}`).not.toContain(name);
  /* The prescriber's reference is on partnerQueue.neverCarries as well, and a request's own event is signed with it. */
  expect(await pharmacy.evaluate(el => el.textContent ?? '')).not.toContain('D-401');
});
