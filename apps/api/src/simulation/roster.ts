/**
 * A simulated nurse roster: nine fictional people, and the four of them it will not offer.
 *
 * ── What this stands in for ──────────────────────────────────────────────────────────────────
 *
 * `booking` is blocked on a workforce roster — the people MyThuso actually employs, with hours they
 * have actually agreed to work. Nobody can produce one from inside a repository, so this produces
 * what one would send: `packages/catalog/feeds.json` declares the shape as five fields, and every
 * event below carries exactly those five and nothing else.
 *
 * ── The refusals that make it worth having ───────────────────────────────────────────────────
 *
 * A roster that answers for everybody is a roster with no gate in front of it, and the gate is the
 * whole marketplace. So two facts are resolved on every read rather than stored as answers:
 *
 *   **Vetting.** `standingOf` is the service's own gate arithmetic, run over the party's checks
 *   against packages/catalog/vetting.json. Sister Ayanda Dube's police clearance ran out nine days
 *   ago; nobody suspended her and nobody has to remember to. She is refused here this morning
 *   because the subtraction says so, and she will be refused tomorrow for the same reason.
 *
 *   **Coverage.** Three of the nine work in Tembisa, Alexandra and other places phase one does not
 *   reach. packages/catalog/geography.json is the one Johannesburg, and a roster row naming a
 *   suburb it does not have would quietly extend a coverage claim the product makes in words on the
 *   SOS screen. So the zone is resolved against that file rather than passed through.
 *
 * The order the two are checked in is not arbitrary, and it is the opposite of the obvious one.
 * Coverage is asked first, because it is the fact that makes every other question moot: nothing
 * about a person's clearance changes whether MyThuso works in Tembisa, and a controller told "her
 * second reviewer is pending" about somebody who could never have been sent to that address has been
 * answered a question they did not ask. Vetting is then asked in two parts rather than one, because
 * a clearance that ran out last night and an application that has four checks left are different
 * facts about a person and the contract gives them different sentences — collapsing them would tell
 * an applicant halfway through her paperwork that something of hers had lapsed.
 *
 * ── Why there is no randomness in here at all ────────────────────────────────────────────────
 *
 * Nothing about a roster is random. A shift is a thing somebody agreed to, and a nurse who is on
 * duty at a different hour on every run is a demonstration nobody can repeat. The determinism this
 * simulator owes is that the same party always yields the same row, which it does by being a lookup
 * over a contract rather than a generator. The seeded reference on the event comes from `produced`.
 *
 * ── Why the shift is arithmetic and not two times ────────────────────────────────────────────
 *
 * The hours a nurse is rostered for are the hours the product actually offers, so they are computed
 * from packages/catalog/scheduling.json and packages/catalog/services.json rather than typed: half
 * an hour before the first slot, and half an hour after the last slot plus the longest visit anybody
 * can book. Typing 07:30 and 18:30 into this file would have made a nurse go off duty in the middle
 * of a visit on the day a slot or a duration changed.
 */
