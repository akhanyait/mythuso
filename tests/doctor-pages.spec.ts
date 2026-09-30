import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The doctor's pages from the Lovable export's arrangement (30 September 2026, builder S3), on both
 * viewports. The export draws each as a title, a strip of figures and a list, and most of its figures and
 * rows were invented — "124 consultations +12%", "RX-5831 Issued", "HbA1c · 8.2%", "Ratified · version 3",
 * "6 d median wait", a Stable/Review/Due badge on every patient. These journeys hold the arrangement to the
 * honest form it took: every figure is counted off rows on the same page, every notice is the contract's,
 * and what stays refused is absent. Sentences are read from the contracts rather than typed here. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const clinical = json('../packages/catalog/clinical.json');
const thusoiq = json('../packages/catalog/thusoiq.json');
const medicines = json('../packages/catalog/medicines.json');
const protocols = json('../packages/catalog/protocols.json') as { protocols: { id: string; version: number; status: string }[] };

const main = (page: Page) => page.locator('main .cl-chapter');
/* A strip's figure by its label, as a number. */
const figure = async (page: Page, label: string) =>
  Number(((await main(page).locator('.ui-metric').filter({ hasText: label }).first().locator('.ui-metric__value').textContent()) ?? '').match(/\d+/)?.[0]);
const noSidewaysScroll = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page');
  for (const el of Array.from(document.querySelectorAll('main .cl-chapter *')) as HTMLElement[]) {
    if (el.closest('.iq-patients, .dp-chips, .tcx-table-wrap, .iq-table-wrap, .visually-hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.right > document.documentElement.clientWidth + 1) out.push(`${el.tagName}.${el.className}`);
  }
  return out.slice(0, 5);
});

test.beforeEach(async ({ page }) => { await openWorkspace(page, 'Doctor'); });

