import { coverage, precision, privacyRuleById, refusalById, zoneByName, type Zone } from './geography';
import { etaFromRoute, routeUnavailable, straightLineEta, noEta,
 type Eta, type LatLng, type RouteResult } from '../../../../packages/geo/index.ts';
import { instantOf, isoIn } from './scheduling';
import { assignedTo, legTo, type Leg, type RosterNurse } from './roster';
import { roleById, authorityById } from './vetting';

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
 * WHAT IS IN THE CONTRACT NOW, AND WHAT IS STILL NOT. The refusal sentences are in
 * packages/catalog/geography.json and read from it below; three of them as privacy rules, four as
 * refusals, none of them edited on the way. What is still not there is the fact that a nurse is
 * Sister Naledi Mokoena working out of Rosebank — that fixture is typed into features/Dispatch.tsx
 * as well, where she is nurse N-205, the id the vetting register holds, and two copies of a person
 * is exactly the drift packages/catalog exists to stop. It is reported rather than invented a third
 * time.
 *
 * Nothing here reads a device. dispatch is not connected, the positions are the contract's own zone
 * centres, and no geolocation permission is requested by this file or by anything it calls. */

/** The suburb half of "Home visit · Rosebank". A visit carries an address for the nurse who is
    going there; what a map is allowed to know about it is the suburb, and this is that narrowing. */
export const areaOf = (address: string) => address.split('·').pop()!.trim();

/**
 * The nurse a visit is assigned to, out of the simulated roster.
 *
 * She was four lines typed here — a name, a role, two initials and a suburb — with the note that it
 * belonged in a contract beside the dispatch roster. It does, it is, and this reads it: the same nine
 * people packages/catalog/roster.json holds, gated by the same vetting the console decides with, so a
 * nurse suspended there cannot be the one a patient is told is coming. Which of them takes a visit is
 * the straight line between two suburb centres and nothing else, so it is the same answer on every
 * machine.
 *
 * The role is composed from the vetting register rather than typed: the role's own name and the
 * short name of the authority that registers her.
 */
export type AssignedNurse = {
 id: string; name: string; role: string; initials: string;
 /** A suburb in geography.json, never a coordinate. What a patient is told is the suburb. */
 area: string;
 zone: Zone | undefined;
 roster: RosterNurse;
};
const NURSE_ROLE = `${roleById('nurse')!.name} (${authorityById('sanc')!.short})`;
const asAssigned = (nurse: RosterNurse): AssignedNurse =>
 ({ id: nurse.id, name: nurse.name, role: NURSE_ROLE, initials: nurse.initials, area: nurse.zoneName, zone: nurse.zone, roster: nurse });

/** Who is coming to this address. The suburb decides; the address never leaves the visit. */
export const nurseFor = (address: string): AssignedNurse => asAssigned(assignedTo(areaOf(address))!);
/* The suburb this account's own care happens in. Booking defaults its address to it and the visits
   in the list are written in it, so it is named once here rather than typed beside each of them —
   and it is what decides who the Health Passport says took the readings, which has to be the same
   person the visit list says is coming. */
export const HOME_SUBURB = 'Melville';
/* The one a screen with no visit in front of it names: the passport's record of a visit that has
   already happened, and the row above the first booking. It is the roster's answer for that suburb
   rather than a tenth copy of a person. */
export const assignedNurse: AssignedNurse = nurseFor(`· ${HOME_SUBURB}`);

/* The sentences a patient is owed when there is nothing to show. Each says what is refused and
   leaves the reader somewhere to stand, which is the difference between a state and a blank.

   They are read out of packages/catalog/geography.json rather than typed here, and that is the
   whole point of this block existing at all. All six were written out a second time in
   Models/Arrival.swift and a third time in model/Arrival.kt, word for word, with nothing comparing
   the copies — the drift the catalogue exists to stop, sitting in the file that says so in its own
   header. The three that are rules about what a map may show are privacy rules beside
   address-is-not-a-pin; the four that are states a patient reads are refusals beside
   outside-coverage, which this file already reads two of. A boundary check now refuses any of them
   as a literal in hand-written source on any platform. */
