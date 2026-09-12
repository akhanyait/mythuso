import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';

/* Live well, and the four things that make it a design rather than a habit tracker.
 *
 * The contract's `neverSoften` is checked at source by scripts/check-boundaries.mjs, which reads the
 * feature's own files for a forbidden word or a digit with a unit on it. What a source check cannot
 * see is the page: a number assembled at runtime, a unit that arrives from another module, a day
 * drawn as an empty row. So these journeys open the screen and read what is actually on it.
 *
 * They also check the half that is easy to leave out of a refusal-shaped feature — that it works.
 * Something written appears at the top of the record, a habit chosen changes the question above the
 * field, and what was written reaches the visit it was meant to be taken to. */

const contract = JSON.parse(readFileSync(new URL('../packages/catalog/wellbeing.json', import.meta.url), 'utf8')) as {
  habits: { id: string; name: string; prompt: string }[];
  refusals: { id: string; sentence: string }[];
  whatItIs: { statement: string; isNot: string };
  timeline: { statement: string };
  takingItToAClinician: { statement: string; howItWorks: string };
  capability: string;
};

const openLiveWell = async (page: Page) => {
  await page.goto('/');
  await goSection(page, 'Live well');
  await expect(page.getByRole('heading', { level: 1, name: 'In your own words' })).toBeVisible();
};
const write = async (page: Page, habit: string, words: string) => {
  await page.locator('.wb-habit').filter({ hasText: habit }).click();
  await page.locator('.wb-write textarea').fill(words);
  await page.getByRole('button', { name: 'Write this down' }).click();
};

test('every refusal the contract writes down is on the screen, word for word', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openLiveWell(page);
  /* All ten, not seven. Three of them are rendered at the place each one bites and the other seven
     together, so this checks the set and the arrangement: a refusal that quietly lost its place when
     somebody rearranged the page would still be in the file. */
  const main = page.locator('main');
  for (const refusal of contract.refusals) await expect(main).toContainText(refusal.sentence);
  const sentence = (id: string) => contract.refusals.find(r => r.id === id)!.sentence;
  await expect(page.locator('.wb-refusal')).toHaveCount(contract.refusals.length - 3);
  await expect(page.locator('.wb-standing')).toContainText(sentence('no-diagnosis'));
  await expect(page.locator('.wb-private')).toContainText(sentence('no-sharing-by-default'));
  await expect(page.locator('.wb-gap')).toContainText(sentence('no-punished-gap'));
  await expect(main).toContainText(contract.whatItIs.isNot);
  await expect(main).toContainText(contract.timeline.statement);
  /* It names clinical-records deliberately, and the notice is the contract's sentence rather than
     one this screen wrote: nothing typed here is stored. */
  await expect(page.locator('.not-connected')).toContainText(noticeFor(contract.capability));
  expect(errors).toEqual([]);
});

test('nothing on the screen is a figure, a unit or a field that takes one', async ({ page }) => {
  await openLiveWell(page);
  await write(page, 'Moving', 'Walked up the road to the taxi rank and back, slowly.');
  const main = page.locator('main');
  /* Nothing that collects a number. A spinner or a slider on this screen is a target with a
     different control on it. */
  await expect(main.locator('input[type="number"], input[type="range"]')).toHaveCount(0);
  /* And nothing that draws one. A chart of a body's week invites a line of best fit through
     somebody's life, which is the contract's own reason there is no chart here. */
  await expect(main.locator('canvas, svg.chart, .chart-card, .s-metric')).toHaveCount(0);
  let words = (await main.innerText()).replace(/ /g, ' ');
  expect(words).not.toMatch(/\d\s*(kg|km|steps?|kcal|cals?|bpm|hours|hrs|mins?)\b/i);
  expect(words).not.toContain('%');
  /* And then the strict version of the same thing: with the date a day is headed by and the time a
     note was written taken out, no digit is left anywhere on this screen. Both of those are about
     when somebody wrote something down, never about how much of anything they did. */
  for (const label of await page.locator('.wb-day > h3').allInnerTexts()) words = words.split(label).join('');
  expect(words.replace(/\b\d{1,2}:\d{2}\b/g, '')).not.toMatch(/\d/);
});

