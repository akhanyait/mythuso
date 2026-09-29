import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openWorkspace } from './nav';
import { isMapboxHost, mapboxRequests, resolveMapboxUrl } from '../apps/web/src/map/mapboxRequests';

/* Streets, and what asking for them costs — and, since 29 September 2026, who is asked and where the
 * switch starts.
 *
 * The map used to draw a schematic because nobody had a Mapbox token, and the schematic was written
 * to be a complete answer rather than a wait for one. It still is. What changed first is that there
 * is a way to draw real roads with no account at all — MapLibre against an openly licensed endpoint —
 * and the moment that became possible, a question appeared that had never needed an answer: a tile
 * server sees the viewport of every map anybody opens. On a health product that is roughly which
 * suburb a patient is in and roughly when somebody came to her house.
 *
 * What changed second is the founder's ask: the streets he had never seen should show, and the
 * Mapbox wiring should work. So the switch now starts where the surface says. A dispatch board and a
 * care visit are workspaces whose job is where people are, and a nurse or a controller asked for the
 * map by opening one; a patient's arrival map still asks first, because the request discloses her
 * viewport and a default nobody chose is not consent. And Mapbox is a provider a build may choose by
 * token — never by edit, never with a value in this repository — with its own credit under the map.
 *
 * So this file asserts the things that make the feature honest rather than merely working:
 *
 *   1. A staff surface opens with streets on: the tile chunk is fetched, the switch reads "Hide
 *      streets", the disclosure is on the screen in the contract's words, and off is one press away.
 *   2. A patient's surface fetches nothing until she asks, and says what asking would cost before the
 *      press, not after.
 *   3. With no token — every test, every fork, the repository as it ships — the source is OpenFreeMap
 *      and the credit says so; and the request rewriter that would make Mapbox work is held to its
 *      rules without a token and without a browser.
 *   4. When streets do not arrive the map goes back to the schematic and says so.
 *
 * The tile source is stubbed rather than contacted. A test that needs the internet to pass is a test
 * that fails for reasons that have nothing to do with the code, and what is worth asserting is which
 * host was asked and what was said about it — both of which a stub can see perfectly well. */

const geography = JSON.parse(readFileSync(new URL('../packages/catalog/geography.json', import.meta.url), 'utf8'));
const providers = JSON.parse(readFileSync(new URL('../packages/catalog/map-providers.json', import.meta.url), 'utf8'));
const { source, tiles, unreachable, withoutTiles } = geography.rendering;
/* The sentences say {provider}; with no token the provider is the default, and the web says so. */
const say = (sentence: string) => sentence.replace('{provider}', source.name);

/* Everything the map could reach for. Wider than the contract's host on purpose: if the library is
   ever swapped back, or a second provider is added for fonts, this still sees it. */
const mapTraffic = /mapbox|maplibre|TileMap|openfreemap/i;
/* The chunk itself, as the dev server serves it: the one request a staff surface makes on opening. */
const tileChunk = /\/src\/map\/TileMap\.tsx/;

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
  await page.goto('/app/?role=control-tower');
  await expect(page.locator('.livemap')).toBeVisible();
};

/* The nurse's care visit: her offer accepted and the visit opened, which is where her map is. */
const openCareVisit = async (page: Page) => {
  await openWorkspace(page, 'Nurse');
  await page.locator('.care-offer').getByRole('button', { name: 'Accept this visit' }).click();
  await page.locator('.care-slot').getByRole('button', { name: 'Continue this visit' }).click();
  await expect(page.getByRole('dialog').locator('.livemap')).toBeVisible();
};

/* Pinned to a morning in Johannesburg, for the same reason arrival.spec.ts is: the sample visit
   rolls to tomorrow after the last slot of the day, and a test whose result depends on when somebody
   ran it is the worst kind. */
const MORNING = new Date('2026-09-10T06:00:00Z');

