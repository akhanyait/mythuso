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

/* The token is read from the environment at build time and its absence is a state, not a failure.
   No token is committed to this repository: a key in source is a key in every fork of it. */
export const mapboxToken: string = (import.meta.env?.VITE_MAPBOX_TOKEN as string | undefined) ?? '';
export const tilesAvailable = mapboxToken.startsWith('pk.');