test('a day nothing was written is just a day', async ({ page }) => {
  await openLiveWell(page);
  const headings = page.locator('.wb-day > h3');
  /* The sample diary has something today, something yesterday and something three days ago. The day
     between the last two has nothing in it, and the record says nothing about it at all — no row,
     no outline, no count of what was missed. */
  await expect(headings).toHaveCount(3);
  await expect(headings.nth(0)).toHaveText('Today');
  await expect(headings.nth(1)).toHaveText('Yesterday');
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
    .toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  await expect(page.locator('main')).not.toContainText(twoDaysAgo);
  /* Nothing anywhere counts the run either. */
  await expect(page.locator('main')).not.toContainText(/in a row|consecutive|days running/i);
});

test('what you write goes to the top of your record, and can be taken back', async ({ page }) => {
  await openLiveWell(page);
  const entries = page.locator('.wb-entry');
  const before = await entries.count();
  /* The question above the field is the contract's, and it changes with the habit rather than one
     box asking one question about five different things. */
  await page.locator('.wb-habit').filter({ hasText: 'Sleeping' }).click();
  const sleeping = contract.habits.find(h => h.id === 'sleeping')!;
  await expect(page.locator('.wb-prompt')).toHaveText(sleeping.prompt);
  await write(page, 'Sleeping', 'Woke at the noise outside and could not get back off.');
  await expect(entries).toHaveCount(before + 1);
  await expect(entries.first()).toContainText('Woke at the noise outside');
  await expect(entries.first()).toContainText('Sleeping');
  /* Feedback that a control did something, and nothing about how the person is doing. */
  await expect(page.locator('.wb-said')).toHaveText('Written down. It is at the top of your record.');
  /* Somebody who cannot take back a sentence about their own body has been given a file rather than
     a diary — and emptying it leaves a record that says what is true rather than one that scolds. */
  while (await page.locator('.wb-remove').count()) await page.locator('.wb-remove').first().click();
  await expect(page.locator('.wb-day')).toHaveCount(0);
  await expect(page.locator('.empty-note')).toContainText('Nothing is written down yet');
  await expect(page.locator('main')).toContainText(contract.refusals.find(r => r.id === 'no-punished-gap')!.sentence);
});

test('it is brought to the visit rather than sent to one', async ({ page }) => {
  await openLiveWell(page);
  await write(page, 'Eating', 'The bread has been sitting badly since the weekend.');
  await expect(page.locator('.wb-bring')).toContainText(contract.takingItToAClinician.howItWorks);
  await page.locator('.wb-bring').getByRole('button', { name: /Open my next visit|Book a visit/ }).click();
  const visit = page.getByRole('dialog');
  await expect(visit.locator('.wb-brought')).toContainText('The bread has been sitting badly');
  /* The sentence that says how little happened: nothing is copied into the record until a clinician
     records it as part of the visit. */
  await expect(visit.locator('.wb-brought')).toContainText(contract.takingItToAClinician.howItWorks);
});

test('the screen reflows rather than scrolling sideways', async ({ page }, testInfo) => {
  await openLiveWell(page);
  /* Halving the viewport is how the accessibility suite emulates 200% zoom, and 320px is the floor
     the whole product is held to. Inside `main` as well as on the document: a box that scrolls
     vertically also scrolls horizontally, so an overflow can hide in a panel the page-level check
     cannot see. */
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(320, Math.round(size.width / 2)), height: size.height });
  const offenders = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main, main *')]
    .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
    .slice(0, 4).map(el => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : ''}`));
  expect(offenders).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/live-well-${testInfo.project.name}.png`, fullPage: true });
});
