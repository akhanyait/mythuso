/**
 * Simulated nurse positions: a suburb, an accuracy and a time. Never anything else.
 *
 * ── The refusal this whole file is arranged around ───────────────────────────────────────────
 *
 * packages/catalog/feeds.json calls it the single most important refusal in the file, and it is
 * repeated here because a simulator is the one place it would be broken by accident: **a position
 * feed carries no patient id, no visit id, no track and no address.** A nurse's coordinate is, by
 * the nature of a home visit, already within a few metres of somebody's front door. Adding the
 * patient's identity to it turns a track of a worker into a record of who is ill and where they
 * live, held by a location vendor for a location vendor's retention period.
 *
 * A simulator makes that easy to break in a way a route does not, because a simulator is *asked*
 * for things. Somebody wiring a dispatch board wants the visit reference to come back with the
 * position so the two can be joined without a second lookup, and it is one field. So the forbidden
 * list is not written here: it is read out of the feed's own `neverAccepts` and every spelling of
 * it is canonicalised the way the ingestion boundary canonicalises one, and a request that carries
 * any of them at any depth is refused before anything else is looked at. The payload is then built
 * from the feed's five accepted fields and no sixth — and `test/simulation-positions.test.ts` walks
 * what comes out against `neverAccepts` at every depth rather than trusting this paragraph.
 *
 * ── Why the position moves, and what makes the movement honest ───────────────────────────────
 *
 * The Control Tower has had coordinates since the dispatch board was written and every one of them
 * stood still. A patient watching a nurse who never moves learns that the screen is decorative. So a
 * simulated nurse walks a leg between two suburb *centres* — never a doorstep at either end, which
 * is geography.json's `no-doorstep-at-either-end` read in both directions — at a speed that is
 * packages/geo's one urban speed varied per person, and her progress along it is a function of the
 * moment asked about rather than of a timer. Ask for the same minute twice and you get the same
 * coordinate; ask on another machine and you get the same coordinate. `seeded()` is the only
 * randomness, it is taken off the party id alone, and so the nurse with the bad phone has the bad
 * phone for ever rather than on Tuesdays.
 *
 * Everything is rounded to the three decimals geography.json declares — about 110 metres — on the
 * way *out* of this module rather than at the point of use, because the rule is about what MyThuso
 * knows and not only about what a map shows.
 *
 * ── Why an arrival time is not in the payload ────────────────────────────────────────────────
 *
 * The tempting field is `etaMinutes`. It would save every screen a calculation and it would be the
 * end of the argument the arrival screen is built on: a figure that arrives from a supplier reads as
 * a measurement, and this one would be a guess with a vendor's name on it. So the feed does not
 * accept one, this simulator does not produce one, and `arrivalFrom` below derives it — by name, at
 * a call site a reviewer can see, out of packages/geo, with the basis attached. That is the same
 * arrangement packages/geo/routing.ts exists to enforce, and the capability's own refusal — "Claim
 * an arrival time it has not derived" — is what this module says when there is nothing to derive
 * from: a phone that is telling nobody anything, or a fix wider than the suburb it would be drawn
 * in, which is the feed's sharpest switch-on condition and the difference between a measurement and
 * a decoration.
 */
import geography from '../../../../packages/catalog/geography.json' with { type: 'json' };
import roster from '../../../../packages/catalog/roster.json' with { type: 'json' };
import {
 EARTH_RADIUS_KM, URBAN_SPEED_KMH, distanceKm, straightLineEta, type Eta, type LatLng
} from '../../../../packages/geo/index.ts';
import { MAX_DEPTH, canonical, feedById } from '../feeds/index.ts';
/* The forbidden index is built by the contract reader rather than by this file, because it is where
   the one spelling rule lives: patientId, patient_id and "Patient Id" are one field, and a second
   spelling of a spelling rule is the drift the whole repository is arranged against. */
import { forbiddenIndex } from '../feeds/contract.ts';
import { refusalSaying, simulationOf } from './contract.ts';
import { nurseById, zoneNamed, type SimulatedNurse, type Zone } from './roster.ts';
import { produced, refuse, register, seeded, type SimulationRequest, type Simulator, type SimulatorAnswer } from './index.ts';

