import { coverage, precision, privacyRuleById, refusalById, zoneByName, type Zone } from './geography';
import { etaFromRoute, routeUnavailable, straightLineEta, noEta,
 type Eta, type RouteResult } from '../../../../packages/geo/index.ts';
import { isoIn } from './scheduling';

/* Where is she now — the one question this product could answer for a controller and not for the
 * person waiting at home.
 *
 * The Control Tower has had coordinates, zones and arrival estimates since the dispatch board was
 * written. A patient had none of it. This module is the patient's half of the same contract, and it
 * is deliberately *less* than the controller's rather than a copy of it.
 *
 * THREE REFUSALS, AND THEY ARE THE FEATURE.
 *
 * A patient is never shown where a nurse is standing. She is shown the suburb the nurse is in, and
 * every distance below is between two suburb centres. geography.json already says a visit is drawn
 * at the centre of its suburb and never at its address — "a home address beside a health service is
 * not a location, it is a diagnosis with a doorstep" — and the same sentence read the other way
 * round is why a patient does not get a moving dot on a street. A nurse's working day is her
 * private life as much as an address is somebody's.
 *
 * A position is shown only on the day of the visit. A patient who can open this screen a fortnight
 * before her appointment and watch a nurse move around Johannesburg is being handed a tracking
 * device, and no part of arranging a home visit needs one. Before the day there is nothing here to
 * watch, and the screen says so rather than drawing an empty map.
 *
 * No arrival time is claimed. The number below is a straight line at a stated speed, exactly as it
 * is on the dispatch board, and the sentence that carries it says so in the same breath. No routing
 * provider is connected; a straight line through Johannesburg is optimistic by roughly a third and
 * knows nothing about the M1, a school run or the visit she is finishing first.
 *
 * WHAT BELONGS IN A CONTRACT AND IS NOT THERE YET. The refusal sentences below, and the fact that a
 * nurse is Sister Naledi Mokoena working out of Rosebank — that fixture is typed into
 * features/Dispatch.tsx as well, where it is nurse N-114, and two copies of a person is exactly the
 * drift packages/catalog exists to stop. Both are reported rather than invented a third time.
 *
 * Nothing here reads a device. dispatch is not connected, the positions are the contract's own zone
 * centres, and no geolocation permission is requested by this file or by anything it calls. */

/** The nurse this account's visits are assigned to. Typed here so that the three screens that name
    her read one fixture; it belongs in a contract beside the dispatch roster. */
export const assignedNurse = {
 name: 'Sister Naledi Mokoena',
 role: 'Registered Nurse (SANC)',
 initials: 'SN',
 /** A suburb in geography.json, never a coordinate. What a patient is told is the suburb. */
 area: 'Rosebank'
} as const;

/* The sentences a patient is owed when there is nothing to show. Each says what is refused and
   leaves the reader somewhere to stand, which is the difference between a state and a blank. */
export const arrivalRefusals = {
 anotherDay: 'Nobody is on the way yet, so there is nothing to follow. You will see where she is on the day of your visit.',
 /* The rule behind that, said once, in the list of what this screen is not — rather than repeated
    verbatim under the figure it has already explained. */
 onlyOnTheDay: 'MyThuso shows you where a nurse is on the day of your visit and not before. A nurse’s whereabouts between visits is her own, in the same way your address is yours.',
 noWindow: 'This visit has no time yet, so there is nobody assigned to be on the way. When a nurse accepts it you will be told who is coming and when.',
 finished: 'This visit is not ahead of you, so there is nothing to follow. What happened at it is in the visit itself.',
 notAnArrivalTime: 'This is not an arrival time. It is the distance between two suburbs, divided by a speed — it does not know the traffic, the road, or the visit she is finishing first.',
 noDoorstep: 'A nurse is drawn in the suburb she is working in, and your visit is drawn in the centre of yours — at both ends, at every zoom.'
} as const;