const rule = (id: string) => privacyRuleById(id).statement;
export const arrivalRefusals = {
 anotherDay: refusalById('nobody-on-the-way-yet').sentence,
 /* The rule behind that, said once, in the list of what this screen is not — rather than repeated
    verbatim under the figure it has already explained. It is enforced by arithmetic and not by this
    sentence: arrivalFor cannot reach 'on-the-day' unless daysUntil returns nought. */
 onlyOnTheDay: rule('only-on-the-day'),
 noWindow: refusalById('no-window-no-nurse').sentence,
 finished: refusalById('visit-behind-you').sentence,
 notAnArrivalTime: refusalById('not-an-arrival-time').sentence,
 noDoorstep: rule('no-doorstep-at-either-end'),
 /* Not rendered by this app yet — both native apps say it and the web does not. It is exported so
    that when the screen does say it, it says the same words rather than a seventh set. */
 nothingIsMeasured: rule('nothing-is-measured')
} as const;

/** Whole days between today in Johannesburg and an ISO date. Negative is behind us. */
export const daysUntil = (iso: string, from: Date = new Date()) =>
 Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${isoIn(from)}T12:00:00Z`)) / 86_400_000);

export type ArrivalVisit = { address: string; date?: string; start?: string; kind: 'scheduled' | 'asap' };

export type Arrival =
 /** The day of the visit. A suburb for her, a suburb for you, and a line between them. */
 | { state: 'on-the-day'; nurse: AssignedNurse; from: Zone; to: Zone; at: LatLng; leg: Leg | null; eta: Eta }
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

export function arrivalFor(visit: ArrivalVisit, group: 'upcoming' | 'past' | 'cancelled', now: Date = new Date()): Arrival {
 if (group !== 'upcoming') return { state: 'finished', refusal: arrivalRefusals.finished };
 const area = areaOf(visit.address);
 const to = zoneByName(area);
 if (!to) {
  const outside = refusalById('outside-coverage');
  return { state: 'outside-coverage', area, refusal: outside.sentence, why: outside.why };
 }
 if (visit.kind === 'asap' || !visit.date) return { state: 'no-window', to, refusal: arrivalRefusals.noWindow };
 const days = daysUntil(visit.date, now);
 if (days !== 0) return { state: 'another-day', to, days, refusal: arrivalRefusals.anotherDay };
 const nurse = nurseFor(visit.address);
 const from = nurse.zone;
 /* A nurse with no suburb is a nurse whose device is telling us nothing, and the contract has a
    sentence for that already. It is said out loud rather than left as an absent pin. */
 if (!from) return { state: 'no-window', to, refusal: refusalById('no-position-shared').sentence };
 /* Where she actually is, which on the day is not where she started. She sets off so as to reach the
    suburb at the start of the window, so the distance closes as the hour approaches and the figure
    under it is arithmetic on the clock rather than a number that was true when the page opened.
    Both ends are suburb centres, at every moment of the leg: geography.json's no-doorstep-at-either-end
    read in both directions at once. */
 const leg = visit.start ? legTo(nurse.roster, to, instantOf(visit.date, visit.start, now), now) : null;
 const at = leg ? leg.at : from.at;
 const measured = etaFromRoute(routeFor(from, to));
 const eta = measured.minutes !== null ? measured
  : from.id === to.id || (leg !== null && leg.minutesIn >= leg.legMinutes)
   /* Same suburb, or she has reached yours. A straight line between one zone centre and itself is
      nought kilometres, and "1 minute away" is a promise about a doorstep this screen has refused to
      know about. */
   ? noEta(`She is in ${to.name}, which is your own suburb. There is no distance here to measure, and how long a nurse takes to reach a door on the same streets is not something this screen knows.`)
   : straightLineEta(at, to.at, { sourceLabel: 'arrival' });
 return { state: 'on-the-day', nurse, from, to, at, leg, eta };
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
