import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmBooking, goSection, openWorkspace } from './nav';

/* The care and dispatch seams, walked end to end against four simulated suppliers.
 *
 * `booking`, `dispatch`, `credential-verification` and `teleconsultation` are all blocked on
 * something no engineer can produce — a workforce roster, live positions from nurse devices,
 * agreements with the issuing authorities, a media stack — and all four are `simulated` rather than
 * `absent` now. The whole hazard of that state is that it works: somebody who has watched a visit
 * booked against a nurse and then watched her get closer is one edit away from believing there is a
 * roster.
 *
 * So what is asserted here is not that the journey completes. It is that every screen along it goes
 * on saying, in the contract's own words, that what answered was a fixture — and that the refusals
 * the simulation declares are on the screens rather than only in the file. A simulated capability is
 * never quieter than an absent one, and silence is the disclosure failure this state was built to
 * avoid.
 *
 * Every sentence looked for below is read out of packages/catalog rather than typed here, for the
 * same reason no screen types one: a test with its own copy passes for ever after the contract has
 * been reworded.
 */
const url = (name: string) => new URL(`../packages/catalog/${name}.json`, import.meta.url);
const capabilities = JSON.parse(readFileSync(url('capabilities'), 'utf8'));
const roster = JSON.parse(readFileSync(url('roster'), 'utf8'));
const geography = JSON.parse(readFileSync(url('geography'), 'utf8'));

const simulation = (id: string) => capabilities.capabilities.find((c: { id: string }) => c.id === id).simulation;
const geographyRefusal = (id: string) => geography.refusals.find((r: { id: string }) => r.id === id).sentence;
const zoneNames = new Set(geography.zones.map((z: { name: string }) => z.name));
type RosterRow = { id: string; name: string; zone: string; sharesPosition: boolean; fix?: string; checks?: Record<string, { expiresInDays?: number }> };
const nurses: RosterRow[] = roster.nurses;
/* The three people the fixture exists to refuse, found by the property that makes each interesting
   rather than by an id typed here — so a roster reshuffled tomorrow still points these at the right
   person, and a roster that stopped having one of them fails on the find rather than on a selector. */
const lapsed = nurses.find(n => Object.values(n.checks ?? {}).some(c => (c.expiresInDays ?? 0) < 0))!;
const outsideCoverage = nurses.find(n => !zoneNames.has(n.zone))!;
const silentPhone = nurses.find(n => !n.sharesPosition && zoneNames.has(n.zone))!;

/* Navigating is tests/nav.ts's `goSection` and not a second one written here. This spec grew its
   own, which found the mobile tab bar by position in a hard-coded list rather than by accessible
   name, and waited thirty seconds for an index that is not where it thought — the shared helper had
   already been taught that a clinical tab draws a short label and carries the whole section name for
   a screen reader. A private copy of navigation is a private copy of every fix made to it since. */
const go = goSection;

/* Pinned only where it is needed. The sample visit is the next slot the offer still has room for,
   which rolls to tomorrow once the day's last slot has gone, so the journey that reaches the arrival
   screen has to know what time it is — otherwise it passes all morning and times out all evening,
   which is the worst kind of test. The other journeys are told nothing about the clock, because a
   frozen one is a whole class of things that never settle. */
const MORNING = new Date('2026-09-10T06:00:00Z'); // 08:00 in Africa/Johannesburg

test('a visit is booked against somebody the roster would actually offer, and says who it will not', async ({ page }) => {
  await page.goto('/app/');
  await go(page, 'Book a nurse');
  await page.getByRole('button', { name: /Vitals & chronic check/ }).first().click();
  const d = page.getByRole('dialog');

  await d.getByRole('button', { name: 'Continue' }).click();   // who
  await d.getByRole('button', { name: 'Continue' }).click();   // where

  /* The people the roster will not offer, each with the sentence saying why, on the step where a
     patient chooses who comes. A list that quietly drops a suspended nurse cannot tell a patient why the
     person she saw last time is missing. This moved from the review in Wave 3, when choosing a nurse
     became a step of its own. */
  const refused = d.locator('.nurse-refused li');
  await expect(refused.filter({ hasText: lapsed.name })).toContainText(simulation('booking').refuses[1]);
  await expect(refused.filter({ hasText: outsideCoverage.name })).toContainText(simulation('booking').refuses[3]);

  /* Somebody on the roster, asked for by name, rather than one name printed on every booking. */
  const firstOffered = d.locator('.nurse-list .nurse-option').first();
  const offeredName = (await firstOffered.locator('strong').innerText()).trim();
  expect(nurses.map(n => n.name)).toContain(offeredName);
  await firstOffered.click();
  await d.getByRole('button', { name: 'Continue' }).click();   // nurse
  await d.getByRole('button', { name: 'Continue' }).click();   // when
  await d.getByRole('button', { name: 'Continue' }).click();   // payment

  /* The booking capability is simulated, so the review step says which sentence it is now saying —
     not "this does not book a visit" but "the roster is simulated, these nurses are fictional". It
     sits above the button that books, which is where a person is deciding. */
  await expect(d.getByText(simulation('booking').notice)).toBeVisible();
  await expect(d.locator('.clinician-profile h3')).toHaveText(offeredName);
  /* Booked, and the confirmation carries her too. */
  await d.locator('label.checkbox input').check();
  // The simulated payment may decline; use the shared journey helper to retry explicitly.
  await confirmBooking(d);
  await expect(d.getByRole('heading', { name: 'Visit confirmed (simulated)' })).toBeVisible();
  await expect(d.locator('.nurse-row strong')).toHaveText(offeredName);
  await expect(d.getByText(simulation('booking').notice)).toBeVisible();
});