const CAPABILITY = 'dispatch';
const FEED = feedById('nurse-position')!;
const FORBIDDEN = forbiddenIndex(FEED);

const CARRIES_A_PATIENT = refusalSaying(CAPABILITY, /an address/);
const PIN_ON_A_HOME = refusalSaying(CAPABILITY, /anybody's home/);
const UNDERIVED_ARRIVAL = refusalSaying(CAPABILITY, /not derived/);

/* What a caller may not ask this simulator to state. Not a contract's list, because no contract has
   one: these are the field names somebody reaches for at the moment they want the position feed to
   carry the answer as well as the evidence. The canonical form is the ingestion boundary's, so
   eta_minutes, etaMinutes and "ETA Minutes" are one request. */
const ASKS_FOR_AN_ARRIVAL = new Set(['eta', 'etaminutes', 'arrivalminutes', 'arrivesat', 'arrivalat', 'arrivesin', 'minutesaway']);

const DECIMALS = geography.precision.decimals;
const round = (value: number): number => Math.round(value * 10 ** DECIMALS) / 10 ** DECIMALS;
/* Degrees from kilometres, off the radius packages/geo already holds. A second 111.19 typed here
   would be a second Earth. */
const KM_PER_DEGREE_LAT = Math.PI * EARTH_RADIUS_KM / 180;
const kmPerDegreeLng = (lat: number): number => KM_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180);

/** How the fix and the speed of one nurse's device were decided. Off the party id, once, for ever. */
export type Device = { accuracyMetres: number; speedKmh: number; jitter: LatLng };
export function deviceOf(nurse: SimulatedNurse): Device {
 const rand = seeded(`nurse-position:${nurse.id}`);
 const { poorFixShare, poorFixMetres, goodFixMetres, speedVariation } = roster.positions;
 /* The draws are taken in a fixed order and never conditionally, so adding a fourth property later
    cannot shift the three above it and move every nurse in Johannesburg. */
 const quality = rand();
 const width = rand();
 const pace = rand();
 const north = rand();
 const east = rand();
 /* The contract may declare a device that is permanently having a bad day, and one of the nine is:
    the nurse who spends her shift inside other people's houses, where a handset falls back to the
    cell tower. It is declared rather than drawn so that the refusal resting on it is something
    somebody can open the app and see rather than a branch waiting on a lottery. */
 const accuracyMetres = nurse.fix === 'poor' || quality < poorFixShare
  ? Math.round(poorFixMetres)
  : Math.round(goodFixMetres.from + width * (goodFixMetres.to - goodFixMetres.from));
 return {
  accuracyMetres,
  speedKmh: URBAN_SPEED_KMH * (1 + (pace * 2 - 1) * speedVariation),
  jitter: { lat: north * 2 - 1, lng: east * 2 - 1 }
 };
}

/* A nurse does not stand on the pin at the centre of her suburb. She stands somewhere in it, and
   the offset is a fraction of the suburb's own working radius so that a big zone scatters people
   further than a small one. */
const JITTER_SHARE = 0.3;
function startOf(zone: Zone, device: Device): LatLng {
 const km = zone.radiusKm * JITTER_SHARE;
 return {
  lat: zone.at.lat + device.jitter.lat * km / KM_PER_DEGREE_LAT,
  lng: zone.at.lng + device.jitter.lng * km / kmPerDegreeLng(zone.at.lat)
 };
}

/** Where she is, a stated number of minutes into a leg between two suburbs. */
export function positionOn(nurse: SimulatedNurse, from: Zone, to: Zone, minutesIn: number): LatLng {
 const device = deviceOf(nurse);
 const start = startOf(from, device);
 const km = distanceKm(start, to.at);
 const legMinutes = km / device.speedKmh * 60;
 /* Nought minutes in is where she started; past the end of the leg she is at the centre of the
    suburb she was going to, and not one metre closer to any door in it. */
 const progress = legMinutes <= 0 ? 1 : Math.min(1, Math.max(0, minutesIn / legMinutes));
 return {
  lat: round(start.lat + (to.at.lat - start.lat) * progress),
  lng: round(start.lng + (to.at.lng - start.lng) * progress)
 };
}

