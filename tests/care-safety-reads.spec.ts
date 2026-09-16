import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openWorkspace } from './nav';

/* Wave 6: the four Care reads and Safety's incident register version, on both viewports.
 *
 * Care declared GET /v1/care/shifts@1, GET /v1/care/services@1, GET /v1/care/locum-shifts@1 and
 * GET /v1/care/circuits@1 in Wave 2 and answered none of them until now. The Control Tower's
 * Dispatch board draws the shift and circuit reads from the same arithmetic the engine runs
 * (packages/engines/src/care/domain/reads.ts); the nurse's Locum shifts screen carries the exact
 * refusal a locum with no current Trust Score is given.
 *
 * Safety's incident register moved to version three so Verify's door mismatch could report through
 * it as an engine caller; that wiring is packages/engines/src/trust/engine.ts's, proved on the
 * runtime by packages/engines/src/trust/engine.test.ts. What a person sees is unchanged, so this
 * spec proves it stayed unchanged rather than re-proving the wiring: the door mismatch still tells
 * the patient a safety incident was raised. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const roster = json('../packages/catalog/roster.json') as { nurses: { id: string; name: string }[] };
const scheduling = json('../packages/catalog/scheduling.json') as { offer: { days: number } };
const careApi = json('../packages/catalog/apis/care.json') as { routes: { method: string; path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const vis = json('../packages/catalog/verify-in-service.json');
const careRefusal = (path: string, version: number, id: string) =>
  careApi.routes.find(r => r.method === 'GET' && r.path === path && r.version === version)!.refusals.find(r => r.id === id)!.statement;

test('a dispatcher\'s shift board reads every nurse\'s day, and the rural circuits are refused while every one is draft', async ({ page }) => {
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Dispatch');

  await expect(page.getByRole('heading', { name: /^Shifts/ })).toBeVisible();
  /* Scoped to the shift board's own panel: a nurse's name is also an SVG marker title on the map
     above (present in the DOM but never visible) and a row in the "Nearest available nurses" list
     the dispatch board already draws, so an unscoped locator would either match a hidden node or
     resolve to two visible ones for the same nurse. */
  const shiftsPanel = page.locator('.shift-board-panel');
  /* One row per nurse for the nearest scheduled day — GET /v1/care/shifts@1 answered a dispatcher
     every nurse's day, never only her own, which is the refusal a nurse or a locum is held to. */
  for (const nurse of roster.nurses) await expect(shiftsPanel.getByText(nurse.name, { exact: false })).toBeVisible();
  expect(scheduling.offer.days).toBeGreaterThan(0);

  /* GET /v1/care/circuits@1: nothing packages/catalog/care.json names is published yet, so the read
     is refused in the contract's own words rather than answered with a list that would read as
     "there are none". */
  await expect(page.getByText(careRefusal('/v1/care/circuits', 1, 'circuit-not-published'))).toBeVisible();
});

test('a locum reading her shifts is refused in the contract\'s own words while her Trust Score is not current', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Locum shifts', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(careRefusal('/v1/care/locum-shifts', 1, 'unverified-locum'));
  await sheet.getByRole('button', { name: 'Close' }).first().click();
});

test('a door mismatch the patient answers herself still tells her a safety incident was raised', async ({ page }) => {
  /* Wave 6 moved this register to POST /v1/safety/incidents@3 so Verify could report through it as
     an engine caller; the sentence the patient reads is packages/catalog/verify-in-service.json's,
     unchanged by that move. */
  await page.goto('/app/');
  await chooseRole(page, 'Patient');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: /^My visits/ }).click();
  else await page.locator('.tabbar button').nth(2).click();
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await page.getByRole('button', { name: vis.door.patient.open }).click();
  const region = page.getByRole('region', { name: vis.door.patient.heading });
  await region.getByRole('button', { name: vis.door.answers.find((a: { id: string }) => a.id === 'not-my-nurse').label }).click();
  await expect(region.getByRole('alert')).toContainText(vis.door.patient.mismatch);
  await expect(region.getByRole('alert')).toContainText('a safety incident has been raised');
});
