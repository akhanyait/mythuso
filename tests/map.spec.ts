import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Streets, and what asking for them costs.
 *
 * The map used to draw a schematic because nobody had a Mapbox token, and the schematic was written
 * to be a complete answer rather than a wait for one. It still is. What changed is that there is now
 * a way to draw real roads with no account at all — MapLibre against an openly licensed endpoint —
 * and the moment that became possible, a question appeared that had never needed an answer: a tile
 * server sees the viewport of every map anybody opens.
 *
 * On a health product that is roughly which suburb a patient is in and roughly when somebody came to
 * her house. It is not a pin and it is not a name, but it is not nothing, and nobody had disclosed it
 * because until now nothing had been fetched. So this file asserts the three things that make the
 * feature honest rather than merely working:
 *
 *   1. Nothing is fetched until somebody asks. Streets are off on both screens that draw a map, the
 *      schematic is what a controller and a patient are handed, and opening either has told no tile
 *      server anything at all.
 *   2. The disclosure is on the screen, in the contract's words, beside the switch that causes it —
 *      before the press, not after. A sentence in a policy page is not a disclosure to somebody
 *      deciding on a map.
 *   3. When streets do not arrive — down, blocked, or a clinic's wifi answering with its own sign-in
 *      page — the map goes back to the schematic and says so. A dispatch board that shows a grey
 *      rectangle has taught its controller to distrust it at the moment they most need to believe it.
 *
 * The tile source is stubbed rather than contacted. A test that needs the internet to pass is a test
 * that fails for reasons that have nothing to do with the code, and what is worth asserting is which
 * host was asked and what was said about it — both of which a stub can see perfectly well. */

const geography = JSON.parse(readFileSync(new URL('../packages/catalog/geography.json', import.meta.url), 'utf8'));
const { source, tiles, unreachable, withoutTiles } = geography.rendering;

/* Everything the map could reach for. Wider than the contract's host on purpose: if the library is
   ever swapped back, or a second provider is added for fonts, this still sees it. */
const mapTraffic = /mapbox|maplibre|TileMap|openfreemap/i;

/* A style with a background and nothing else. It is enough for MapLibre to finish loading and put
   the zone layers on top of it, which is what these journeys are about; it is not enough to draw a
   road, which nothing here asserts because a canvas is not readable by a test. */
const STUB_STYLE = {
  version: 8,
  sources: {},
  glyphs: `${source.styleUrl.replace(/\/styles\/.*$/, '')}/fonts/{fontstack}/{range}.pbf`,
  layers: [{ id: 'stub-ground', type: 'background', paint: { 'background-color': '#eef1f4' } }]
};

/** Serve the tile source from here, and hand back every URL it was asked for. */
async function stubTiles(page: Page) {
  const asked: string[] = [];
  await page.route(`**${source.host}/**`, async (route: Route) => {
    const url = route.request().url();
    asked.push(url);
    if (url === source.styleUrl) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(STUB_STYLE) });
    /* Glyphs and anything else: an empty body. The labels do not draw, and nothing here reads them. */
    return route.fulfill({ contentType: 'application/x-protobuf', body: '' });
  });
  return asked;
}

const openTower = async (page: Page) => {
  await page.goto('/staff.html');
  await page.locator('.staff-signin-roles .record-row').filter({ has: page.getByText('Control Tower', { exact: true }) }).click();
  await expect(page.locator('.livemap')).toBeVisible();
};

/* Pinned to a morning in Johannesburg, for the same reason arrival.spec.ts is: the sample visit
   rolls to tomorrow after the last slot of the day, and a test whose result depends on when somebody
   ran it is the worst kind. */
const MORNING = new Date('2026-09-10T06:00:00Z');

const openArrival = async (page: Page) => {
  await page.clock.setFixedTime(MORNING);
  await page.goto('/');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: /^My visits/ }).click();
  else await page.locator('.tabbar button').nth(2).click();
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await expect(page.locator('.livemap')).toBeVisible();
};

const screens: [string, (page: Page) => Promise<void>][] = [['the Control Tower board', openTower], ['a patient’s arrival screen', openArrival]];

