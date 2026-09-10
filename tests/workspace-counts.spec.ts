import { test, expect, type Page, type Locator } from '@playwright/test';
import { goSection, openWorkspace } from './nav';

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
 * The web only. Playwright drives the web app, and iOS and Android are held by the source check
 * alone — which is worth saying plainly rather than leaving a reader to assume all three are covered.
 */

const strip = (page: Page, label: string): Locator =>
  page.locator('.s-metric').filter({ has: page.locator('.s-metric-label', { hasText: new RegExp(`^${label}$`) }) }).first();

/** The figure itself, without the R or the unit the surface draws beside it. */
async function figure(page: Page, label: string): Promise<number> {
  const value = strip(page, label).locator('.s-metric-value');
  await expect(value).toBeVisible();
  const text = (await value.textContent()) ?? '';
  const digits = text.replace(/[^\d]/g, '');
  expect(digits, `the metric "${label}" renders "${text}", which carries no figure`).not.toBe('');
  return Number(digits);
}

/** The chip above it — "2 critical", "4 off duty" — as the number it leads with. */
async function chipFigure(page: Page, label: string): Promise<number> {
  const chip = strip(page, label).locator('.s-metric-chip');
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

  test('the incident figure and its chip both agree with the incident list', async ({ page }) => {
    await openWorkspace(page, 'Control Tower');
    await goSection(page, 'Incidents');

    const incidents = page.locator('.record-row').filter({ hasText: /INC-\d+/ });
    await expect(incidents.first()).toBeVisible();
    const open = await incidents.count();
    expect(open).toBeGreaterThan(1);
    expect(await figure(page, 'Open incidents')).toBe(open);

    /* The chip is where the fourth lie lived: "1 severity high" over a list whose worst entry was
       Critical. So the chip is read as well as the figure, and the board is asked how many of its
       rows carry the severity the chip names. */
    const chip = (await strip(page, 'Open incidents').locator('.s-metric-chip').textContent()) ?? '';
    const severity = chip.replace(/[\d\s]/g, '');
    /* The severity as the row writes it — leading the "Critical · Parktown · Opened 10:31" line —
       rather than as a bare word. A row's strong and its small are concatenated with no space
       between them in the accessible text, so a word boundary in front of it never matches. */
    const matching = incidents.filter({ hasText: new RegExp(`${severity}\\s*·`, 'i') });
    expect(await chipFigure(page, 'Open incidents'), `the chip says "${chip}" over a board with a different number of ${severity} incidents`)
      .toBe(await matching.count());
  });

  test("a partner's orders, collections and releases are counted off their own boards", async ({ page }) => {
    await openWorkspace(page, 'Partner');
    /* Orders lands first, and the strip above it said eight over a queue of four before the boards
       started counting. The chip beside it counts something the reader cannot see from here — the
       collections past their window, which are on the next section — so only the figure is held. */
    const orders = page.locator('.record-row').filter({ hasText: /^(RX|LAB)-\d+/ });
    await expect(orders.first()).toBeVisible();
    const open = await orders.count();
    expect(open).toBeGreaterThan(1);
    expect(await figure(page, 'Open orders')).toBe(open);

    await goSection(page, 'Collections');
    const collections = page.locator('.record-row').filter({ hasText: /COL-\d+/ });
    await expect(collections.first()).toBeVisible();
    const booked = await collections.count();
    expect(booked).toBeGreaterThan(1);
    expect(await figure(page, 'Collections')).toBe(booked);

    /* What is ready to go to a patient, which is the figure on this board somebody acts on. A result
       still on the bench is on the same list and must not be in the count. */
    await goSection(page, 'Results');
    const results = page.locator('.record-row').filter({ hasText: /LAB-\d+/ });
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThan(1);
    expect(await figure(page, 'Ready for release')).toBe(
      await results.filter({ hasText: /Verified by the laboratory/ }).count()
    );
  });
});