/** Whole days between today in Johannesburg and an ISO date. Negative is behind us. */
export const daysUntil = (iso: string, from: Date = new Date()) =>
 Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${isoIn(from)}T12:00:00Z`)) / 86_400_000);

/** The suburb half of "Home visit · Rosebank". A visit carries an address for the nurse who is
    going there; what a map is allowed to know about it is the suburb, and this is that narrowing. */
export const areaOf = (address: string) => address.split('·').pop()!.trim();

export type ArrivalVisit = { address: string; date?: string; start?: string; kind: 'scheduled' | 'asap' };

export type Arrival =
 /** The day of the visit. A suburb for her, a suburb for you, and a line between them. */
 | { state: 'on-the-day'; from: Zone; to: Zone; eta: Eta }
 /** Ahead of the day. The suburb is drawn; she is not. */
 | { state: 'another-day'; to: Zone; days: number; refusal: string }
 /** No time has been given, so nobody has been asked to come. */
 | { state: 'no-window'; to?: Zone; refusal: string }
 /** The address is not in a suburb MyThuso works in, in the contract's own words. */
 | { state: 'outside-coverage'; area: string; refusal: string; why: string }
 | { state: 'finished'; refusal: string };

/* No routing provider is connected, and every request for one comes back unavailable — which is
   also what a real provider returns when it is down. So this is the path the screen was written
   against from its first day rather than the one nobody tries. Nothing is quietly redrawn as the
   straight line: the screen asks a different question, by name, and prints the answer's basis
   beside it. */
const routeFor = (_from: Zone, _to: Zone): RouteResult =>
 routeUnavailable('No routing provider is connected, so no road route can be drawn or timed.');

export function arrivalFor(visit: ArrivalVisit, group: 'upcoming' | 'past' | 'cancelled'): Arrival {
 if (group !== 'upcoming') return { state: 'finished', refusal: arrivalRefusals.finished };
 const area = areaOf(visit.address);
 const to = zoneByName(area);
 if (!to) {
  const outside = refusalById('outside-coverage');
  return { state: 'outside-coverage', area, refusal: outside.sentence, why: outside.why };
 }
 if (visit.kind === 'asap' || !visit.date) return { state: 'no-window', to, refusal: arrivalRefusals.noWindow };
 const days = daysUntil(visit.date);
 if (days !== 0) return { state: 'another-day', to, days, refusal: arrivalRefusals.anotherDay };
 const from = zoneByName(assignedNurse.area);
 /* A nurse with no suburb is a nurse whose device is telling us nothing, and the contract has a
    sentence for that already. It is said out loud rather than left as an absent pin. */
 if (!from) return { state: 'no-window', to, refusal: refusalById('no-position-shared').sentence };
 const measured = etaFromRoute(routeFor(from, to));
 const eta = measured.minutes !== null ? measured
  : from.id === to.id
   /* Same suburb. A straight line between one zone centre and itself is nought kilometres, and
      "1 minute away" is a promise about a doorstep this screen has refused to know about. */
   ? noEta(`She is working in ${to.name}, which is your own suburb. There is no distance here to measure, and how long a nurse takes to reach a door on the same streets is not something this screen knows.`)
   : straightLineEta(from.at, to.at, { sourceLabel: 'arrival' });
 return { state: 'on-the-day', from, to, eta };
}

/* The basis, in a patient's words rather than a controller's. The figures come off the Eta — there
   is no way to print a number here without the thing it was derived from, which is the rule
   packages/geo/eta.ts exists to enforce. */
export const basisSentence = (eta: Eta) =>
 eta.basis === 'straight-line'
  ? `Measured in a straight line over ${(eta.distanceKm ?? 0).toFixed(1)} km at ${eta.speedKmh} km/h. That is not a road route.`
  : eta.basis === 'route' ? 'Measured along a road route.'
   : eta.basis === 'last-known-route' ? `The last road route we measured, ${Math.round((eta.ageSeconds ?? 0) / 60)} minutes ago.`
    : eta.reason ?? 'There is nothing to estimate from.';

/** "About 12 minutes", or the word rather than a dash. An empty cell reads as nothing at all to a
    screen reader and a dash reads as one. */
export const minutesSentence = (eta: Eta) =>
 eta.minutes === null ? 'Estimating' : `${eta.minutes}`;

/* What the screen says about how precise any of this is, read from the contract rather than
   restated. Three decimal places is about a hundred metres: enough to draw a suburb and not enough
   to find a door. */
export const precisionSentence = precision.sentence;
export const coverageSentence = coverage.sentence;
export const addressRule = privacyRuleById('address-is-not-a-pin');
export const historyRule = privacyRuleById('no-history-drawn');
