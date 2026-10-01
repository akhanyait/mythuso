import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* A result ready for release is one whose reference came back, in medicines.json's words (2 October 2026). */
const medicines = JSON.parse(readFileSync(new URL('../packages/catalog/medicines.json', import.meta.url), 'utf8'));

/* The figure at the top of a workspace, against the rows underneath it.
 *
 * A sweep found four figures that contradicted the screen they were drawn on: "Active visits 24"
 * over a dispatch board holding three, "Available nurses 18" over seven, "1 severity high" over an
 * incident list whose worst entry was Critical, and a doctor's queue saying twelve where three were
 * waiting. Every one of them was typed beside a list that could have counted it.
 *
 * scripts/check-boundaries.mjs holds the half of that which can be decided from the source: no
 * literal digit in a workspace's metric strip on any of the three platforms. What it cannot decide
 * is whether a *counted* figure counts the right rows — String(nurses.count) over a list of jobs is
 * a lie a source check reads as arithmetic. That is what this does, in a browser, on both viewports:
 * read the figure the strip renders, count what the board actually draws, and compare the two.
 *
 * It is deliberately not a snapshot of the numbers. Asserting "Visits on the board is 3" would go
 * red the day somebody adds a fourth fictional visit — which is a change to the demo data and not a
 * defect — and a test that cries wolf at correct work is a test somebody deletes. What is asserted
 * is that the two agree, which is the property that was broken. The one number written down here is
 * that there is more than one row on each board: a count that matched because both sides were nought
 * would have proved nothing at all.
 *
 * Three of the strips are gone rather than fixed. A nurse's schedule, a doctor's queue and a
 * partner's orders open into the clinical workbench now, and a row of summary tiles over the work
 * somebody signed in to do is the dashboard a clinician was asked not to be shown. Where a figure
 * survived on those screens it survived by moving into the line above the rows it counts, and that
 * is what is read here instead — the same property, in the place the figure now lives.
 *
 * The web only. Playwright drives the web app, and iOS and Android are held by the source check
 * alone — which is worth saying plainly rather than leaving a reader to assume all three are covered.
 */

/* A figure is the office identity's MetricCard since 28 September 2026 (oi-figure, ui-metric__label and
   ui-metric__value); the older strips still draw s-metric. The property read is the same either way. */
const strip = (page: Page, label: string): Locator =>
  page.locator(':is(.s-metric, .oi-figure)').filter({ has: page.locator(':is(.s-metric-label, .ui-metric__label)', { hasText: new RegExp(`^${label}$`) }) }).first();

/** The figure itself, without the R or the unit the surface draws beside it. */
async function figure(page: Page, label: string): Promise<number> {
  const value = strip(page, label).locator(':is(.s-metric-value, .ui-metric__value)');
  await expect(value).toBeVisible();
  const text = (await value.textContent()) ?? '';
  const digits = text.replace(/[^\d]/g, '');
  expect(digits, `the metric "${label}" renders "${text}", which carries no figure`).not.toBe('');
  return Number(digits);
}

/** The chip above it — "2 critical", "4 off duty" — as the number it leads with. */
async function chipFigure(page: Page, label: string): Promise<number> {
  const chip = strip(page, label).locator(':is(.s-metric-chip, .oi-figure__note)');
  await expect(chip).toBeVisible();
  const text = (await chip.textContent()) ?? '';
  const match = text.match(/\d+/);
  expect(match, `the chip on "${label}" reads "${text}", which carries no figure`).not.toBeNull();
  return Number(match![0]);
}