test('the review queue is master and detail: a row chooses the case, the panel carries the inbox facts, and the case is signed in the review', async ({ page }) => {
  const rows = page.locator('.review-list .review-row');
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
  const panel = page.locator('.rq-case');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Lerato Molefe');
  await expect(panel).toContainText(clinical.reviews.screen.recordComplete);
  await expect(panel).toContainText(clinical.reviews.screen.mode);
  /* The panel is the reading: it signs nothing, so no "Sign the review" is inside it. */
  await expect(panel.getByRole('button', { name: new RegExp(clinical.reviews.screen.sign) })).toHaveCount(0);
  await rows.filter({ hasText: 'TH-2045' }).click();
  await expect(rows.filter({ hasText: 'TH-2045' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Nomsa Molefe');
  await expect(panel).toContainText(clinical.reviews.screen.recordIncomplete);
  await panel.getByRole('button', { name: 'Open the case to sign' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Schedule is the sandbox day, counted off its rows, and draws no week or month', async ({ page }) => {
  await goSection(page, 'Schedule');
  await expect(main(page).getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
  const rows = main(page).locator('.dp-list > li');
  expect(await figure(page, 'Visits today')).toBe(await rows.count());
  await expect(main(page)).toContainText('ThusoIQ connection: sandbox adapter');
  await expect(main(page).getByRole('button', { name: /^(Week|Month)$/ })).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('Patient context lists patients beside the file, never finds one by a protected condition, and gives no status badge', async ({ page }) => {
  await goSection(page, 'Patient context');
  const list = main(page).getByRole('list', { name: 'Patients' });
  const rows = list.getByRole('button');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(rows.first()).toContainText('Last seen');
  for (const word of ['Stable', 'Review', 'Due']) await expect(list.getByText(word, { exact: true })).toHaveCount(0);
  /* A protected condition is never a chip in the file's header, so it is never a thing the search reads. */
  await main(page).getByLabel('Search patients').fill('HIV');
  await expect(rows).toHaveCount(0);
  await expect(list).toHaveCount(0);
  await main(page).getByLabel('Search patients').fill('Sipho');
  await expect(main(page).getByRole('list', { name: 'Patients' }).getByRole('button')).toHaveCount(1);
  await main(page).getByRole('list', { name: 'Patients' }).getByRole('button').click();
  await expect(main(page).locator('.pfx-identity h2')).toHaveText('Sipho Radebe');
  await expect(main(page).getByLabel('Open the file of')).toHaveCount(0);
  await expect(main(page)).toContainText(noticeFor('clinical-records'));
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('Consultation records lists the records it counts, above the composer, and leaves every protected entry out', async ({ page }) => {
  await goSection(page, 'Consultation records');
  const rows = main(page).locator('.dp-panel .dp-list > li');
  expect(await figure(page, 'Records on this list')).toBe(await rows.count());
  /* ENC-4371 is Sipho Radebe's protected HIV consultation, released to this doctor: it is read in his file, never on a list. */
  await expect(main(page)).not.toContainText('ENC-4371');
  await expect(main(page).getByRole('region', { name: clinical.consultation.screen.heading, exact: true })).toBeVisible();
});

test('Credentials is read from the register: eight checks, nothing to edit and nothing saved', async ({ page }) => {
  await goSection(page, 'Credentials');
  await expect(main(page).getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
  await expect(main(page)).toContainText('HPCSA MP0483217');
  await expect(main(page)).toContainText('8 of 8');
  await expect(main(page)).toContainText(noticeFor('credential-verification'));
  await expect(main(page).getByRole('textbox')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Save/ })).toHaveCount(0);
  await expect(main(page)).not.toContainText(/Settings saved|Changes saved/i);
});

test('Triage says it is not formed in the contract’s words and interprets nothing', async ({ page }) => {
  await goSection(page, 'Triage');
  const screen = main(page);
  await expect(screen.getByRole('heading', { level: 1, name: 'Triage' })).toBeVisible();
  await expect(screen).toContainText(clinical.triage.triageProtocols.why);
  await expect(screen).toContainText(clinical.triage.notTriaged.human);
  await expect(screen).toContainText(thusoiq.wearables.neverInferred);
  for (const stage of clinical.triage.stages) await expect(screen).toContainText(stage.label);
  /* Freshness only: no severity, no score, no heatmap, no early-warning figure. */
  await expect(screen.locator('.dp-tile')).toHaveCount(thusoiq.wearables.metrics.length);
  for (const word of [/early.warning/i, /NEWS2/, /heatmap/i, /severity/i, /\bscore\b/i]) await expect(screen.locator('.dp-panel')).not.toContainText(word);
  await screen.getByRole('button', { name: clinical.triage.screen.start }).click();
  await expect(screen.locator('.ci-answer')).toContainText(clinical.triage.notTriaged.label);
});

test('Write a prescription lists by reference and state, and never says "Issued" or "no interactions"', async ({ page }) => {
  await goSection(page, medicines.screen.prescribe.heading);
  const screen = main(page);
  await expect(screen).toContainText(medicines.interactionChecks.outcomes[0].reason);
  await expect(screen).not.toContainText(/\bIssued\b/);
  for (const phrase of medicines.interactionChecks.neverSays) await expect(screen).not.toContainText(new RegExp(phrase, 'i'));
  expect(await figure(page, 'Prescribed this session')).toBe(await screen.locator('.dp-panel .dp-list > li').count());
});

test('Referrals lists what is on file across patients, leaves protected entries out and works out no wait', async ({ page }) => {
  await goSection(page, 'Referral pathway');
  const rows = main(page).locator('.dp-panel .dp-list > li');
  expect(await figure(page, 'Referrals on file')).toBe(await rows.count());
  await expect(main(page)).not.toContainText('REF-0288');
  await expect(main(page)).not.toContainText(/median/i);
});

test('the protocol registry is a list where every row reads Draft, under three counted figures', async ({ page }) => {
  await goSection(page, 'Protocols');
  const list = main(page).getByRole('list', { name: 'Protocol versions' });
  await expect(list.getByRole('listitem')).toHaveCount(protocols.protocols.length);
  await expect(list.getByText('Draft', { exact: true })).toHaveCount(protocols.protocols.filter(p => p.status === 'draft').length);
  expect(await figure(page, 'Draft protocols')).toBe(protocols.protocols.filter(p => p.status === 'draft').length);
});

test('Reports and Resources are index pages: counted figures and doors, no rate and no percentage', async ({ page }) => {
  await goSection(page, 'Reports');
  await expect(main(page).locator('.ui-metric__value').filter({ hasText: '%' })).toHaveCount(0);
  await main(page).getByRole('button', { name: /^Per-case fees/ }).click();
  await expect(main(page).getByRole('heading', { level: 1, name: 'Per-case fees' })).toBeVisible();
  await goSection(page, 'Resources');
  expect(await figure(page, 'Protocols in the registry')).toBe(protocols.protocols.length);
  await expect(main(page)).not.toContainText(/Updated \d/);
});

test('the call room carries the patient beside the stage, with no camera, no microphone and no notes box', async ({ page }) => {
  await goSection(page, 'Teleconsultation');
  const d = main(page);
  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await d.locator('label.checkbox').filter({ hasText: /May she stay/ }).locator('input').check();
  await d.getByRole('button', { name: /Check identity/ }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('button', { name: /Confirm and continue/ }).click();
  await d.getByRole('button', { name: /Open the call/ }).click();
  await d.getByRole('button', { name: /Skip the wait/ }).click();
  const aside = d.locator('.tcx-aside');
  await expect(aside.getByRole('heading', { name: 'Lerato Molefe' })).toBeVisible();
  await expect(aside).toContainText('Chronic care follow-up');
  await expect(d.getByRole('button', { name: /microphone|camera|Save draft/i })).toHaveCount(0);
  await expect(aside.getByRole('textbox')).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toEqual([]);
});
