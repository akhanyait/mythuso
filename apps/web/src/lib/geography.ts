import contract from '../../../../packages/catalog/geography.json';
import { distanceKm, isInsideSouthAfrica, projectToSquare, kmToBoxUnits,
 type LatLng, type MapWindow } from '../../../../packages/geo/index.ts';
/* Where MyThuso works, and what a map of it is allowed to draw.
 *
 * The dispatch board used to hold its own Johannesburg: a list of suburbs, their coordinates and
 * the map window, typed into a React component where nothing could disagree with them. iOS and
 * Android each had their own. This module is the web's reading of the one contract, and every
 * platform now draws the same city.
 *
 * The arithmetic is not here and is not in the contract either — distance, projection and the
 * South African bounding box are packages/geo, which refuses a coordinate outside the country
 * before a map is asked to draw it. This file is the join between the two: contract in, refusal or
 * a drawable position out. */

export const coverage = contract.coverage;
export const precision = contract.precision;
export const rendering = contract.rendering;
export const marks = contract.marks;
export const privacy = contract.privacy;
export const refusals = contract.refusals;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
export const privacyRuleById = (id: string) => privacy.rules.find(r => r.id === id)!;

export type Zone = { id: string; name: string; at: LatLng; radiusKm: number };
export const zones: Zone[] = contract.zones;
export const zoneById = (id: string) => zones.find(z => z.id === id);
export const zoneByName = (name: string) => zones.find(z => z.name.toLowerCase() === name.toLowerCase());

export const mapWindow: MapWindow = { centre: contract.window.centre, spanKm: contract.window.spanKm };
export const view = contract.window;

/* The schematic projection, kept for the map that draws without tiles. A build with no token is a
   supported state rather than a broken one, so both renderings read the same numbers. */
export const plot = (p: LatLng) => projectToSquare(p, mapWindow);
export const radiusInBoxUnits = (km: number) => kmToBoxUnits(km, mapWindow);

/* Rounded to the precision the contract declares, on the way *in*. Doing it at the point of use
   would leave the sharper number sitting in memory for the next screen to render, and the rule is
   about what MyThuso knows, not only about what it shows. */