test.describe('a workspace figure agrees with the rows beneath it', () => {
  test('the Control Tower counts its board rather than describing it', async ({ page }) => {
    await openWorkspace(page, 'Control Tower');
    await goSection(page, 'Dispatch');

    /* Every visit on the board is a button in the group the board labels for a screen reader, so
       what is counted here is the same set the operator can press. */
    const jobs = page.getByRole('group', { name: 'Visits on the board' }).getByRole('button');
    await expect(jobs.first()).toBeVisible();
    const onTheBoard = await jobs.count();
    expect(onTheBoard).toBeGreaterThan(1);
    expect(await figure(page, 'Visits on the board')).toBe(onTheBoard);

    /* The nurses the board offers: everybody not off duty, refused ones included — a nurse blocked
       by vetting is on duty and on the screen, and a figure that quietly dropped her would disagree
       with the list for a reason nobody could see. */
    const nurses = page.locator('.dispatch-grid .record-row.static');
    await expect(nurses.first()).toBeVisible();
    const onDuty = await nurses.count();
    expect(onDuty).toBeGreaterThan(1);
    expect(await figure(page, 'Nurses on duty')).toBe(onDuty);
  });

  test("the doctor's queue heads itself with the number of rows it is heading", async ({ page }) => {
    /* This section lost its strip with the rest of the clinical dashboards, and two of the three
       figures on it were invented rather than counted — "18 reviewed today", "Median 4 m 10 s".
       What replaced them is one line above the queue, and the reason it is allowed to carry a
       figure at all is that the queue is directly underneath it. So the same rule applies: read the
       claim, count the rows, compare. */
    await openWorkspace(page, 'Doctor');
    const rows = page.locator('.review-row');
    await expect(rows.first()).toBeVisible();
    const waiting = await rows.count();
    expect(waiting).toBeGreaterThan(1);
    const head = (await page.locator('.iq-worklist .shift-head p').textContent()) ?? '';
    expect(Number(head.match(/(\d+) waiting/)?.[1]), `the queue head reads "${head}"`).toBe(waiting);

    /* And it keeps saying the truth when the filter narrows what is on the screen. */
    await page.locator('.queue-filter').getByRole('button', { name: 'Flagged' }).click();
    await expect(rows).not.toHaveCount(waiting);
    const flagged = await rows.count();
    expect(flagged).toBeLessThan(waiting);
    const narrowed = (await page.locator('.iq-worklist .shift-head p').textContent()) ?? '';
    expect(Number(narrowed.match(/(\d+) waiting/)?.[1]), `the filtered head reads "${narrowed}"`).toBe(flagged);
  });

  test('the incident figure and its chip both agree with the incident list', async ({ page }) => {
    await openWorkspace(page, 'Control Tower');
    await goSection(page, 'Incidents');

    /* Incident rows are the office identity's rows since 28 September 2026 (oi-incident). */
    const incidents = page.locator('.oi-incident').filter({ hasText: /INC-\d+/ });
    await expect(incidents.first()).toBeVisible();
    const open = await incidents.count();
    expect(open).toBeGreaterThan(1);
    expect(await figure(page, 'Open incidents')).toBe(open);

    /* The chip is where the fourth lie lived: "1 severity high" over a list whose worst entry was
       Critical. So the chip is read as well as the figure, and the board is asked how many of its
       rows carry the severity the chip names. */
    const chip = (await strip(page, 'Open incidents').locator(':is(.s-metric-chip, .oi-figure__note)').textContent()) ?? '';
    const severity = chip.replace(/[\d\s]/g, '');
    /* The severity is a column of its own on the row now, rather than the first word of a run-on
       sentence, so it is read out of that column. Matching it inside the row's whole accessible text
       was always fragile — a board that happened to mention "critical" in a title would have counted
       itself — and it stopped matching at all when the row stopped writing "Critical ·". */
    /* On the office identity's rows the severity is the Badge in the row's aside (28 September 2026). */
    const matching = incidents.filter({ has: page.locator(':is(.incident-sev, .oi-row__aside)', { hasText: new RegExp(`^\\s*${severity}\\s*$`, 'i') }) });
    expect(await chipFigure(page, 'Open incidents'), `the chip says "${chip}" over a board with a different number of ${severity} incidents`)
      .toBe(await matching.count());
  });

  test("a partner's orders, collections and releases are counted off their own boards", async ({ page }) => {
    await openWorkspace(page, 'Partner');
    /* Orders lands first, and the strip above it said eight over a queue of four before the boards
       started counting. There is no strip on this section at all now — it opens into the clinical
       workbench, with the two order groups folded into the top of it — so what is read here is the
       figure the board still carries: the count in each group's own heading, "Prescriptions · 2",
       against the rows under that heading. It is the same property in a smaller place. */
    /* The two groups stand in the master column of Orders' master and detail since 30 September 2026. */
    const groups = page.locator('.iq-worklist section.fulfil-group');
    await expect(groups.first()).toBeVisible();
    expect(await groups.count()).toBeGreaterThan(1);
    for (const group of await groups.all()) {
      const heading = (await group.locator('.section-title h2').textContent()) ?? '';
      const claimed = Number(heading.match(/\d+/)?.[0]);
      expect(claimed, `the heading "${heading}" carries no figure`).not.toBeNaN();
      expect(claimed, `"${heading}" heads a different number of rows`)
        .toBe(await group.locator('.fulfil-row').count());
    }

    await goSection(page, 'Collections');
    const collections = page.locator('.fulfil-row').filter({ hasText: /COL-\d+/ });
    await expect(collections.first()).toBeVisible();
    const booked = await collections.count();
    expect(booked).toBeGreaterThan(1);
    expect(await figure(page, 'Collections')).toBe(booked);

    /* What is ready to go to a patient, which is the figure on this board somebody acts on. A result
       still on the bench is on the same list and must not be in the count. */
    await goSection(page, 'Results');
    const results = page.locator('.fulfil-row').filter({ hasText: /LAB-\d+/ });
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThan(1);
    expect(await figure(page, 'Ready for release')).toBe(
      /* By the state column: every row's track names the step too, so the row's text would count all three. */
      await results.filter({ has: page.locator('.fulfil-state', { hasText: medicines.screen.results.returned }) }).count()
    );
  });
});

