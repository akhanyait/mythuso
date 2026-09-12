import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* Three bodies of prose, read off the screen and compared with the file they now live in.
 *
 * Each of these was rendered to a person on three platforms and typed separately on each, with
 * nothing comparing the copies: about 2,500 words of reading explanations, six arrival refusals,
 * and what the offline queue survives. scripts/check-boundaries.mjs is what stops a fourth copy
 * being written. This file asks the other half of the question, which a boundary check cannot:
 * whether the words in the contract are the words a person actually sees.
 *
 * Nothing below is typed out. Every expected string is read from packages/catalog at run time —
 * which it has to be, because the same boundary check refuses these sentences as literals in a test
 * file as firmly as in a screen. A test carrying its own copy is a fourth copy that passes. */

const contract = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}.json`, import.meta.url), 'utf8'));
const records = contract('records');
const geography = contract('geography');
const capture = contract('capture');

const privacyRule = (id: string) => geography.privacy.rules.find((r: { id: string }) => r.id === id).statement;
const refusal = (id: string) => geography.refusals.find((r: { id: string }) => r.id === id).sentence;
const store = (id: string) => capture.durability.stores.find((s: { id: string }) => s.id === id);

const tabIndex: Record<string, number> = { 'Overview': 0, 'Book a nurse': 1, 'My visits': 2, 'Health Passport': 3 };
async function navigate(page: Page, label: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: new RegExp(`^${label}`) }).click(); return; }
  if (label in tabIndex) { await page.locator('.tabbar button').nth(tabIndex[label]).click(); return; }
  await page.locator('.tabbar button').last().click();
  await page.locator('.menu-row').filter({ hasText: label }).first().click();
}

/* Playwright matches on rendered text, and rendered text has had its whitespace collapsed by the
   browser. The contract's sentences have single spaces in them already; this is here so a sentence
   that ever wraps across two source lines still matches what a person reads. */
const onScreen = (sentence: string) => new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));

test('every reading explains itself in the contract’s own words, and says who wrote them', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'Health Passport');
  await page.getByRole('button', { name: /What these readings mean/ }).click();
  await expect(page.getByRole('heading', { name: 'What your readings mean.' })).toBeVisible();

  const rows = page.locator('.explain-item');
  await expect(rows).toHaveCount(records.explanations.entries.length);

  /* Two entries opened rather than seven, because what is being proved is that the screen renders
     the contract and not that it renders seven of anything. Oxygen is the one that matters most:
     it is the entry carrying the published bias, and a paragraph about a pulse oximeter that has
     lost the sentence about darker skin is a paragraph that will be believed on the wrong person. */
  for (const id of ['oxygen', 'glucose']) {
    const entry = records.explanations.entries.find((e: { id: string }) => e.id === id);
    const label = records.observations.measures.find((m: { id: string }) => m.id === id).label;
    const row = rows.filter({ hasText: label });
    await row.getByRole('button').first().click();
    await expect(row.getByText(onScreen(entry.measures))).toBeVisible();
    await expect(row.getByText(onScreen(entry.below))).toBeVisible();
    await expect(row.getByText(onScreen(entry.whatToDo))).toBeVisible();
  }

  /* The provenance, and these two above all. Generating this prose into Swift and Kotlin makes it
     look official; the sentences saying a person wrote it and no clinician has read it are the
     correction, and they are the ones a tidy-up would take off the bottom of a long screen. */
  for (const key of ['written', 'unreviewed', 'whoDecides', 'neverChange']) {
    await expect(page.getByText(onScreen(records.explanations.provenance[key])).first()).toBeVisible();
  }
});

/* The sample visit is the next slot with room in it, which rolls to tomorrow once the day's last
   slot has gone — so a journey that reaches this screen through "today" passes all morning and times
   out all evening. Pinned, for the same reason tests/arrival.spec.ts pins it. */
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-09-10T06:00:00Z')); });

test('the arrival screen refuses in the contract’s words, and shows nothing before the day', async ({ page }) => {
  await page.goto('/app/');
  await navigate(page, 'My visits');
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await expect(page.getByRole('heading', { name: 'Where is your nurse?' })).toBeVisible();

  /* The two refusals this screen exists to make, both out of geography.json: the figure is not an
     arrival time, and neither end of the line is a doorstep. */
  await expect(page.getByText(onScreen(refusal('not-an-arrival-time'))).first()).toBeVisible();
  await expect(page.getByText(onScreen(privacyRule('no-doorstep-at-either-end'))).first()).toBeVisible();
  /* And the sharpest one. It is arithmetic rather than copy — no state that draws a nurse is
     reachable unless the visit is today — but the sentence is what tells a patient that, and a rule
     enforced silently is one nobody can hold the product to. */
  await expect(page.getByText(onScreen(privacyRule('only-on-the-day'))).first()).toBeVisible();
  await expect(page.getByText(onScreen(privacyRule('nothing-is-measured'))).first()).toBeVisible();
});

test('the nurse’s queue says what it survives in the words the contract holds', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Assessments');
  await page.locator('.vq-strip').click();
  const queue = page.locator('.vq-panel');
  const web = store('web-in-memory');
  /* The web keeps less than either phone, on purpose, and the sentence saying so is the contract's.
     capture.json holds all four stores; this is the only one this platform is allowed to render. */
  for (const sentence of web.says.lostTo) {
    await expect(queue.getByText(onScreen(sentence)).first()).toBeVisible();
  }
  /* And it may not quietly borrow a phone's promise. Nothing on a browser screen may claim to
     survive a reload, because nothing in apps/web/src may write to the browser's storage. */
  expect(web.kind).toBe('memory');
  expect(web.survives).not.toContain('reload');
});