export function blur(p: LatLng): LatLng {
 const f = 10 ** precision.decimals;
 return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

/** The suburb a position falls in, or none. Coverage is a circle around a named centre, not a
    polygon, because the business commits to suburbs and a polygon would imply a surveyed boundary
    nobody has drawn. */
export function zoneFor(p: LatLng): Zone | undefined {
 return zones.find(z => distanceKm(z.at, p) <= z.radiusKm);
}

export type Placement =
 | { drawn: true; at: LatLng; zone?: Zone }
 | { drawn: false; refusal: string; why: string };

/* One gate, and every map goes through it. A position that is not a number, or is outside South
   Africa, or is outside the suburbs MyThuso actually works in, is refused *in the contract's own
   words* rather than quietly dropped — a pin that vanishes teaches a dispatcher that the board is
   unreliable, and a pin in the Atlantic teaches them nothing at all. */
export function place(p: LatLng | null | undefined, options: { requireCoverage?: boolean } = {}): Placement {
 if (!p) { const r = refusalById('no-position-shared'); return { drawn: false, refusal: r.sentence, why: r.why }; }
 if (!isInsideSouthAfrica(p)) { const r = refusalById('outside-south-africa'); return { drawn: false, refusal: r.sentence, why: r.why }; }
 const at = blur(p);
 const zone = zoneFor(at);
 if (options.requireCoverage && !zone) {
  const r = refusalById('outside-coverage');
  return { drawn: false, refusal: r.sentence, why: r.why };
 }
 return { drawn: true, at, zone };
}

/* A visit waiting for a nurse is drawn at the centre of its suburb and never at its address.
   A home address beside a health service is not a location, it is a diagnosis with a doorstep: the
   controller assigning the visit needs the suburb, and the person actually going there gets the
   address inside the visit, where it belongs. This is the function that makes that true rather than
   a paragraph that says it. */
export function suburbPin(areaName: string): LatLng | undefined {
 return zoneByName(areaName)?.at;
}

/* The tile source, and the fact that drawing from it is somebody's decision rather than a default.
 *
 * MapLibre draws from an openly licensed endpoint that wants no account, so the question stopped
 * being "does this build have a token" and became "has the person looking at this screen asked for
 * streets" — which is a better question, because it is the one with a privacy answer. A tile request
 * tells its server which square of the city is open, the internet address that asked, and when;
 * over a visit that is roughly which suburb a patient is in and roughly when somebody came to the
 * house. That is small, it is real, and until this map drew streets nobody had had to disclose it.
 * So the switch is on the map, the sentence describing the request sits beside the switch that
 * causes it, and where the switch starts is the surface's decision below, not this file's.
 *
 * A token came back on 29 September 2026, as a choice rather than a requirement. The contract names
 * a second provider beside OpenFreeMap — Mapbox, keyed by VITE_MAPBOX_TOKEN — and this is the one
 * place that chooses between them: the token is read when the web is built, and if it is set the
 * Mapbox entry draws. If it is not set, nothing changes. No token is committed to this repository; a
 * check fails the build if a value with the pk. prefix appears in any tracked file, and every test
 * runs without one.
 *
 * What this file knows about the alternate is its name and the key's name, and that is deliberate.
 * This module rides in every patient's first load — Arrival draws a LiveMap — and a provider's
 * endpoint, licence, credit, usage policy and layer list are half a kilobyte of English she would
 * download on every visit to a screen that, by default, never asks that provider for anything. So
 * geography.json carries the pointer and packages/catalog/map-providers.json carries the entry,
 * read by map/TileMap.tsx alone, which is behind a dynamic import and fetched only when a map is
 * open with streets on. The credit under the map is rendered from what the tile map reports it drew
 * with, for the same reason: the words belong to the chunk that made the request. */
export type TileSource = {
 id: string; styleUrl: string; host: string; keyRequired: boolean;
 licence: string; attribution: string; attributionUrl: string; loadTimeoutMs: number; labelFont: string;
 /** The layers the board hides; the default source's list is rendering.suppressedLayers. */
 suppressedLayers?: string[];
};
/** What a credit under the map needs, reported by the tile map from the source it actually drew with. */
export type Credit = { attribution: string; attributionUrl: string };

/* Vite substitutes a literal for `import.meta.env.VITE_MAPBOX_TOKEN` at build time, which is what
   makes the choice a build's rather than a page's: the token is not fetched, not configurable from
   a screen and not present in a build that was made without it. Read once, trimmed, never logged. */
const mapboxToken = String(import.meta.env?.VITE_MAPBOX_TOKEN ?? '').trim();
const chosenAlternate = mapboxToken ? rendering.alternateSources.find(s => s.tokenEnv === 'VITE_MAPBOX_TOKEN') : undefined;

/** The source this build draws from: the alternate's pointer with its token, or the default entry. */
export const source: { id: string; name: string; token?: string } = chosenAlternate
 ? { id: chosenAlternate.id, name: chosenAlternate.name, token: mapboxToken }
 : { id: rendering.source.id, name: rendering.source.name };
export const tiles = rendering.tiles;

/* The disclosure names whoever will be asked. The sentences are the contract's and say {provider},
   because a sentence that named OpenFreeMap while Mapbox drew would be a disclosure about the wrong
   party — the one thing a disclosure may not be. */
export const say = (sentence: string) => sentence.replace('{provider}', source.name);

/* One escape hatch, at build time: VITE_MAP_TILES=off builds a preview with no tile source at all.
   The switch then does not appear and the schematic is the whole map — the state both native apps
   are permanently in, and the one a deployment behind a firewall that blocks the endpoint should
   ship rather than offering a switch that cannot work. */
const tileSwitch = ((import.meta.env?.VITE_MAP_TILES as string | undefined) ?? '').toLowerCase();
export const tilesOffered = tileSwitch !== 'off' && Boolean(rendering.source.styleUrl);

/* Where the switch starts is the surface's, and the surfaces are two. A staff surface — the dispatch
   board, the care visit — is a workspace whose job is where people are, and a nurse or a controller
   asked for the map by opening it, so streets start on there. A patient's arrival map asks first:
   the tile request discloses her viewport, and a default nobody chose is not consent. The contract
   states both, so turning one on was an edit somebody had to justify rather than a boolean somebody
   flipped; a surface that does not say gets `default`, which is off. */
export type MapSurface = 'staff' | 'patient';
export const tilesDefaultFor = (surface: MapSurface): 'on' | 'off' =>
 (tiles.defaultBySurface[surface] ?? tiles.default) === 'on' ? 'on' : 'off';
export const tilesStartOn = (surface: MapSurface) => tilesOffered && tilesDefaultFor(surface) === 'on';