/** Whether anything in a request names a field this feed refuses, at any depth. Objects and arrays. */
function namesAForbiddenField(value: unknown, depth = 0): boolean {
 if (depth > MAX_DEPTH) return false;
 if (Array.isArray(value)) return value.some(item => namesAForbiddenField(item, depth + 1));
 if (typeof value !== 'object' || value === null) return false;
 const entries = Object.entries(value as Record<string, unknown>);
 if (entries.some(([key]) => FORBIDDEN.has(canonical(key)))) return true;
 return entries.some(([, nested]) => namesAForbiddenField(nested, depth + 1));
}
const asksForAnArrival = (detail: Record<string, unknown>): boolean =>
 Object.keys(detail).some(key => ASKS_FOR_AN_ARRIVAL.has(canonical(key)));

const zoneById = (id: string): Zone | null => (geography.zones as readonly Zone[]).find(zone => zone.id === id) ?? null;

export const nursePosition: Simulator = {
 id: 'nurse-position',
 feed: 'nurse-position',
 capability: CAPABILITY,
 supplier: simulationOf(CAPABILITY).supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  const detail = request.detail ?? {};
  /* First, before anything else is looked at, and for the reason feeds/index.ts gives about the
     same ordering at the door: a request carrying a patient id is a more interesting fact than a
     request naming a nurse nobody has heard of, and checking the cheap one first would lose it. */
  if (namesAForbiddenField(detail)) return refuse(nursePosition, request, CARRIES_A_PATIENT);
  const nurse = nurseById(request.subject);
  if (!nurse) return refuse(nursePosition, request, UNDERIVED_ARRIVAL);
  const from = nurse.zone;
  /* A destination is the name of a suburb or it is somebody's house. A coordinate, a pair of
     numbers or a string geography.json does not have is an address by another route, and a
     simulator that accepted one would teach the product that a position feed may be pointed at a
     door. */
  if (typeof detail.towards !== 'undefined' && typeof detail.towards !== 'string') return refuse(nursePosition, request, PIN_ON_A_HOME);
  if (typeof detail.lat !== 'undefined' || typeof detail.lng !== 'undefined') return refuse(nursePosition, request, PIN_ON_A_HOME);
  const to = typeof detail.towards === 'string' ? zoneNamed(detail.towards) ?? zoneById(detail.towards) : from;
  if (typeof detail.towards === 'string' && !to) return refuse(nursePosition, request, PIN_ON_A_HOME);
  /* Three ways there is nothing to derive an arrival from, and all three end in the same sentence.
     A phone in a bag is a true statement about a person's whereabouts and a guessed pin is a false
     one; a fix wider than the suburb it would be drawn in arrives on a patient's screen looking
     exactly as certain as a good one; and a caller asking this feed to state the arrival is asking
     for the one number it has not measured. */
  if (asksForAnArrival(detail)) return refuse(nursePosition, request, UNDERIVED_ARRIVAL);
  if (!nurse.sharesPosition || !from) return refuse(nursePosition, request, UNDERIVED_ARRIVAL);
  const device = deviceOf(nurse);
  if (device.accuracyMetres > from.radiusKm * 1000) return refuse(nursePosition, request, UNDERIVED_ARRIVAL);
  const at = request.at ?? new Date();
  const minutesIn = typeof detail.minutesIn === 'number' && Number.isFinite(detail.minutesIn) ? detail.minutesIn : 0;
  const where = positionOn(nurse, from, to ?? from, minutesIn);
  return produced(nursePosition, request, {
   partyId: nurse.id,
   lat: where.lat,
   lng: where.lng,
   accuracyMetres: device.accuracyMetres,
   reportedAt: at.toISOString()
  });
 }
};
register(nursePosition);


/**
 * The arrival, derived rather than delivered.
 *
 * It takes the *event* rather than the nurse, so that nothing can be estimated from a position the
 * feed never produced, and it returns packages/geo's Eta — which cannot hold a number without the
 * basis it came from. A screen printing this prints "straight line over 4.2 km at 30 km/h" with it,
 * because that is what it is.
 */
export function arrivalFrom(payload: { lat: number; lng: number }, to: Zone): Eta {
 return straightLineEta({ lat: payload.lat, lng: payload.lng }, to.at, { sourceLabel: 'simulation:nurse-position' });
}