const openArrival = async (page: Page) => {
  await page.clock.setFixedTime(MORNING);
  await page.goto('/app/');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: /^My visits/ }).click();
  else await page.locator('.tabbar button').nth(2).click();
  await page.getByRole('button', { name: 'Where is my nurse?' }).first().click();
  await expect(page.locator('.livemap')).toBeVisible();
};

test('the main-site dashboard offers touch-sized map controls and resets the view', async ({ page }) => {
  const asked = await stubTiles(page);
  await page.goto('/?role=control-tower');
  await expect(page.locator('.livemap')).toBeVisible();
  /* A staff surface: streets are on from the start, so the controls are there without a press. */
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  const reset = page.getByRole('button', { name: 'Reset view', exact: true });
  await expect(reset).toBeVisible();
  await expect(page.locator('.livemap-credit')).toBeVisible();
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  const target = await zoom.boundingBox();
  expect(target!.width).toBeGreaterThanOrEqual(44);
  expect(target!.height).toBeGreaterThanOrEqual(44);
  const marker = page.locator('.map-marker').first();
  const markerBox = await marker.boundingBox();
  expect(markerBox!.width, 'a pin on streets is a 44-pixel target').toBeGreaterThanOrEqual(44);
  expect(markerBox!.height).toBeGreaterThanOrEqual(44);
  // Reset after the initial load has fitted the service area, then move the camera.
  await reset.click();
  const before = await marker.boundingBox();
  await zoom.click();
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - before!.x)).toBeGreaterThan(2);
  await reset.click();
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - before!.x)).toBeLessThan(2);
});

/* ---- Staff surfaces: on from the start, and off one press away --------------------------------- */

const staff: [string, (page: Page) => Promise<void>][] = [['the Control Tower board', openTower], ['a nurse’s care visit', openCareVisit]];

