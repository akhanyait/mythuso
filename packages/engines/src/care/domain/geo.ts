/* The one piece of packages/geo Care needs — a great-circle distance and the South Africa box — ported
 * by hand, as packages/geo/README.md asks of every copy.
 *
 * Ported rather than imported because an engine's code reaches its own directory, the runtime and the
 * catalog and nothing else: the runtime's store-isolation check refuses any other import, and a
 * package-sized exception for one function would be the first hole in it. The price of a copy is drift,
 * so scripts/check-boundaries.mjs runs this and packages/geo over the same points and fails on any
 * difference — the arithmetic is held in step, not trusted to stay there. */

export type LatLng = { readonly lat: number; readonly lng: number };

export const SA_BOUNDS = { minLng: 16, maxLng: 33.5, minLat: -35.5, maxLat: -22 } as const;
export const EARTH_RADIUS_KM = 6371;
/** Past this, a gap between two points inside the box is a coordinate fault, not a long trip. */
export const MAX_REALISTIC_DISPATCH_KM = 300;

const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function isInsideSouthAfrica(p: LatLng | null | undefined): p is LatLng {
 if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
 return p.lng >= SA_BOUNDS.minLng && p.lng <= SA_BOUNDS.maxLng && p.lat >= SA_BOUNDS.minLat && p.lat <= SA_BOUNDS.maxLat;
}

export function distanceKm(a: LatLng, b: LatLng): number {
 const dLat = toRadians(b.lat - a.lat);
 const dLng = toRadians(b.lng - a.lng);
 const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
 /* Metres first and then kilometres, in packages/geo's own order of operations, so the two agree to the
    last bit rather than to the fourteenth decimal place and the drift check can ask for equality. */
 return EARTH_RADIUS_KM * 1000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) / 1000;
}
