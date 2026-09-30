import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openDestination, openWorkspace } from './nav';
import { capabilityOf } from './nav';

/* Medicines & Labs, on both viewports.
 *
 * One tab walks the chain the way four people would: the doctor prescribes against a check that says it was not
 * run, the pharmacy's responsible pharmacist verifies and dispenses, the patient chooses the nurse and is shown a
 * PIN once, and the nurse is refused a wrong PIN before the right one hands the bag over. A second journey orders a
 * test, moves the page's clock past the synthetic laboratory's turnaround, and is refused the close until the
 * result is acknowledged — the Wave 4 exit test, in a browser.
 *
 * Every sentence, label and minute is read from the contracts, and every refusal is the route's own, so a reworded
 * refusal moves these tests with it rather than breaking them. The preview holds all of it in the tab's memory, which
 * is why the journey changes role without reloading. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const medicines = json('../packages/catalog/medicines.json');
const api = json('../packages/catalog/apis/medicines.json') as { refusals: { id: string; statement: string }[]; routes: { withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const words = medicines.screen;
const notChecked = medicines.interactionChecks.outcomes.find((o: { code: string }) => o.code === 'not-checked');
const sentence = (id: string): string => {
  const found = [...api.refusals, ...api.routes.filter(r => !r.withdrawn).flatMap(r => r.refusals)].find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/medicines.json declares no live refusal ${id}`);
  return found.statement;
};

/* The pharmacy's queue is still one of the partner's More tools and opens as a dialog. The doctor's prescription and
   results and the nurse's hand-over are destinations in their grouped navigation since 30 September, reached with
   openDestination and scoped to the page rather than to a dialog; every assertion about them is unchanged. */
async function tool(page: Page, name: string) {
  await page.locator('.tool-link').filter({ hasText: name }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name })).toBeVisible();
  return dialog;
}
const closeDialog = (page: Page) => page.getByRole('button', { name: 'Close dialog' }).click();

test('prescribed against a check that was not run, verified and dispensed, authorised by the patient and handed over against the PIN', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  let dialog = await openDestination(page, words.prescribe.heading);
  await expect(dialog).toContainText(medicines.formulary.notice);
  await dialog.getByLabel(words.prescribe.search).fill('Synthetic');
  await dialog.getByRole('radio').first().check();
  await dialog.getByRole('button', { name: words.prescribe.check }).click();
  await expect(dialog).toContainText(notChecked.reason);
  for (const phrase of medicines.interactionChecks.neverSays) await expect(dialog).not.toContainText(new RegExp(phrase, 'i'));
  await dialog.getByRole('button', { name: words.prescribe.prescribe, exact: true }).click();
  await expect(dialog).toContainText(sentence('not-checked-not-read'));
  await dialog.getByRole('checkbox', { name: medicines.interactionChecks.acknowledgement }).check();
  await dialog.getByRole('button', { name: words.prescribe.prescribe, exact: true }).click();
  await expect(dialog).toContainText(words.prescribe.prescribed);

  await chooseRole(page, 'Pharmacy partner');
  dialog = await tool(page, words.pharmacy.heading);
  await expect(dialog).toContainText(words.pharmacy.checkedAtPrescribe.replace('{outcome}', notChecked.label));
  await dialog.getByRole('button', { name: words.pharmacy.verify, exact: true }).click();
  await expect(dialog).toContainText(words.pharmacy.verified);
  await dialog.getByRole('button', { name: words.pharmacy.dispenseCheck }).click();
  await dialog.getByRole('checkbox', { name: medicines.interactionChecks.acknowledgement }).check();
  await dialog.getByRole('button', { name: words.pharmacy.dispense, exact: true }).click();
  await expect(dialog).toContainText(words.pharmacy.dispensed);
  await closeDialog(page);

  await chooseRole(page, 'Patient');
  await goSection(page, 'Health Passport');
  await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Medications' }).click();
  await page.getByRole('button', { name: /What happens after a doctor signs one/ }).click();
  await page.getByRole('button', { name: capabilityOf('medicine-collection').name }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: words.authorise.heading })).toBeVisible();
  await dialog.getByRole('button', { name: words.authorise.authorise }).click();
  await expect(dialog).toContainText(words.authorise.pinShownOnce);
  const pin = (await dialog.getByTestId('medicines-pin').textContent())!.trim();
  expect(pin).toHaveLength(medicines.custody.pinDigits.value);
  await closeDialog(page);

  await chooseRole(page, 'Nurse');
  dialog = await openDestination(page, words.handover.heading);
  await dialog.getByRole('button', { name: words.handover.collect }).click();
  await dialog.getByRole('radio', { name: words.handover.sealIntact }).check();
  const wrong = pin.replace(/\d$/, d => String((Number(d) + 1) % 10));
  await dialog.getByLabel(`${words.handover.pin}, digit 1 of ${pin.length}`).fill(wrong);
  await dialog.getByRole('button', { name: words.handover.handOver }).click();
  await expect(dialog).toContainText(sentence('wrong-pin'));
  await dialog.getByRole('radio', { name: words.handover.sealIntact }).check();
  await dialog.getByLabel(`${words.handover.pin}, digit 1 of ${pin.length}`).fill(pin);
  await dialog.getByRole('button', { name: words.handover.handOver }).click();
  await expect(dialog).toContainText(words.handover.handedOver);
});

test('a lab result cannot close until the clinician who ordered it acknowledges it', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-15T09:00:00+02:00') });
  await openWorkspace(page, 'Doctor');
  const dialog = await openDestination(page, words.results.heading);
  await dialog.getByRole('button', { name: words.results.order }).click();
  await expect(dialog).toContainText(words.results.ordered);
  await dialog.getByRole('button', { name: words.results.close, exact: true }).click();
  await expect(dialog).toContainText(sentence('no-result-yet'));

  /* Jumped rather than run: two hours of the preview's one-second beats, each fired, is a test spending its time on
     a clock. The laboratory answers on the first beat after the jump. */
  await page.clock.fastForward(medicines.labs.syntheticLab.turnaroundMinutes * 60_000);
  await page.clock.runFor(2_000);
  await expect(dialog).toContainText('synthetic-result-');
  await dialog.getByRole('button', { name: words.results.close, exact: true }).click();
  await expect(dialog).toContainText(sentence('lab-result-complete-before-acknowledgement'));
  await dialog.getByRole('button', { name: words.results.acknowledge, exact: true }).click();
  await expect(dialog).toContainText(words.results.acknowledged);
  await dialog.getByRole('button', { name: words.results.close, exact: true }).click();
  await expect(dialog).toContainText(words.results.closed);
});