/* The two clinical strips, restored. Each figure is read off the strip and counted off the rows
   under it — the doctor's queue and the nurse's day are both lists on the same screen, so a strip
   that disagrees with them is disprovable by a reader who simply looks down. */
test("the doctor's strip counts the queue it sits above", async ({ page }) => {
 await openWorkspace(page, 'Doctor');
 await goSection(page, 'Review queue');
 const rows = page.locator('.review-list > *');
 const rowCount = await rows.count();
 expect(rowCount).toBeGreaterThan(1);
 await expect(page.locator('.s-metric', { hasText: 'Awaiting review' })).toContainText(String(rowCount));
 /* And the ring around that figure is the same queue: one arc per row, and the lit arcs are the rows
    carrying the badge. A drawing that disagreed with the list would be a typed figure in a nicer
    coat — disprovable by looking down the screen, which is the whole defect this file exists for. */
 await expect(page.locator('.c-deck .c-ring .c-mark')).toHaveCount(rowCount);
 /* Out of range is a badge on the row, so the strip's figure and the badges are two renderings of
    one fact and have to agree. */
 const flagged = await page.locator('.review-list').getByText('Out of range').count();
 await expect(page.locator('.s-metric', { hasText: 'Priority reviews' })).toContainText(String(flagged));
 await expect(page.locator('.c-deck .c-ring .c-mark.on')).toHaveCount(flagged);
 /* One bar per row on the wait instrument, and one on each row of the queue itself. */
 await expect(page.locator('.c-deck .c-waits > i')).toHaveCount(rowCount);
 await expect(page.locator('.review-list .review-pressure')).toHaveCount(rowCount);
 /* The longest wait has to be a wait that is on the queue, rather than a figure of its own.
    The figure itself, and not the whole of the metric — which is the same narrowing the nurse's
    assertion below already made, for the same reason, and this one was left behind. The instrument
    round this figure is the queue drawn as one bar per row, and each bar now carries the reference
    of the row it is, so the metric's own text runs "…TH-2045" straight into "3 h 20 m" and the
    pattern below happily read "20453 h 20 m" out of the join. Nothing about the property changed:
    the numeral the strip states still has to be a wait a row on the queue states too. */
 const longest = (await page.locator('.s-metric', { hasText: 'Longest wait' }).locator('.s-metric-value').textContent()) ?? '';
 const stated = longest.match(/\d+\s*h\s*\d+\s*m|\d+\s*m/)?.[0];
 expect(stated).toBeTruthy();
 const rowText = (await rows.allTextContents()).join(' ').replace(/\s+/g, ' ');
 expect(rowText).toContain(stated as string);
});

