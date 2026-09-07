import { distanceKm } from './coords.ts';
import { MAX_REALISTIC_DISPATCH_KM, normalizeSouthAfricaLngLat, type LooseLatLng } from './normalize.ts';
import { isRouteMeasured, type RouteResult } from './routing.ts';

/* An estimated arrival, or nothing.

   The rule is borrowed from a sibling project's queue estimator, which measures its own throughput
   and returns null the moment there is nothing to measure. Its comment is the whole design:
   estimating is honest, 0 seconds is not. A number on a screen is a claim, and a claim that came
   from a placeholder is worse than a blank, because a dispatcher will plan around it.

   So every arrival time here carries the basis it was derived from, and there is no way to get a
   number without one. When there is no basis, `minutes` is null and `reason` says why in words the
   screen can print. A screen renders that as "estimating" — never as a dash, never as an empty
   cell, and never as zero. */

export type EtaBasis = 'route' | 'last-known-route' | 'straight-line' | 'none';
export interface Eta {
 /** Null means we do not know. It never means zero, and zero is never rounded down to. */
 minutes: number | null;
 basis: EtaBasis;
 distanceKm: number | null;
 /** The speed the estimate can point at. Null when the duration came from a provider that measured
    it, rather than from a distance divided by an assumption. */
 speedKmh: number | null;
 /** Set exactly when minutes is null. */
 reason: string | null;
 /** How old the measurement is, when it came from one. */
 ageSeconds: number | null;
}

/* Johannesburg traffic, averaged over stops, robots and school runs. It is a guess — but it is a
   guess with a name, kept in one place, printed on the row it produced, and easy to argue with.
   That is the difference between an assumption and a made-up number. */
export const URBAN_SPEED_KMH = 30;

export const noEta = (reason: string, km: number | null = null): Eta =>
 ({ minutes: null, basis: 'none', distanceKm: km, speedKmh: null, reason, ageSeconds: null });

/* A straight line between two points, at a stated speed.

   Not a route, and it must never be presented as one: it goes through buildings, ignores the M1 and
   is optimistic by roughly a third in a city laid out like Johannesburg. No detour factor is
   applied here on purpose. Multiplying by 1.3 would produce a closer arrival time and a worse
   label — the screen says "straight line", so the number has to be one. A screen that wants road
   distance has to ask a provider for a road route. */
export function straightLineEta(
 from: LooseLatLng | null | undefined,
 to: LooseLatLng | null | undefined,
 options: { speedKmh?: number; sourceLabel?: string } = {}
): Eta {
 const { speedKmh = URBAN_SPEED_KMH, sourceLabel = 'eta' } = options;
 const origin = normalizeSouthAfricaLngLat(from, `${sourceLabel}:from`);
 if (!origin.valid) return noEta(origin.reason ?? 'There is no position to measure from.');
 const destination = normalizeSouthAfricaLngLat(to, `${sourceLabel}:to`);
 if (!destination.valid) return noEta(destination.reason ?? 'There is no position to measure to.');
 if (!(speedKmh > 0) || !Number.isFinite(speedKmh)) return noEta('There is no speed to divide the distance by.');
 const km = distanceKm(origin, destination);
 /* Both ends passed the national bounds and are still most of a country apart. That is a
    coordinate fault, and estimating a nine-hour arrival for a home visit would hide it. */
 if (km > MAX_REALISTIC_DISPATCH_KM) return noEta(`Those two positions are ${Math.round(km)} km apart, which is a coordinate fault rather than a long trip.`, km);
 /* One minute is the floor. Somebody at the gate still has to reach the door, and zero minutes is
    the number the sibling project refused to print. */
 return { minutes: Math.max(1, Math.round(km / speedKmh * 60)), basis: 'straight-line', distanceKm: km, speedKmh, reason: null, ageSeconds: null };
}

/* An arrival time from a measured route — and nothing at all from an unavailable one.

   There is no straight-line branch in here, and that absence is the contract. A screen that decides
   to show a straight-line estimate when the route is unavailable makes that decision itself, by
   name, at its own call site, and labels it where the reader can see it. */
export function etaFromRoute(result: RouteResult): Eta {
 if (!isRouteMeasured(result)) return noEta(result.reason);
 if (!Number.isFinite(result.durationSeconds) || result.durationSeconds < 0) return noEta(`${result.provider} returned a route without a usable duration.`);
 return {
  minutes: Math.max(1, Math.round(result.durationSeconds / 60)),
  basis: result.status === 'stale' ? 'last-known-route' : 'route',
  distanceKm: Number.isFinite(result.distanceMetres) ? result.distanceMetres / 1000 : null,
  speedKmh: null,
  reason: null,
  ageSeconds: result.ageSeconds
 };
}