for (const [name, open] of screens) {
  test(`${name} draws no streets until somebody asks, and says what asking would cost`, async ({ page }) => {
    const asked: string[] = [];
    page.on('request', r => { if (mapTraffic.test(r.url())) asked.push(r.url()); });
    await open(page);

    /* The schematic, drawn from the contract's coordinates, with the pins on it. */
    await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
    await expect(page.locator('.map-pin').first()).toBeVisible();

    /* And the disclosure, word for word, before anything has been fetched. This is the assertion
       that would fail if somebody tidied the sentence off the layout to make room. */
    await expect(page.getByText(tiles.offSentence)).toBeVisible();

    const toggle = page.locator('.livemap-tiles').first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText(tiles.showLabel);

    expect(asked, `${name} fetched a map before anybody asked for one: ${asked.join(', ')}`).toEqual([]);
  });

  test(`${name} fetches streets only from the source the contract names, and credits it`, async ({ page }) => {
    const stubbed = await stubTiles(page);
    await open(page);

    await page.locator('.livemap-tiles').first().click();

    /* The library arrives, the map replaces the schematic, and the credit is on it. Attribution is a
       licence condition rather than a courtesy, so it is asserted as text a person can read at the
       size the type scale floors at — not merely as an element that exists. */
    await expect(page.locator('.livemap-canvas.schematic')).toHaveCount(0);
    const credit = page.locator('.livemap-credit').first();
    await expect(credit).toContainText(source.attribution);
    await expect(credit.locator('a')).toHaveAttribute('href', source.attributionUrl);
    const creditPx = await credit.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(creditPx, 'the tile credit is rendered below the floor of the type scale').toBeGreaterThanOrEqual(13);

    /* The sentence changes to the one about what has now happened, and says the choice is not kept. */
    await expect(page.getByText(tiles.onSentence)).toBeVisible();
    await expect(page.getByText(tiles.notRemembered)).toBeVisible();

    /* Real streets make the coverage claim bigger than the service, so the map says where phase one
       actually is at exactly the moment a reader could mistake the roads for the service area. */
    await expect(page.getByText(geography.coverage.sentence).first()).toBeVisible();

    /* Every request went to the host the contract names, and the style is the one it names too. A
       second host appearing here is a second party learning where this map is pointed. */
    expect(stubbed.length, 'no tile request was made after streets were switched on').toBeGreaterThan(0);
    expect(stubbed.includes(source.styleUrl), `the style fetched was not the contract's: ${stubbed[0]}`).toBe(true);
    for (const url of stubbed) expect(new URL(url).host, `a map request went somewhere the contract does not name: ${url}`).toBe(source.host);

    /* And off again, back to a picture that needs nobody. */
    await page.locator('.livemap-tiles').first().click();
    await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
    await expect(page.getByText(tiles.offSentence)).toBeVisible();
  });

  test(`${name} falls back to the schematic when the streets do not arrive`, async ({ page }) => {
    /* A captive portal, an endpoint over its limit, a network that went away between the press and
       the response. All three end here rather than at a blank rectangle. */
    await page.route(`**${source.host}/**`, route => route.abort());
    await open(page);
    await page.locator('.livemap-tiles').first().click();

    await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
    await expect(page.locator('.map-pin').first()).toBeVisible();
    await expect(page.getByText(unreachable.sentence)).toBeVisible();
    /* The switch goes back to off, so pressing it again is a retry rather than a dead control. */
    await expect(page.locator('.livemap-tiles').first()).toHaveAttribute('aria-pressed', 'false');
  });
}

/* A suburb name on the schematic is the one piece of text in this product whose size nothing on the
   page controls: it lives inside a 0–100 viewBox, so a font-size in the stylesheet is measured in
   viewBox units and multiplied by whatever the square is rendered at. Four units read as 11.4px at a
   320px viewport, and the type scale floors at 13. This measures what the screen actually shows —
   the declared size times the element's own transform — rather than what the stylesheet asked for,
   which is the number that was wrong. */
