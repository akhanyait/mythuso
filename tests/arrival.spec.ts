import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Where is she now — the journey, and everything the answer refuses to claim.
 *
 * What is asserted here is not that a map draws. It is that the four things this screen must never
 * be read as saying are on it in words: that the figure is not an arrival time, that neither pin is
 * a house, that nothing draws where anybody has been, and that a patient sees a position on the day
 * of the visit and not before. Each of those is a sentence somebody could tidy off a layout, and
 * none of them fails a test by disappearing unless the test looks for it.
 *
 * And the bundle. `dispatch` is drawn for the Control Tower with mapbox-gl behind a dynamic import
 * so a nurse never downloads 1.8 MB of map she is not shown; giving the same picture to a patient is
 * exactly how that gets undone. The last test in this file is the one that would catch it. */

const geography = JSON.parse(readFileSync(new URL('../packages/catalog/geography.json', import.meta.url), 'utf8'));

const openVisits = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: /^My visits/ }).click(); return; }
  await page.locator('.tabbar button').nth(2).click();
};

/* Inside the scroll container as well as on the page: a box that scrolls vertically also scrolls
   sideways, and an overflow that hides in there is invisible to a check that measures the document. */
const noSidewaysScroll = async (page: Page) => page.evaluate(() =>
  [document.documentElement, ...document.querySelectorAll('main, dialog.modal, .workspace')]
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`));

const track = async (page: Page, index = 0) => {
  await openVisits(page);
  await page.getByRole('button', { name: 'Where is my nurse?' }).nth(index).click();
  await expect(page.getByRole('heading', { name: 'Where is your nurse?' })).toBeVisible();
};

test('the visit that is today says how far away she is, and what the figure is not', async ({ page }) => {
  await page.goto('/');
  await track(page);

  /* dispatch is not connected, so the contract's sentence is above everything. It is the first
     thing asserted because it is the first thing that would be tidied away. */
  await expect(page.getByText(/Dispatch is not connected/)).toBeVisible();

  /* The figure, with the chip saying what it is *above* it rather than a caveat underneath. A
     number that has to be qualified below is a number that gets quoted without the qualification. */
  const lead = page.locator('.arrival-lead');
  await expect(lead.locator('.s-metric').filter({ hasText: 'Straight line' })).toContainText('min');
  await expect(lead.locator('.s-metric').filter({ hasText: 'Suburb centres' })).toContainText('km');
  /* The basis, carrying the speed it was divided by. Neither number is typed on the screen — the
     distance is measured by packages/geo and the speed is URBAN_SPEED_KMH. */
  await expect(lead.getByText(/Measured in a straight line over [\d.]+ km at \d+ km\/h\. That is not a road route\./)).toBeVisible();

  /* Two marks and a dashed line between them, drawn from the coordinates with no tile server. The
     line is the caveat made visible: it goes through the buildings, because that is what a straight
     line does. */
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(2);
  await expect(page.locator('.map-straight')).toHaveCount(1);

  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('and it refuses, in words, everything a moving dot would otherwise be read as promising', async ({ page }) => {
  await page.goto('/');
  await track(page);
  const facts = page.locator('.arrival-facts');
  await expect(facts.getByText('It is not an arrival time')).toBeVisible();
  await expect(facts.getByText(/It is the distance between two suburbs, divided by a speed/)).toBeVisible();
  await expect(facts.getByText('Neither pin is a house', { exact: true })).toBeVisible();
  await expect(facts.getByText(/A nurse is drawn in the suburb she is working in/)).toBeVisible();
  /* Both of these are the geography contract's own sentences, rendered rather than paraphrased. */
  await expect(facts.getByText(geography.privacy.rules.find((r: { id: string }) => r.id === 'no-history-drawn').statement)).toBeVisible();
  await expect(facts.getByText(/MyThuso shows you where a nurse is on the day of your visit and not before/)).toBeVisible();
  await expect(page.getByText(/No nurse’s device is read, no arrival is timed against your window/)).toBeVisible();
});

test('a visit that is not today has no position on it at all, and says why', async ({ page }) => {
  await page.goto('/');
  await track(page, 1);
  /* The refusal that is the design: a patient can open this screen a fortnight early and gets her
     suburb, the name of the nurse and a sentence — not a nurse moving around Johannesburg. */
  await expect(page.getByText(/Nobody is on the way yet, so there is nothing to follow/)).toBeVisible();
  await expect(page.getByText(/A nurse’s whereabouts between visits is her own/)).toBeVisible();
  /* One mark, and it is the visit's own suburb. No nurse is drawn because none is on the way. */
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await expect(page.locator('.map-straight')).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('the arrival view never places a pin on an address', async ({ page }) => {
  await page.goto('/');
  await track(page);
  /* Every position on this screen is a zone centre out of the contract, at the precision the
     contract declares. The suburb names on the key are the proof a reader can see. */
  const key = page.locator('.map-key');
  const names: string[] = geography.zones.map((z: { name: string }) => z.name);
  const text = (await key.textContent()) ?? '';
  expect(names.some(name => text.includes(name)), `the map key names no zone from the contract: "${text}"`).toBe(true);
  await expect(page.getByText(geography.precision.sentence)).toBeVisible();
});

test('a patient watching a nurse downloads no map library to do it', async ({ page }) => {
  /* mapbox-gl is 1.8 MB behind a dynamic import so that a nurse never fetches a map she is not
     shown. Handing the same picture to the patient audience is precisely how that gets undone, and
     this watches the network rather than the bundle report because what matters is what the handset
     actually asks for. */
  const asked: string[] = [];
  page.on('request', r => { if (/mapbox|TileMap/i.test(r.url())) asked.push(r.url()); });
  await page.goto('/');
  await track(page);
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  expect(asked, `a patient's arrival screen fetched the map bundle: ${asked.join(', ')}`).toEqual([]);
});
