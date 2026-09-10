import contract from '../../../../packages/catalog/roster.json';
import { EARTH_RADIUS_KM, URBAN_SPEED_KMH, distanceKm, type LatLng } from '../../../../packages/geo/index.ts';
import { simulationRefusal } from './capabilities';
import { blur, refusalById as geographyRefusal, zoneByName, type Zone } from './geography';
import { initialsOf } from './names';
import { can, type Decision, type VettingSubject } from './vetting';
import { seededSubjects } from './vetting-fixtures';

/* The simulated roster, on the web's side of the boundary.
 *
 * ── Why this module exists at all ────────────────────────────────────────────────────────────
 *
 * `booking` is blocked on a workforce roster and `dispatch` on live positions from nurse devices,
 * and neither is going to arrive from inside a repository. What arrived instead is
 * packages/catalog/roster.json — nine fictional nurses — and two readers of it: apps/api simulates
 * the supplier's own feed shapes, and this reads the same nine for the screens.
 *
 * It replaces three lists that had drifted apart. features/Dispatch.tsx held five nurses with
 * coordinates typed beside them; lib/vetting-fixtures.ts held nine with checks and zones and no
 * coordinates; lib/arrival.ts held one, and said in its own header that a second copy of a person is
 * exactly the drift packages/catalog exists to stop. All three are this one now, and no screen types
 * a coordinate for anybody.
 *
 * ── What the web does not reproduce, deliberately ────────────────────────────────────────────
 *
 * The service's simulator varies each device's speed, its fix quality and where in her suburb a
 * nurse is standing, all seeded off the party id. None of that is here, because reproducing it would
 * mean a second copy of the same pseudo-random generator inside a browser bundle — one number in two
 * places, which is the thing this repository is arranged against. So the web's movement is
 * arithmetic with nothing random in it at all: a straight line between two suburb *centres* at
 * packages/geo's one urban speed, positioned by the clock. Everything the two sides must agree about
 * — who is rostered, in which suburb, who is cleared, whose phone is reporting, whose fix is too wide
 * to draw — is in the contract, and both read it.
 *
 * ── The refusals ─────────────────────────────────────────────────────────────────────────────
 *
 * Read from the capability, by the slug of the sentence's own words, exactly as the service reads
 * them. A booking screen that filters a suspended nurse out of a list silently cannot tell a patient
 * why the person she asked for is missing, and "there is nobody" and "there is somebody and she is
 * suspended" are different sentences.
 *
 * Nothing here reads a device. No geolocation permission is requested by this file or by anything it
 * calls, and every coordinate on every screen is a suburb centre out of packages/catalog/geography.json
 * moved along a line toward another one. */

export type RosterNurse = {
 id: string;
 name: string;
 initials: string;
 reference: string;
 /** As the contract writes it. It is not always a suburb dispatch can reach — that is the point. */
 zoneName: string;
 zone: Zone | undefined;
 scope: string[];
 sharesPosition: boolean;
 onAVisit: boolean;
 /** A device permanently reporting a fix measured in kilometres. Declared, never drawn. */
 poorFix: boolean;
 subject: VettingSubject;
};

type RosterRow = {
 id: string; name: string; reference: string; zone: string; scope: string[];
 sharesPosition: boolean; onAVisit?: boolean; fix?: string;
};

export const positions = contract.positions;

export const rosterNurses: RosterNurse[] = (contract.nurses as RosterRow[]).map(row => ({
 id: row.id,
 name: row.name,
 initials: initialsOf(row.name),
 reference: row.reference,
 zoneName: row.zone,
 zone: zoneByName(row.zone),
 scope: row.scope,
 sharesPosition: row.sharesPosition,
 onAVisit: Boolean(row.onAVisit),
 poorFix: row.fix === 'poor',
 /* The vetting record is the console's own, not a second copy: the fixtures are built from this
    same contract, so a nurse suspended in the console is refused here by the same arithmetic. */
 subject: seededSubjects.find(subject => subject.id === row.id)!
}));

