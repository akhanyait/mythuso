/* Coordinates, held once, for all three apps.

   This module exists because a sibling project shipped without it and paid for it: an iOS
   Simulator's default position — Cupertino — travelled from a device into a locations table, out
   again into a routing call, and came back as a 16,939 km route line drawn across the Atlantic. The
   number was real and the arithmetic was correct. Nothing between the device and the map had asked
   whether the coordinate was in South Africa, so nothing caught it, and a migration had to clean up
   after it. Every coordinate MyThuso holds passes through here before it reaches anything that
   draws, measures or estimates.

   Zero dependencies and no framework, deliberately. iOS and Android hand-write their own copies of
   this the way they hand-write the identity check-digit validator, and a copy is only
   straightforward to write when there is nothing in the original but arithmetic. README.md in this
   directory is the porting contract. */

/* Latitude first in the object, longitude first in the tuple. That inconsistency is not ours: the
   browser's geolocation API hands over { latitude, longitude } and every mapping vendor's wire
   format takes [lng, lat]. Naming both shapes and converting at the boundary is cheaper than
   remembering which one you are holding. */
export interface LatLng { lat: number; lng: number }
export type LngLat = [number, number];

/* Generous enough to cover the coastline and the Mozambique-border protrusion, and tight enough
   that Cupertino, London and null-island all fall outside it. Neighbouring capitals near the
   corners — Gaborone, Maputo — fall inside, which is accepted: the province table is the tighter
   test when one is needed. */
export const SA_BOUNDS = { minLng: 16, maxLng: 33.5, minLat: -35.5, maxLat: -22 } as const;

export const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export const toLngLat = (p: LatLng): LngLat => [p.lng, p.lat];
export const fromLngLat = (t: LngLat): LatLng => ({ lng: t[0], lat: t[1] });

/* Finite and on the globe. Says nothing about whether it is anywhere MyThuso operates. */
export function isFiniteCoordinate(p: LatLng | null | undefined): p is LatLng {
 if (!p) return false;
 if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
 return p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}
export function isInsideSouthAfrica(p: LatLng | null | undefined): p is LatLng {
 if (!isFiniteCoordinate(p)) return false;
 return p.lng >= SA_BOUNDS.minLng && p.lng <= SA_BOUNDS.maxLng
     && p.lat >= SA_BOUNDS.minLat && p.lat <= SA_BOUNDS.maxLat;
}

/* South African longitude is positive and latitude is negative, so a swapped pair is visible in the
   signs alone. "unknown" is a real answer here — [10, 20] could be either, and guessing at it is
   how a swap gets silently blessed instead of reported. */
export function inferTupleOrder(t: LngLat): 'lng-lat' | 'lat-lng' | 'unknown' {
 const [a, b] = t;
 if (a > 0 && a < 90 && b < 0 && b > -90) return 'lng-lat';
 if (a < 0 && a > -90 && b > 0 && b < 180) return 'lat-lng';
 return 'unknown';
}
export function orderTuple(t: LngLat): LngLat {
 return inferTupleOrder(t) === 'lat-lng' ? [t[1], t[0]] : [t[0], t[1]];
}

/* Great-circle distance. This is the only distance MyThuso can compute without a vendor, and every
   caller of it has to say so out loud — a straight line between two points is not how far anybody
   actually drives, and packages/geo/routing.ts is where the difference is written down. */
export function distanceMetres(a: LatLng, b: LatLng): number {
 const dLat = toRadians(b.lat - a.lat);
 const dLng = toRadians(b.lng - a.lng);
 const h = Math.sin(dLat / 2) ** 2
  + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
 return EARTH_RADIUS_KM * 1000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const distanceKm = (a: LatLng, b: LatLng): number => distanceMetres(a, b) / 1000;

/* ---- Drawing a picture of coordinates ---------------------------------------------------
   A decorative map is still allowed to be true. Hand-placed pixels drift away from the data they
   claim to show and nobody notices, because there is nothing to notice against; a projection cannot
   drift, because there is only one set of numbers. The window is a square measured in kilometres,
   so the picture keeps its proportions at Johannesburg's latitude rather than stretching east-west
   the way a raw degree grid does. */
export interface MapWindow { centre: LatLng; spanKm: number }
export interface BoxPoint { x: number; y: number }
export function projectToSquare(p: LatLng, window: MapWindow, size = 100): BoxPoint {
 const eastKm = EARTH_RADIUS_KM * toRadians(p.lng - window.centre.lng) * Math.cos(toRadians(window.centre.lat));
 const northKm = EARTH_RADIUS_KM * toRadians(p.lat - window.centre.lat);
 return { x: size * (0.5 + eastKm / window.spanKm), y: size * (0.5 - northKm / window.spanKm) };
}
/* A radius drawn on that square. One scale for both axes, which is the whole point of a square
   window measured in kilometres. */
export const kmToBoxUnits = (km: number, window: MapWindow, size = 100): number => size * km / window.spanKm;