import roster from '../../../../packages/catalog/roster.json' with { type: 'json' };
import geography from '../../../../packages/catalog/geography.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import services from '../../../../packages/catalog/services.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { resolveState, standingOf, type ActorVetting, type CheckRecord, type CheckState } from '../protection/gate.ts';
import { distanceKm } from '../../../../packages/geo/index.ts';
import { gateProgress } from '../vetting/gates.ts';
import { rankForDispatch, trustScore, type TrustScore } from '../trust/index.ts';
import { refusalSaying, simulationOf } from './contract.ts';
import {
 isRefusal, produced, refuse, register,
 type SimulatedEvent, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';

/* ---- The contract, typed --------------------------------------------------------------------- */

type RosterCheck = { state?: string; expiresInDays?: number; secondedBy?: null; note?: string };
type RosterNurse = {
 id: string;
 name: string;
 reference: string;
 zone: string;
 scope: string[];
 sharesPosition: boolean;
 onAVisit?: boolean;
 declined?: boolean;
 declinedReason?: string;
 appealed?: boolean;
 fix?: string;
 checks?: Record<string, RosterCheck>;
};
export type Zone = { id: string; name: string; at: { lat: number; lng: number }; radiusKm: number };

const ROSTER_NURSES = roster.nurses as unknown as readonly RosterNurse[];
export const ZONES = geography.zones as readonly Zone[];
export const NURSE_ROLE = 'nurse';
const NURSE_CHECKS = vetting.roles.find(role => role.id === NURSE_ROLE)!.checks;

/* The internal authority's own name, used where a default check needs a seconder. It is looked up
   rather than invented so that no fictional reviewer's name is typed into the service — the vetting
   catalogue already says who MyThuso's own checks are decided by. */
const INTERNAL_REVIEWER = vetting.authorities.find(authority => authority.id === 'internal')!.name;

/** A suburb geography.json actually declares, matched on the name the roster writes. */
export const zoneNamed = (name: string): Zone | null =>
 ZONES.find(zone => zone.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

/* ---- Days, hours and the one timezone -------------------------------------------------------- */

const TIMEZONE = scheduling.timezone;
const SLOTS = scheduling.offer.slots;
const LONGEST_VISIT_MINUTES = Math.max(...services.map(service => service.duration));

export const isoIn = (at: Date): string =>
 new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/* The offset asked of the zone rather than assumed. South Africa has one and does not move it, which
   is precisely the circumstance in which a hard-coded +02:00 is never noticed until a supplier runs
   on UTC and every shift ends two hours early — which is the argument the feed's own `shiftStartsAt`
   field makes in packages/catalog/feeds.json. */
const offsetIn = (at: Date): string => {
 const named = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
  .formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
 return named.replace('GMT', '') || '+00:00';
};

const minutesOf = (hhmm: string): number => {
 const [hours, minutes] = hhmm.split(':').map(Number);
 return hours! * 60 + minutes!;
};
const clockOf = (minutes: number): string =>
 `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** When the shift begins and ends on a given day, as instants that state their offset. */
export function shiftOn(isoDate: string, at: Date = new Date()): { startsAt: string; endsAt: string } {
 const offset = offsetIn(at);
 const opens = minutesOf(SLOTS[0]!) - roster.shift.startsBeforeFirstSlotMinutes;
 const closes = minutesOf(SLOTS[SLOTS.length - 1]!) + LONGEST_VISIT_MINUTES + roster.shift.endsAfterLastVisitMinutes;
 return {
  startsAt: `${isoDate}T${clockOf(opens)}:00${offset}`,
  endsAt: `${isoDate}T${clockOf(closes)}:00${offset}`
 };
}

/* ---- The register ---------------------------------------------------------------------------- */

/**
 * One simulated nurse, with her zone resolved and her checks built.
 *
 * `records` holds only what the contract writes down as an exception, plus a verified row for every
 * other check the role carries. A default check deliberately carries no expiry: this side of the
 * boundary is modelling what an authority would answer *today*, not the decision date a reviewer's
 * console counts down from, and inventing one here would be a second set of dates for the web's own
 * fixture to disagree with. What both sides do have to agree about is the resolved state, and they
 * do — verified with no expiry, and verified with an expiry seven months out, are the same answer.
 */
export type SimulatedNurse = {
 id: string;
 name: string;
 reference: string;
 zoneName: string;
 zone: Zone | null;
 scope: readonly string[];
 sharesPosition: boolean;
 onAVisit: boolean;
 /** 'poor' where the contract declares a device that is permanently having a bad day. */
 fix: string | null;
 vetting: ActorVetting;
};

function recordsFor(nurse: RosterNurse): CheckRecord[] {
 return NURSE_CHECKS.map(check => {
  const exception = nurse.checks?.[check.id];
  const record: CheckRecord = { checkId: check.id, state: (exception?.state as CheckState | undefined) ?? 'verified' };
  if (exception?.expiresInDays !== undefined) {
   const on = new Date(Date.now() + exception.expiresInDays * 86_400_000);
   record.expiresOn = on.toISOString().slice(0, 10);
  }
  /* A high-risk check is not verified on one person's say-so. `secondedBy: null` in the contract is
     how a party is left waiting for the second reviewer; everything else gets one. */
  if (check.risk === 'high' && record.state === 'verified' && exception?.secondedBy !== null) record.secondedBy = INTERNAL_REVIEWER;
  return record;
 });
}

export const SIMULATED_NURSES: readonly SimulatedNurse[] = ROSTER_NURSES.map(nurse => ({
 id: nurse.id,
 name: nurse.name,
 reference: nurse.reference,
 zoneName: nurse.zone,
 zone: zoneNamed(nurse.zone),
 scope: nurse.scope,
 sharesPosition: nurse.sharesPosition,
 onAVisit: Boolean(nurse.onAVisit),
 fix: nurse.fix ?? null,
 vetting: {
  actorId: nurse.id,
  roleId: NURSE_ROLE,
  records: recordsFor(nurse),
  declined: nurse.declined,
  declinedReason: nurse.declinedReason
 }
}));

export const nurseById = (id: string): SimulatedNurse | null =>
 SIMULATED_NURSES.find(nurse => nurse.id === id) ?? null;

/** The gate's own answer about a party, resolved against the clock rather than trusted. */
export const standingFor = (nurse: SimulatedNurse, at: Date = new Date()) => standingOf(nurse.vetting, at.getTime());

/** Whether a check has run out, in the words the gate uses. Read by the credential simulator. */
export const checkStateFor = (nurse: SimulatedNurse, checkId: string, at: Date = new Date()): CheckState =>
 resolveState(nurse.vetting.records.find(record => record.checkId === checkId) ?? { checkId, state: 'outstanding' }, at.getTime());

/* ---- The simulator --------------------------------------------------------------------------- */

const CAPABILITY = 'booking';
const NOT_IN_THE_REGISTER = refusalSaying(CAPABILITY, /a time/);
const VETTING_HAS_LAPSED = refusalSaying(CAPABILITY, /has lapsed/);
const VETTING_UNFINISHED = refusalSaying(CAPABILITY, /not finished/);
const OUTSIDE_COVERAGE = refusalSaying(CAPABILITY, /can reach/);

export const nurseRoster: Simulator = {
 id: 'nurse-roster',
 feed: 'nurse-roster',
 capability: CAPABILITY,
 supplier: simulationOf(CAPABILITY).supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  const nurse = nurseById(request.subject);
  /* Anybody who is not one of the nine might be somebody. The register is the whole of what makes
     these people safe to roster, so a party outside it is refused rather than invented — which is
     the same sentence a real roster would need the day somebody pastes a name into it. */
  if (!nurse) return refuse(nurseRoster, request, NOT_IN_THE_REGISTER);
  if (!nurse.zone) return refuse(nurseRoster, request, OUTSIDE_COVERAGE);
  const at = request.at ?? new Date();
  const standing = standingFor(nurse, at);
  /* Lapsed and unfinished are two answers because they are two situations. A clearance that ran out
     last night is a person who was working yesterday and is not today, and somebody has to renew it;
     four checks still outstanding is an application, and somebody has to finish it. */
  if (standing.lapsed.length) return refuse(nurseRoster, request, VETTING_HAS_LAPSED);
  if (!standing.cleared) return refuse(nurseRoster, request, VETTING_UNFINISHED);
  const on = typeof request.detail?.on === 'string' ? request.detail.on : isoIn(at);
  const shift = shiftOn(on, at);
  return produced(nurseRoster, request, {
   partyId: nurse.id,
   zone: nurse.zone.id,
   scope: [...nurse.scope],
   shiftStartsAt: shift.startsAt,
   shiftEndsAt: shift.endsAt
  });
 }
};
register(nurseRoster);

/**
 * Everybody the roster would offer for a zone on a day, and everybody it would not.
 *
 * The refusals are returned beside the offers rather than filtered away, because a booking screen
 * that is told only who is free cannot say why the person a patient asked for is missing — and
 * "there is nobody" and "there is somebody and she is suspended" are different sentences that a
 * silent filter turns into the same one.
 */
export function rosterFor(zoneId: string, on: string, at: Date = new Date()) {
 const answers = SIMULATED_NURSES.map(nurse => nurseRoster.produce({ subject: nurse.id, at, detail: { on } }));
 const events = answers.filter((answer): answer is SimulatedEvent => !isRefusal(answer));
 return {
  offered: events.filter(event => event.payload.zone === zoneId),
  elsewhere: events.filter(event => event.payload.zone !== zoneId),
  refused: answers.filter(isRefusal)
 };
}

/* ---- Who is sent, in what order --------------------------------------------------------------

   "No Trust Score, no dispatch." The roster above answers who is on duty and cleared; this answers
   who a visit in a zone is offered to, and in what order — proximity first, then the Trust Score,
   which is the order the master document gives. Everybody the roster offers is scored from where they
   stand among the seven gates, resolved at `at`, and a person without a current, online score is
   never ranked: they come back in `withheld`, beside the ranking, with packages/catalog/trust.json's
   sentence, for the same reason the roster returns its refusals rather than filtering them away.

   Every nurse the roster clears scores today, so in the preview nobody it offers is withheld — which
   is the point rather than a gap: a score is computed from the same checks the roster was cleared
   on, and the two can only disagree if one of them is stored. `scoreOf` is injectable so that the
   case the rule exists for — a score that was never computed, or was computed yesterday and not
   since — can be produced and watched being refused. The distance is the straight line between two
   suburb centres, which is the only distance this product has and is labelled as one wherever it is
   printed. Nothing ranked carries the score's value or its reasons. */
export const trustScoreFor = (nurse: SimulatedNurse, at: Date = new Date()): TrustScore | null =>
 trustScore(nurse.id, gateProgress(nurse.vetting, at.getTime()), at.getTime());

export function dispatchFor(
 zoneId: string,
 at: Date = new Date(),
 scoreOf: (nurse: SimulatedNurse) => TrustScore | null = nurse => trustScoreFor(nurse, at)
) {
 const target = ZONES.find(zone => zone.id === zoneId) ?? null;
 const { offered, elsewhere, refused } = rosterFor(zoneId, isoIn(at), at);
 const candidates = [...offered, ...elsewhere]
  .map(event => nurseById(String(event.payload.partyId)))
  .filter((nurse): nurse is SimulatedNurse => nurse !== null)
  .map(nurse => ({ partyId: nurse.id, km: target && nurse.zone ? distanceKm(nurse.zone.at, target.at) : null, score: scoreOf(nurse) }));
 return { ...rankForDispatch(candidates, at.getTime()), refused };
}