for (const [name, open] of staff) {
  test(`${name} opens with streets on, says so, and credits the source that drew`, async ({ page }) => {
    const stubbed = await stubTiles(page);
    const asked: string[] = [];
    page.on('request', r => { if (mapTraffic.test(r.url())) asked.push(r.url()); });
    await open(page);

    /* The switch is already on, and reads as the control that turns them off. */
    const toggle = page.locator('.livemap-tiles').first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText(tiles.hideLabel);

    /* The chunk was fetched because this screen opened, not because somebody pressed. */
    await expect.poll(() => asked.some(url => tileChunk.test(url)), `${name} did not fetch the tile chunk on opening`).toBe(true);
    await expect(page.locator('.livemap-canvas.schematic')).toHaveCount(0);

    /* The disclosure, word for word, naming the source, beside the switch; and why it started on. */
    await expect(page.getByText(say(tiles.onSentence)).first()).toBeVisible();
    await expect(page.getByText(tiles.startedOnSentence).first()).toBeVisible();
    await expect(page.getByText(geography.coverage.sentence).first()).toBeVisible();

    /* With no token the source is OpenFreeMap, and the credit is its wording, at the type scale's
       floor, as a link a reader can follow to the licence. */
    const credit = page.locator('.livemap-credit').first();
    await expect(credit).toContainText(source.attribution);
    await expect(credit).toContainText('OpenFreeMap');
    await expect(credit.locator('a')).toHaveAttribute('href', source.attributionUrl);
    expect(await credit.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);

    /* Every request went to the host the contract names, and the style is the one it names too. A
       second host appearing here is a second party learning where this map is pointed. */
    expect(stubbed.length, 'no tile request was made although streets started on').toBeGreaterThan(0);
    expect(stubbed.includes(source.styleUrl), `the style fetched was not the contract's: ${stubbed[0]}`).toBe(true);
    for (const url of stubbed) expect(new URL(url).host, `a map request went somewhere the contract does not name: ${url}`).toBe(source.host);
    for (const url of asked) expect(/mapbox\.com/.test(url), `a build with no token asked Mapbox for something: ${url}`).toBe(false);

    /* Off is one press away, back to a picture that needs nobody, and the choice is not kept. */
    const before = stubbed.length;
    await toggle.click();
    await expect(page.locator('.livemap-canvas.schematic').first()).toBeVisible();
    await expect(page.locator('.map-pin').first()).toBeVisible();
    await expect(page.getByText(say(tiles.offSentence)).first()).toBeVisible();
    await expect(page.getByText(tiles.notRememberedOn).first()).toBeVisible();
    await expect(page.locator('.livemap-credit')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(stubbed.length, 'the schematic asked the tile server for something').toBe(before);
  });

  test(`${name} falls back to the schematic when the streets do not arrive`, async ({ page }) => {
    /* A captive portal, an endpoint over its limit, a network that went away. All three end here
       rather than at a blank rectangle — and on a staff surface it happens on opening, with no press. */
    await page.route(`**${source.host}/**`, route => route.abort());
    await open(page);

    await expect(page.locator('.livemap-canvas.schematic').first()).toBeVisible();
    await expect(page.locator('.map-pin').first()).toBeVisible();
    await expect(page.getByText(unreachable.sentence).first()).toBeVisible();
    /* The switch goes back to off, so pressing it again is a retry rather than a dead control. */
    await expect(page.locator('.livemap-tiles').first()).toHaveAttribute('aria-pressed', 'false');
  });
}

/* ---- The patient's surface: nothing until she asks --------------------------------------------- */

test('a patient’s arrival screen draws no streets until she asks, and says what asking would cost', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', r => { if (mapTraffic.test(r.url())) asked.push(r.url()); });
  await openArrival(page);

  /* The schematic, drawn from the contract's coordinates, with the pins on it. */
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.locator('.map-pin').first()).toBeVisible();

  /* And the disclosure, word for word, before anything has been fetched. This is the assertion
     that would fail if somebody tidied the sentence off the layout to make room. */
  await expect(page.getByText(say(tiles.offSentence))).toBeVisible();

  const toggle = page.locator('.livemap-tiles').first();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText(tiles.showLabel);
  /* Nothing about why streets started on, because on this screen they did not. */
  await expect(page.getByText(tiles.startedOnSentence)).toHaveCount(0);

  expect(asked, `the arrival screen fetched a map before anybody asked for one: ${asked.join(', ')}`).toEqual([]);
});

test('a patient’s arrival screen fetches streets only from the source the contract names, and credits it', async ({ page }) => {
  const stubbed = await stubTiles(page);
  await openArrival(page);

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
  await expect(page.getByText(say(tiles.onSentence))).toBeVisible();
  await expect(page.getByText(tiles.notRemembered)).toBeVisible();

  /* Real streets make the coverage claim bigger than the service, so the map says where phase one
     actually is at exactly the moment a reader could mistake the roads for the service area. */
  await expect(page.getByText(geography.coverage.sentence).first()).toBeVisible();

  expect(stubbed.length, 'no tile request was made after streets were switched on').toBeGreaterThan(0);
  expect(stubbed.includes(source.styleUrl), `the style fetched was not the contract's: ${stubbed[0]}`).toBe(true);
  for (const url of stubbed) expect(new URL(url).host, `a map request went somewhere the contract does not name: ${url}`).toBe(source.host);

  /* And off again, back to a picture that needs nobody. */
  await page.locator('.livemap-tiles').first().click();
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.getByText(say(tiles.offSentence))).toBeVisible();
});

test('a patient’s arrival screen falls back to the schematic when the streets do not arrive', async ({ page }) => {
  await page.route(`**${source.host}/**`, route => route.abort());
  await openArrival(page);
  await page.locator('.livemap-tiles').first().click();

  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.locator('.map-pin').first()).toBeVisible();
  await expect(page.getByText(unreachable.sentence)).toBeVisible();
  await expect(page.locator('.livemap-tiles').first()).toHaveAttribute('aria-pressed', 'false');
});