export const nurseById = (id: string) => rosterNurses.find(nurse => nurse.id === id);
export const nurseByName = (name: string) => rosterNurses.find(nurse => nurse.name === name);
/** The gate's answer, asked before a name is offered rather than after. */
export const mayTakeAVisit = (nurse: RosterNurse): Decision => can(nurse.subject, 'take-visit');

/* ---- What the roster will not do ------------------------------------------------------------
   The sentences are the booking capability's, looked up by the slug of their own words so that a
   reworded contract stops the screen rather than leaving it refusing in words nobody says. */
export const rosterRefusals = {
 outsideCoverage: simulationRefusal('booking', 'book-outside-a-zone-dispatch-can-reach'),
 lapsed: simulationRefusal('booking', 'offer-a-nurse-whose-simulated-vetting-has-lapsed'),
 unfinished: simulationRefusal('booking', 'offer-a-nurse-whose-vetting-has-not-finished'),
 notAPerson: simulationRefusal('booking', 'commit-a-real-person-to-a-time')
} as const;

/**
 * Why the roster will not offer this nurse, or nothing.
 *
 * The order is the service's: coverage first, because it is the fact that makes every other question
 * moot — nothing about a person's clearance changes whether MyThuso works in Tembisa. Then a lapse,
 * then an unfinished application, because a clearance that ran out last night and four checks still
 * outstanding are different situations and a screen that gave them one sentence would tell an
 * applicant halfway through her paperwork that something of hers had lapsed.
 */
export function refusalFor(nurse: RosterNurse): string | null {
 if (!nurse.zone) return rosterRefusals.outsideCoverage;
 const decision = mayTakeAVisit(nurse);
 if (decision.allowed) return null;
 const lapsed = nurse.subject.records.some(record => record.expiresOn && Date.parse(`${record.expiresOn}T00:00:00Z`) < Date.now());
 return lapsed ? rosterRefusals.lapsed : rosterRefusals.unfinished;
}

export type Offer = { nurse: RosterNurse; refusal: string | null };
/**
 * Everybody the roster would offer for a suburb, and everybody it would not.
 *
 * The refusals come back beside the offers rather than being filtered away. A silent filter cannot
 * tell a patient why the nurse she was seen by last time is not on the list, and a controller who
 * cannot see a suspended nurse wonders where she went rather than reading the reason.
 */
export function offersFor(zoneName: string): { offered: RosterNurse[]; refused: Offer[]; elsewhere: RosterNurse[] } {
 const answers: Offer[] = rosterNurses.map(nurse => ({ nurse, refusal: refusalFor(nurse) }));
 const free = answers.filter(answer => !answer.refusal).map(answer => answer.nurse);
 const here = zoneByName(zoneName);
 return {
  offered: free.filter(nurse => nurse.zone?.id === here?.id),
  elsewhere: free.filter(nurse => nurse.zone?.id !== here?.id),
  refused: answers.filter(answer => answer.refusal)
 };
}

/**
 * The nurse a visit in this suburb is booked against.
 *
 * Her own suburb first, then the nearest cleared nurse to it — by the straight line between two
 * suburb centres, which is the only distance this product has and says so wherever it prints one. A
 * nurse already on a visit is not offered: what decides when she is free is when that visit ends,
 * and nothing here knows that. Deterministic: the same suburb yields the same nurse on every machine.
 */
export function assignedTo(zoneName: string): RosterNurse | undefined {
 const { offered, elsewhere } = offersFor(zoneName);
 const here = zoneByName(zoneName);
 const free = [...offered, ...elsewhere].filter(nurse => !nurse.onAVisit);
 if (!here) return free[0];
 return [...free].sort((a, b) =>
  (a.zone ? distanceKm(a.zone.at, here.at) : Infinity) - (b.zone ? distanceKm(b.zone.at, here.at) : Infinity)
  || a.id.localeCompare(b.id))[0];
}

/* ---- Where the board may draw her ------------------------------------------------------------ */

export type Placement =
 | { drawn: true; at: LatLng }
 | { drawn: false; refusal: string; why: string };

/* A nurse does not stand on the pin at the centre of her suburb, and two nurses in Soweto must not
   stand on each other. The offset is a fraction of the suburb's own working radius, at an angle
   taken from her position in the list of people working there — arithmetic rather than a coordinate
   somebody typed, and the same on every machine. */