test("the nurse's strip counts the day it sits above", async ({ page }) => {
 await openWorkspace(page, 'Nurse');
 await goSection(page, 'Schedule');
 /* The figure itself, rather than the whole of the metric. It used to read the metric's text and
    take the first number in it, which on this strip was the *chip* — "3 to sign off" — and agreed
    with the visit count by luck. The strip is a deck of instruments now and each figure carries a
    drawing with a scale on it, so reading the whole block would have taken a number off the axis.
    Narrower, and it asserts the thing it always meant to: the numeral, against the rows. */
 const figure = (label: string) =>
  page.locator('.s-metric').filter({ hasText: label }).locator('.s-metric-value');
 /* The next visit on the strip is a visit on the day below it, not a second opinion about it — and
    the line under the date says the same time, because both are the same `find` over the same rows.
    Which visit that is is asserted below, where it can be made to change. */
 const next = (await figure('Next visit').textContent()) ?? '';
 const time = next.match(/\d{2}:\d{2}/)?.[0];
 expect(time, `the next-visit figure reads "${next}"`).toBeTruthy();
 await expect(page.locator('.shift-head').first()).toContainText(time as string);
 /* Today's visits counts the day: the one being worked, plus the ones still to come. */
 const later = await page.locator('.day-list > *').count();
 const visits = (await figure('Today’s visits').textContent()) ?? '';
 expect(Number(visits.match(/\b(\d+)\b/)?.[1]), `the visits figure reads "${visits}"`).toBe(later + 1);
 /* And the deck's drawing is the same day: one block per visit, the same count as the numeral. */
 await expect(page.locator('.c-deck .c-day > i')).toHaveCount(later + 1);
});

/* NEXT MEANS THE NEXT ONE NOT YET SIGNED OFF.
 *
 * `nurseDayCounts().nextStart` returned nurseDay[0].start whatever had happened to it, so a nurse
 * who signed her nine o'clock off at twenty to ten was still told by the deck at the top of the
 * screen, and by the line under the date, that her next visit was at nine — while the drawing
 * beside both of them had already turned that block to paper. It is the same class of defect as a
 * typed figure: a claim at the top of a screen that the rows underneath disprove. The arithmetic
 * was being done correctly and then thrown away.
 *
 * This is the regression, and it is deliberately written as "both readings move, together, to a
 * time that is on the board" rather than as "the strip says 11:30". Asserting the literal would go
 * red the day somebody moves a fictional visit, which is a change to the demo data and not a
 * defect — the second time is read off the row it belongs to, the same way every other figure in
 * this file is counted off what is actually drawn.
 *
 * The end of a day, where nothing is next at all, is not reachable from the browser: only the first
 * visit of the three has an assessment flow behind it, so two of them cannot be signed off here.
 * The shape it takes is in apps/web/src/shells/StaffShell.tsx's metricsOf and in the schedule's own
 * standing line, and it is held by neither this file nor the source check. That is a gap, and it is
 * written down rather than left to be discovered. */
test("the nurse's next visit is the next one she has not signed off", async ({ page }) => {
 test.setTimeout(60_000);
 await openWorkspace(page, 'Nurse');
 const deckNext = page.locator('.s-metric').filter({ hasText: 'Next visit' }).locator('.s-metric-value');
 const head = page.locator('.shift-head p').first();
 const first = ((await deckNext.textContent()) ?? '').match(/\d{2}:\d{2}/)?.[0];
 expect(first, 'the deck carries no next-visit time to begin with').toBeTruthy();
 await expect(head).toContainText(first as string);
 await expect(page.locator('.next-visit .next-when')).toContainText(first as string);

 /* What next has to become: the start of the first visit still on the rail below the card. */
 const second = ((await page.locator('.day-list .day-row .day-time strong').first().textContent()) ?? '').trim();
 expect(second, `the day below the card starts at "${second}", which is the same visit the card is`).not.toBe(first);

 await page.getByRole('button', { name: 'Start this visit' }).click();
 const d = page.getByRole('dialog');
 await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
 await d.getByRole('checkbox').first().check();
 await d.getByRole('button', { name: 'Confirm identity' }).click();
 await d.getByRole('checkbox').first().check();
 await d.getByRole('button', { name: 'Start observations' }).click();
 await d.getByLabel('Blood pressure — systolic').fill('132');
 await d.getByRole('button', { name: 'Record findings' }).click();
 await d.getByLabel('Next step').selectOption('Refer for doctor review today');
 await d.getByRole('button', { name: 'Review sign-off' }).click();
 await d.getByRole('button', { name: 'Sign assessment' }).click();
 await d.getByRole('button', { name: /Back to the workspace/ }).click();

 /* Both readings move, and they move to the same visit — which is the one the rail now marks. */
 await expect(deckNext).toContainText(second);
 await expect(head).toContainText(`${second} to`);
 await expect(head).not.toContainText(first as string);
 await expect(page.locator('.day-row.is-next')).toContainText(second);
 /* And the drawing the figure sits on says one of the three is done, which it did before the
    numeral beside it agreed with it. */
 await expect(page.locator('.c-deck .c-day > i.done')).toHaveCount(1);
});
