import { isInsideSouthAfrica, type LatLng, type LngLat } from './coords.ts';

/* The one gate every coordinate goes through.

   The American spelling is kept from the sibling project it was ported from, so the two are
   greppable as the same thing. Everything else here is South African English.

   What it does, in the order it does it: coerce whatever it was handed — a number, a string out of
   a database column, null — to numbers; refuse NaN; accept a pair already inside South Africa;
   auto-correct a pair that is only valid the other way round, with a warning carrying the label of
   whoever handed it over, because a swap is a bug upstream and correcting it silently means it is
   never fixed; and otherwise refuse, naming the offender where it is recognisable. The named
   offenders matter more than they look: "outside South Africa bounds" sends a developer looking at
   the map, and naming the simulator default sends them to the one line of code that is
   actually wrong. */

export interface NormalizedCoord {
 lng: number;
 lat: number;
 /** True only when both values are finite and the pair is inside South Africa. */
 valid: boolean;
 /** Why it was refused, in words a person can act on. Null when valid. */
 reason: string | null;
 /** Who handed it over — a table, a screen, a device feed. Carried through so a warning names it. */
 sourceLabel: string;
 /** True when lat and lng arrived the wrong way round and were swapped back. */
 autoCorrected: boolean;
 /** Exactly what arrived, so a screenshot of a diagnostic tells the whole story. */
 raw: { lat: CoordinateInput; lng: CoordinateInput };
}
export type CoordinateInput = number | string | null | undefined;
export interface LooseLatLng { lat: CoordinateInput; lng: CoordinateInput }

/* Warnings go to the console by default and can be redirected — which is how the tests assert that
   an auto-correction is announced rather than trusting that it is. */
export type CoordinateWarning = { message: string; detail: Record<string, unknown> };
const toConsole = (w: CoordinateWarning) => console.warn(w.message, w.detail);
let warn: (w: CoordinateWarning) => void = toConsole;
export function setCoordinateWarningSink(sink: ((w: CoordinateWarning) => void) | null): void {
 warn = sink ?? toConsole;
}

export function normalizeSouthAfricaLngLat(input: LooseLatLng | null | undefined, sourceLabel: string): NormalizedCoord {
 const raw = { lat: input?.lat ?? null, lng: input?.lng ?? null };
 const refused = (reason: string, lng = 0, lat = 0): NormalizedCoord =>
  ({ lng, lat, valid: false, reason, sourceLabel, autoCorrected: false, raw });
 if (!input) return refused('No coordinate was given.');
 /* Strings are coerced rather than refused because a database column, a form field and a query
    parameter all arrive as text, and refusing them would only push the same Number() call out to
    every caller, where it would be forgotten in one of them. */
 const lat = Number(input.lat);
 const lng = Number(input.lng);
 if (!Number.isFinite(lat) || !Number.isFinite(lng)) return refused('Coordinate is not a number.');

 if (isInsideSouthAfrica({ lat, lng })) return { lng, lat, valid: true, reason: null, sourceLabel, autoCorrected: false, raw };

 /* Valid only when read the other way round. South African longitude is positive and latitude is
    negative, so this is unambiguous rather than a guess. */
 if (isInsideSouthAfrica({ lat: lng, lng: lat })) {
  warn({ message: `[geo] Corrected reversed lat/lng from ${sourceLabel}`, detail: { rawLat: input.lat, rawLng: input.lng, correctedLat: lng, correctedLng: lat } });
  return { lng: lat, lat: lng, valid: true, reason: null, sourceLabel, autoCorrected: true, raw };
 }

 let reason = 'Coordinate is outside South Africa.';
 if (Math.abs(lat - 37.33) < 1 && Math.abs(lng + 122.03) < 1) reason = 'Coordinate looks like a mobile simulator default (Cupertino, or the Android emulator’s Mountain View).';
 else if (lat === 0 && lng === 0) reason = 'Coordinate is null-island (0, 0) — almost always an unset field rather than a place.';
 else if (Math.abs(lat) > 90 || Math.abs(lng) > 180) reason = 'Coordinate exceeds the global lat/lng range.';
 warn({ message: `[geo] Refused a coordinate from ${sourceLabel}`, detail: { lat, lng, reason } });
 return { ...refused(reason), lng, lat };
}

/* For the call sites that genuinely cannot carry on — converting for a vendor that will happily
   draw whatever it is handed. Everywhere a screen has something honest to say instead, it should
   read the result and say it. */
export function toLngLatOrThrow(n: NormalizedCoord): LngLat {
 if (!n.valid) throw new Error(`Refusing to use an invalid coordinate from ${n.sourceLabel}: ${n.reason}`);
 return [n.lng, n.lat];
}
export const asLatLng = (n: NormalizedCoord): LatLng | null => n.valid ? { lat: n.lat, lng: n.lng } : null;

/* A trip longer than this inside one metro is not a long trip, it is a wrong coordinate. Both
   endpoints can pass the national bounding box and still be 1,200 km apart; that is how the
   16,939 km line got drawn, only with a smaller number. Anything past this is refused as a data
   fault rather than estimated. */
export const MAX_REALISTIC_DISPATCH_KM = 300;