const RING_SHARE = 0.45;
/* Degrees from kilometres, off the radius packages/geo already holds. A second 111.19 typed here
   would be a second Earth. */
const KM_PER_DEGREE_LAT = Math.PI * EARTH_RADIUS_KM / 180;
function standingPoint(nurse: RosterNurse, zone: Zone): LatLng {
 const inZone = rosterNurses.filter(other => other.zone?.id === zone.id);
 const index = inZone.findIndex(other => other.id === nurse.id);
 const angle = 2 * Math.PI * index / Math.max(inZone.length, 3);
 const km = zone.radiusKm * RING_SHARE;
 return blur({
  lat: zone.at.lat + Math.cos(angle) * km / KM_PER_DEGREE_LAT,
  lng: zone.at.lng + Math.sin(angle) * km / (KM_PER_DEGREE_LAT * Math.cos(zone.at.lat * Math.PI / 180))
 });
}

/**
 * Where a board may draw her, or the sentence saying why it may not.
 *
 * Three refusals, all of them geography.json's own words. A phone in a bag has no position and the
 * board says so rather than placing her somewhere plausible — an empty space is a true statement
 * about a device and a guessed pin is a false statement about a person. A nurse working outside
 * phase one is not on this map. And a fix wider than the suburb it would be drawn in is not drawn:
 * rendered at 110-metre precision it would look exactly as certain as a good one, and a person
 * waiting at home reads a dot on a map as a fact.
 */
export function placeOf(nurse: RosterNurse): Placement {
 const refuse = (id: string): Placement => {
  const refusal = geographyRefusal(id);
  return { drawn: false, refusal: refusal.sentence, why: refusal.why };
 };
 if (!nurse.zone) return refuse('outside-coverage');
 if (!nurse.sharesPosition) return refuse('no-position-shared');
 if (nurse.poorFix && positions.poorFixMetres > nurse.zone.radiusKm * 1000) return refuse('fix-wider-than-the-suburb');
 return { drawn: true, at: standingPoint(nurse, nurse.zone) };
}

/* ---- The leg, and how far along it she is ---------------------------------------------------- */

export type Leg = {
 from: Zone;
 to: Zone;
 /** Where she is at the moment asked about, rounded to the precision the contract declares. */
 at: LatLng;
 legMinutes: number;
 /** When she would have to set off to arrive at the window. Derived, never promised. */
 departAt: Date | null;
 minutesIn: number;
 onTheWay: boolean;
};

/**
 * A nurse moving between two suburbs, positioned by the clock and by nothing else.
 *
 * She sets off so as to reach the suburb at the start of the window she was booked for, and how far
 * along she is is the arithmetic of that: before she sets off she is in her own suburb with the
 * whole distance still to cover, and the last stretch closes in real time. The screen ticks so the
 * figure under it is live rather than frozen at whatever it was when the page opened.
 *
 * Both ends are suburb centres. geography.json's `no-doorstep-at-either-end` is the rule read in
 * both directions at once — the patient's door is protected from the board, and the nurse's position
 * is protected from the patient — and this is the arithmetic that makes it true rather than the
 * paragraph that says it.
 */
export function legTo(nurse: RosterNurse, to: Zone, arriveAt: Date | null, now: Date = new Date()): Leg | null {
 const from = nurse.zone;
 if (!from) return null;
 const km = distanceKm(from.at, to.at);
 const legMinutes = Math.max(1, Math.round(km / URBAN_SPEED_KMH * 60));
 if (!arriveAt) return { from, to, at: blur(from.at), legMinutes, departAt: null, minutesIn: 0, onTheWay: false };
 const departAt = new Date(arriveAt.getTime() - legMinutes * 60_000);
 const minutesIn = Math.min(legMinutes, Math.max(0, (now.getTime() - departAt.getTime()) / 60_000));
 const progress = minutesIn / legMinutes;
 return {
  from, to, legMinutes, departAt, minutesIn,
  onTheWay: minutesIn > 0,
  at: blur({
   lat: from.at.lat + (to.at.lat - from.at.lat) * progress,
   lng: from.at.lng + (to.at.lng - from.at.lng) * progress
  })
 };
}