test('the dispatch board draws the roster, and says which of three reasons a pin is missing', async ({ page }) => {
  await page.goto('/app/');
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Dispatch');

  await expect(page.getByText(simulation('dispatch').notice).first()).toBeVisible();

  /* The lapsed clearance is on the board and refused on the row, rather than hidden — an operator
     who cannot see her wonders where she went instead of reading the reason. */
  const board = page.locator('.record-row.static').filter({ hasText: lapsed.name });
  await expect(board).toBeVisible();
  await expect(board.getByRole('button', { name: /Cannot be assigned/ })).toBeVisible();

  /* A phone in a bag has no pin, and the board says so in geography.json's own words rather than
     placing her somewhere plausible. */
  await expect(page.getByText(geographyRefusal('no-position-shared')).first()).toBeVisible();
  await expect(page.locator('.record-row.static').filter({ hasText: silentPhone.name })).toBeVisible();

  /* And a fix wider than the suburb it would be drawn in is not drawn either. That is the position
     feed's sharpest switch-on condition and the difference between a measurement and a decoration. */
  const wideFix = nurses.find(n => n.fix === 'poor');
  if (wideFix) await expect(page.getByText(geographyRefusal('fix-wider-than-the-suburb')).first()).toBeVisible();

  /* Somebody the roster offers can actually be sent. */
  const assignable = page.locator('.record-row.static').filter({ has: page.getByRole('button', { name: 'Assign', exact: true }) }).first();
  await assignable.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByText(/Assigned to/).first()).toBeVisible();
});

test('the patient watches her close the distance, and the screen says what is doing the moving', async ({ page }) => {
  await page.clock.setFixedTime(MORNING);
  await page.goto('/app/');
  await go(page, 'My visits');
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await expect(page.getByRole('heading', { name: 'Where is your nurse?' })).toBeVisible();

  /* The notice is the simulation's, not the absent one. */
  await expect(page.getByText(simulation('dispatch').notice)).toBeVisible();

  /* A figure with its basis above it, and a sentence saying that what moves is the arithmetic rather
     than a device. This is the whole hazard of a simulated position: a number that changes while
     somebody watches it reads as a phone reporting. */
  const lead = page.locator('.arrival-lead');
  await expect(lead.locator('.s-metric').filter({ hasText: 'Straight line' })).toContainText('min');
  await expect(lead.getByText(/straight line above worked backwards|along that straight line|is in .* now\./)).toBeVisible();

  /* And every refusal the simulation declares, on the screen rather than only in the file. */
  const facts = page.locator('.arrival-facts');
  for (const sentence of simulation('dispatch').refuses) await expect(facts.getByText(sentence, { exact: false })).toBeVisible();
  /* The four the screen already carried, intact. */
  await expect(facts.getByText(/It is not an arrival time/)).toBeVisible();
  await expect(facts.getByText(/Neither pin is a house/)).toBeVisible();
  await expect(facts.getByText(/Nowhere she has been/)).toBeVisible();
  await expect(facts.getByText(/You see this on the day and not before/)).toBeVisible();
});

test('the consultation connects through a waiting room that admits how long it is standing in for', async ({ page }) => {
  await page.goto('/app/');
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Teleconsultation');
  const d = page.locator('main');

  await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await d.locator('label.checkbox').filter({ hasText: /May she stay/ }).locator('input').check();
  await d.getByRole('button', { name: /Check identity/ }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('button', { name: /Confirm and continue/ }).click();
  await d.getByRole('button', { name: /Open the call/ }).click();

  /* The waiting room, in the contract's own words, and an admission that the wait is compressed.
     An app that says "connecting…" for eleven minutes has lied for ten of them; one that pretends a
     doctor answered in four has lied about the queue this feature exists to be honest about. */
  await expect(d.getByText(/standing in for a \d+-minute wait, played out in seconds/)).toBeVisible();
  await expect(d.getByText(simulation('teleconsultation').notice).first()).toBeVisible();
  await d.getByRole('button', { name: /Skip the wait/ }).click();

  /* Connected, on a rung of the ladder and never above it. */
  await expect(d.getByText('What this doctor may conclude, right now')).toBeVisible();
  await expect(d.getByText(simulation('teleconsultation').notice).first()).toBeVisible();

  /* And at the end, what the thing standing in for a media stack will not do — in the same list as
     the feature's own refusals rather than left in a contract nobody opens. */
  await d.getByRole('button', { name: /End without a decision/ }).click();
  const refusals = d.locator('.tc-refusals');
  for (const sentence of simulation('teleconsultation').refuses) await expect(refusals.getByText(sentence)).toBeVisible();
});

test('no simulated screen is quieter than the absent one it replaced', async ({ page }) => {
  /* The failure this guards against is not a screen that lies. It is a screen that stops speaking,
     because something answers now and nobody notices that what answers is a fixture. Each of these
     four surfaces is named by its capability in packages/catalog/capabilities.json, and each has to
     be carrying that capability's simulation notice word for word. */
  await page.goto('/app/');
  await go(page, 'My visits');
  await expect(page.getByText(simulation('booking').notice).first()).toBeVisible();

  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Dispatch');
  await expect(page.getByText(simulation('dispatch').notice).first()).toBeVisible();

  await goSection(page, 'Vetting queue');
  await expect(page.getByText(simulation('credential-verification').notice).first()).toBeVisible();
});