test('no map label renders below the floor of the type scale, at any width', async ({ page }) => {
  await openTower(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.map-label').first()).toBeVisible();
    const sizes = await page.locator('.map-label').evaluateAll(nodes => nodes.map(node => {
      const element = node as SVGTextElement;
      const scale = element.getScreenCTM()?.a ?? 1;
      return parseFloat(getComputedStyle(element).fontSize) * scale;
    }));
    for (const size of sizes) expect(size, `a suburb name renders at ${size.toFixed(1)}px at ${width}px wide`).toBeGreaterThanOrEqual(12.9);
  }
});

/* "A suburb, not a house" is a measurement, and this is the arithmetic behind it. One tile at the
   map's maximum zoom, at the latitude of the window centre, is the finest square a tile request can
   distinguish. The contract states it and the disclosure quotes it in kilometres; if somebody
   changes maxZoom, both stop being true at once and this is what notices. */
test('the square a tile request discloses is the one the contract says it is', async () => {
  const { maxZoom, centre } = geography.window;
  const metres = (40075016.686 * Math.cos((centre.lat * Math.PI) / 180)) / 2 ** maxZoom;
  expect(Math.round(metres), `one tile at zoom ${maxZoom} is ${metres.toFixed(0)} m, not ${tiles.squareMetres} m`)
    .toBe(geography.rendering.tiles.squareMetres);
  const km = `${(metres / 1000).toFixed(1)} km`;
  expect(tiles.onSentence, `the disclosure does not quote the ${km} a tile request actually covers`).toContain(km);
});

/* The page's Content-Security-Policy is the second place the tile origin is written down, and the
 * only one that is not this contract. It has to be: a policy is a header a browser reads before any
 * JavaScript runs, so it cannot be derived at runtime from a JSON file. That makes it the one copy
 * of the endpoint that could drift, and drift here does not look like a bug — it looks like the
 * streets quietly never arriving, on a screen designed to fall back to the schematic without
 * complaining. This is what notices.
 *
 * Only the two entries that draw a map. A patient's booking flow and the public landing page have no
 * business being allowed to reach a tile server, and a policy widened everywhere because one page
 * needed it is a policy that has stopped meaning anything. */
const origin = new URL(source.styleUrl).origin;

for (const entry of ['index.html', 'staff.html']) {
  test(`${entry} may reach the tile source the contract names, and nothing else new`, async () => {
    const html = readFileSync(new URL(`../apps/web/${entry}`, import.meta.url), 'utf8');
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    const connect = policy.split(';').map(part => part.trim()).find(part => part.startsWith('connect-src')) ?? '';
    expect(connect, `${entry} cannot reach ${origin}, so the streets will never arrive and the map will fall back without saying why`).toContain(origin);
    /* The worker MapLibre parses tiles in is served from this origin, not from a blob. Widening
       worker-src to blob: to accommodate a map would hand every script on the page the same door. */
    expect(policy, `${entry} allows workers from somewhere other than its own origin`).toContain("worker-src 'self'");
    expect(policy, `${entry} no longer restricts where scripts come from`).toContain("script-src 'self'");
  });
}

for (const entry of ['landing.html', 'admin.html', 'status.html']) {
  test(`${entry} draws no map, so it may not reach a tile server`, async () => {
    const html = readFileSync(new URL(`../apps/web/${entry}`, import.meta.url), 'utf8');
    expect(html, `${entry} has been given access to ${source.host} and has no map to draw with it`).not.toContain(source.host);
  });
}

/* The schematic is the fallback and it is also the only rendering two of the three apps have, so its
   sentence has to stand on its own without a switch beside it. It is not asserted on a screen here —
   no build in this repository switches tiles off entirely — but it is asserted to still exist and to
   still say the thing that stops somebody deleting it as a duplicate of the off sentence. */
test('the schematic still describes itself for a build with no tile source at all', async () => {
  expect(withoutTiles.sentence).toContain('coordinates alone');
  expect(withoutTiles.sentence).not.toBe(tiles.offSentence);
  expect(withoutTiles.why, 'the schematic has lost the reasoning that keeps it from being deleted').toBeTruthy();
});