/* ---- The contract's two defaults, and the two providers ---------------------------------------- */

test('the contract starts streets on for staff, off for a patient, and off for anyone who does not say', async () => {
  expect(tiles.defaultBySurface).toEqual({ staff: 'on', patient: 'off' });
  expect(tiles.default).toBe('off');
  expect(tiles.whyBySurface, 'turning streets on for anybody is an edit that has to be justified in the contract').toBeTruthy();
  for (const sentence of [tiles.onSentence, tiles.offSentence]) expect(sentence).toContain('{provider}');
});

/* Mapbox is chosen by a token that no test has and no fork has, so what can be asserted about it is
   the part that does not need one: the rewriting that makes a Mapbox style load in MapLibre at all,
   and the rule that the token is appended to Mapbox's two host families and to nothing else. */
test('a Mapbox style’s mapbox:// names become api.mapbox.com requests, with the token, and nothing else gets it', async () => {
  const mapbox = providers.providers.find((p: { id: string }) => p.id === 'mapbox-streets-v12');
  expect(mapbox, 'the Mapbox entry is in packages/catalog/map-providers.json').toBeTruthy();
  expect(mapbox.styleUrl.startsWith('https://api.mapbox.com/'), 'MapLibre does not load a mapbox:// style URL').toBe(true);
  expect(mapbox.attribution).toContain('OpenStreetMap');
  expect(mapbox.licence).toBeTruthy();
  const pointer = geography.rendering.alternateSources.find((s: { id: string }) => s.id === mapbox.id);
  expect(pointer.tokenEnv).toBe('VITE_MAPBOX_TOKEN');

  const token = 'not-a-real-token';
  const transform = mapboxRequests(token);
  /* The four shapes a Mapbox style refers to its parts by. */
  expect(resolveMapboxUrl('mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2')).toBe('https://api.mapbox.com/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2.json?secure');
  expect(resolveMapboxUrl('mapbox://sprites/mapbox/streets-v12@2x.json')).toBe('https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite@2x.json');
  expect(resolveMapboxUrl('mapbox://sprites/mapbox/streets-v12.png')).toBe('https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite.png');
  expect(resolveMapboxUrl('mapbox://fonts/mapbox/DIN Pro Bold,Arial Unicode MS Bold/0-255.pbf')).toBe('https://api.mapbox.com/fonts/v1/mapbox/DIN%20Pro%20Bold%2CArial%20Unicode%20MS%20Bold/0-255.pbf');
  expect(resolveMapboxUrl('mapbox://styles/mapbox/streets-v12')).toBe('https://api.mapbox.com/styles/v1/mapbox/streets-v12');
  expect(resolveMapboxUrl('https://tiles.openfreemap.org/styles/positron')).toBeNull();
  /* The token goes on a rewritten name and on a Mapbox host, once, and never on anything else. */
  expect(transform('mapbox://mapbox.mapbox-streets-v8')?.url).toBe(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure=&access_token=${token}`);
  expect(transform('https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v8/12/2300/2500.vector.pbf')?.url).toBe(`https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v8/12/2300/2500.vector.pbf?access_token=${token}`);
  expect(transform(`https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${token}`)?.url).toBe(`https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${token}`);
  expect(transform(source.styleUrl), 'OpenFreeMap’s requests go exactly as the style wrote them').toBeUndefined();
  expect(transform('https://events.mapbox.com/events/v2'), 'the telemetry endpoint is not a host the rewriter knows').toBeUndefined();
  expect(transform('https://evil.example/?next=api.mapbox.com')).toBeUndefined();
  expect(transform('/assets/maplibre-gl-worker.js')).toBeUndefined();
  for (const host of ['api.mapbox.com', 'a.tiles.mapbox.com', 'b.tiles.mapbox.com']) expect(isMapboxHost(host)).toBe(true);
  for (const host of ['events.mapbox.com', 'mapbox.com', 'tiles.mapbox.com.evil.example', 'tiles.openfreemap.org']) expect(isMapboxHost(host)).toBe(false);
  /* No sku: that parameter is how mapbox-gl meters a session, and MapLibre is not asked to. */
  for (const url of ['mapbox://mapbox.mapbox-streets-v8', 'https://a.tiles.mapbox.com/v4/x/1/2/3.pbf']) expect(transform(url)?.url).not.toContain('sku=');
});

/* A suburb name on the schematic is the one piece of text in this product whose size nothing on the
   page controls: it lives inside a 0–100 viewBox, so a font-size in the stylesheet is measured in
   viewBox units and multiplied by whatever the square is rendered at. Four units read as 11.4px at a
   320px viewport, and the type scale floors at 13. This measures what the screen actually shows —
   the declared size times the element's own transform — rather than what the stylesheet asked for,
   which is the number that was wrong. The schematic is what a controller sees when the streets do
   not arrive, so the tile host is refused here to reach it. */
test('no map label renders below the floor of the type scale, at any width', async ({ page }) => {
  await page.route(`**${source.host}/**`, route => route.abort());
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
 * Only the entry that draws one. It used to be two — the patient's arrival screen and the Control
 * Tower's board were separate builds — and they are one entry now, so the list shrank rather than
 * the permission widening. The public page and the status page have no business being allowed to
 * reach a tile server, and a policy widened everywhere because one page needed it is a policy that
 * has stopped meaning anything.
 *
 * Mapbox's two origins are in the same policy whether or not a token was set, because static HTML
 * cannot know; they are allowed for fetching and images only, never for scripts or workers, and the
 * telemetry endpoint mapbox-gl would report to is not among them. */
const origin = new URL(source.styleUrl).origin;
const policyOf = (entry: string) => {
  const html = readFileSync(new URL(`../apps/web/${entry}`, import.meta.url), 'utf8');
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  const directive = (name: string) => (policy.split(';').map(part => part.trim()).find(part => part.startsWith(name)) ?? '').split(/\s+/).slice(1);
  return { policy, directive };
};

for (const entry of ['index.html', 'landing.html']) {
  test(`${entry} may reach the tile source the contract names, and nothing else new`, async () => {
    const { policy, directive } = policyOf(entry);
    expect(directive('connect-src'), `${entry} cannot reach ${origin}, so the streets will never arrive and the map will fall back without saying why`).toContain(origin);
    /* The worker MapLibre parses tiles in is served from this origin, not from a blob. Widening
       worker-src to blob: to accommodate a map would hand every script on the page the same door. */
    expect(policy, `${entry} allows workers from somewhere other than its own origin`).toContain("worker-src 'self'");
    expect(policy, `${entry} no longer restricts where scripts come from`).toContain("script-src 'self'");
    expect(directive('script-src')).toEqual(["'self'"]);
  });
}

test('index.html allows the Mapbox origins for tiles and images only, and never the telemetry endpoint', async () => {
  const { policy, directive } = policyOf('index.html');
  const mapbox = providers.providers.find((p: { id: string }) => p.id === 'mapbox-streets-v12');
  for (const o of mapbox.origins) {
    expect(directive('connect-src'), `connect-src does not allow ${o}`).toContain(o);
    expect(directive('img-src'), `img-src does not allow ${o}`).toContain(o);
    for (const name of ['script-src', 'worker-src', 'style-src', 'font-src', 'media-src', 'default-src', 'frame-src', 'object-src'])
      expect(directive(name), `${name} allows ${o}, and a provider is never a place to run code from`).not.toContain(o);
  }
  expect(policy).not.toContain('events.mapbox.com');
});

for (const entry of ['status.html', 'landing.html']) {
  test(`${entry} names no Mapbox origin`, async () => {
    const html = readFileSync(new URL(`../apps/web/${entry}`, import.meta.url), 'utf8');
    expect(html).not.toContain('mapbox.com');
  });
}

for (const entry of ['status.html']) {
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
