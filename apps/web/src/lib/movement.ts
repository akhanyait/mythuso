import { useSyncExternalStore } from 'react';
import consentText from '../../../../packages/catalog/consent.json?raw';
import sharing from '../../../../packages/catalog/passport-sharing.json';
import gateway from '../../../../packages/catalog/passport-gateway.json';
import records from '../../../../packages/catalog/records.json';
import {
 DAY, MINUTE, bedCategories, checklist, declineReasons, decisions, facilities, facilityOf, informationAsked, labelIn, movementContract,
 p2Reasons, priorities, receivingPoints, receivingRoles, tripStates, zones, type Refusal, type Result
} from '../../../../packages/engines/src/movement/domain/contract.ts';
import { acceptTrip, declineTrip, handOverTrip, offersToMake, requestTrip, windowClosesAt, type Offer, type Trip } from '../../../../packages/engines/src/movement/domain/trips.ts';
import { arrive, askForMore, decide, handOver, presentationOf, requestAdmission, type Admission } from '../../../../packages/engines/src/movement/domain/admissions.ts';
import { packetEndsAt, packetPolicyOf, packetStateOf, sendPacket, type HeardLink, type Packet, type PacketState } from '../../../../packages/engines/src/movement/domain/packet.ts';
import { searchFacilities } from '../../../../packages/engines/src/movement/domain/facilities.ts';
import { movementSettingsNow, recordSettingsNow, useSettingsHistories } from './settings';
import { whoIs } from './roles';

/* Thuso Ride and admissions in the web preview: one store, in this tab's memory and nowhere else.
 *
 * Every rule is the engine's. This file holds the trips, the offers to the preview's one responder, the admissions,
 * the links the Passport stand-in made and the packets sent, and hands every act to
 * packages/engines/src/movement/domain. Nothing is written to the browser's storage, so a reload forgets a trip
 * requested here, and the screens say so in the contract's sentence.
 *
 * WHO ACTS. The nurse and the doctor are the vetting register's own N-205 and D-401, and whether either may set a
 * P2 is what the register says of them today, through lib/roles.ts. The responder is the contract's synthetic
 * R-311, whom the preview treats as verified and online: packages/catalog/vetting.json has no responder role, so on
 * the engine runtime nobody is, and the desk screen says that in the contract's words.
 *
 * WHAT A PASSPORT LINK IS HERE. The Health Passport P0 runs on a developer's machine and nothing in this tab reaches
 * it. When the desk sends a packet, a stand-in makes the link the Passport would make — an emergency card on the
 * trip's grant, lasting the Record setting in force or Record's bound for that grant, whichever is shorter — and the
 * domain decides whether it may be sent, exactly as the engine does when the Passport announces a real one.
 *
 * WHY consent.json IS READ AS TEXT. It is on the patient's first load for the consent screen, and a JSON import from
 * this lazy module would keep its grant roles in that chunk; lib/share-links.ts reads it the same way for the same
 * reason.
 *
 * A PENDING BED. Every admission a screen draws is drawn from presentationOf(), the domain's one reader of the
 * contract's states, which refuses to load a contract whose pending state confirms a destination.
 */

const PACKET_POLICY = packetPolicyOf(JSON.parse(consentText), sharing);
const preview = movementContract.preview;
export const PATIENT_REF = preview.patientRef;
export const RESPONDER_REF = preview.responderRef;
export const words = movementContract;
export type ClinicianRole = 'nurse' | 'doctor';
export const clinicianRefOf = (role: ClinicianRole): string => preview.clinicianRoles[role];
export { bedCategories, checklist, declineReasons, decisions, facilities, facilityOf, informationAsked, labelIn, p2Reasons, presentationOf, priorities, receivingPoints, receivingRoles, tripStates, zones };
export type { Admission, PacketState, Refusal, Trip };

type State = {
 readonly trips: readonly Trip[];
 readonly offers: readonly Offer[];
 readonly admissions: readonly Admission[];
 readonly links: readonly HeardLink[];
 readonly packets: readonly Packet[];
 readonly counter: number;
};

const iso = (at: number) => new Date(at).toISOString();
const value = <T>(result: Result<T>): T => {
 if (!result.ok) throw new Error(`The seeded Thuso Ride preview was refused by the engine: ${result.refusal.statement}`);
 return result.value;
};
const responderOnline = (now: number) => [{ responderRef: RESPONDER_REF, online: true, lastBeatAt: now }];

/* The preview's trip and admissions are made by running the engine's own arithmetic a few minutes ago, so a
   wait-listed admission is what decide() answers and not a state typed onto a row.
 *
 * The order is the whole of it: the admission was asked for first, answered a while later, and the trip requested after
 * that. Written as that order rather than as three separate numbers of minutes, because a bare number of minutes in a
 * file that reads an engine's settings is indistinguishable from a typed copy of one of them — this file reads Record's
 * card lifetime, and its "ten minutes ago" was exactly Record's hl7-clock-skew-minutes default once the HL7 bridge
 * landed beside it. A step of the sequence collides with nothing, and the preview reads the same. */
const SEEDED_STEPS = 4;
const STEP = 5 * MINUTE;
const stepsAgo = (now: number, steps: number) => now - steps * STEP;
function seed(now: number): State {
 const settings = movementSettingsNow();
 let admissions: Admission[] = preview.admissions.map(a => value(requestAdmission({
  admissionRef: a.ref, subjectRef: PATIENT_REF, facilityRef: a.facilityRef, bedCategory: a.bedCategory, priorityCode: a.priorityCode,
  arrivalWindowStart: iso(now + a.arrivalInMinutes * MINUTE), byRole: 'doctor'
 }, stepsAgo(now, SEEDED_STEPS))));
 admissions = admissions.map(adm => {
  const decision = preview.admissions.find(a => a.ref === adm.admissionRef)?.decision;
  return decision ? value(decide(adm, { decisionCode: decision, alternativeOffered: false, simulated: true }, stepsAgo(now, 2))).admission : adm;
 });
 const trips = preview.trips.map(t => value(requestTrip({
  tripRef: t.ref, subjectRef: PATIENT_REF, priorityClass: t.priorityClass, pickupWindowStart: iso(now + t.pickupInMinutes * MINUTE), zoneId: t.pickupZoneId,
  facilityRef: t.destinationFacilityRef, admissionRef: t.admissionRef, byRole: t.requestedByRole, byRef: clinicianRefOf(t.requestedByRole as ClinicianRole)
 }, { now: stepsAgo(now, 1), settings, callerCleared: false, admissionKnown: ref => admissions.some(a => a.admissionRef === ref) })));
 const offers = trips.flatMap(trip => offersToMake(trip, [], responderOnline(now)).map(responderRef => ({ tripRef: trip.tripRef, responderRef, offeredAt: stepsAgo(now, 1), declinedAt: null })));
 return { trips, offers, admissions, links: [], packets: [], counter: 1 };
}

let state: State | undefined;
const listeners = new Set<() => void>();
const current = (): State => (state ??= seed(Date.now()));
const told = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const next = (change: (s: State) => Partial<State>) => { const s = current(); state = { ...s, ...change(s), counter: s.counter + 1 }; told(); };
const reference = (prefix: string) => `${prefix}-${String(1000 + current().counter).slice(-4)}`;

/** The store, re-read when it changes or when an admin changes a Movement or Record setting. */
export function useMovement(): State {
 useSettingsHistories();
 return useSyncExternalStore(subscribe, current, current);
}

/* ---- Trips -------------------------------------------------------------------------------------- */

export type TripAsk = { readonly priorityClass: string; readonly zoneId: string; readonly facilityRef: string; readonly pickupInMinutes: number; readonly priorityReasonCode?: string };

/** A trip requested by the nurse or the doctor, in their own name, and offered to the preview's responder. */
export function requestTripAs(role: ClinicianRole, ask: TripAsk): Result<Trip> {
 const now = Date.now();
 const byRef = clinicianRefOf(role);
 const made = requestTrip({
  tripRef: reference('TRIP'), subjectRef: PATIENT_REF, priorityClass: ask.priorityClass, pickupWindowStart: iso(now + ask.pickupInMinutes * MINUTE),
  zoneId: ask.zoneId, facilityRef: ask.facilityRef, priorityReasonCode: ask.priorityReasonCode, prioritySetByRef: byRef, byRole: role, byRef
 }, { now, settings: movementSettingsNow(), callerCleared: whoIs(byRef, '').state.cleared, admissionKnown: ref => current().admissions.some(a => a.admissionRef === ref) });
 if (made.ok) next(s => ({
  trips: [...s.trips, made.value],
  offers: [...s.offers, ...offersToMake(made.value, s.offers, responderOnline(now)).map(responderRef => ({ tripRef: made.value.tripRef, responderRef, offeredAt: now, declinedAt: null }))]
 }));
 return made;
}

const offerFor = (tripRef: string) => current().offers.find(o => o.tripRef === tripRef && o.responderRef === RESPONDER_REF);
export const tripsRequestedBy = (role: ClinicianRole, s: State) => s.trips.filter(t => t.requestedByRef === clinicianRefOf(role));
export const offeredToResponder = (s: State) => s.trips.filter(t => t.stateCode === 'requested' && s.offers.some(o => o.tripRef === t.tripRef && o.responderRef === RESPONDER_REF && o.declinedAt === null));
export const responderTrips = (s: State) => s.trips.filter(t => t.responderRef === RESPONDER_REF);
export const windowClosesFor = windowClosesAt;

export function acceptAsResponder(tripRef: string): Result<Trip> {
 const now = Date.now();
 const trip = current().trips.find(t => t.tripRef === tripRef);
 const taken = acceptTrip(trip, offerFor(tripRef), { ref: RESPONDER_REF, cleared: true }, now);
 if (taken.ok) next(s => ({ trips: s.trips.map(t => t.tripRef === tripRef ? taken.value : t) }));
 return taken;
}
export function declineAsResponder(tripRef: string): Result<Offer> {
 const trip = current().trips.find(t => t.tripRef === tripRef);
 const declined = declineTrip(trip, offerFor(tripRef), Date.now());
 if (declined.ok) next(s => ({ offers: s.offers.map(o => o.tripRef === tripRef && o.responderRef === RESPONDER_REF ? declined.value : o) }));
 return declined;
}
export function handOverAsResponder(tripRef: string, receivingRole: string, checklistComplete: boolean): Result<Trip> {
 const trip = current().trips.find(t => t.tripRef === tripRef);
 const handed = handOverTrip(trip, { byRef: RESPONDER_REF, receivingRole, checklistComplete }, Date.now());
 if (handed.ok) next(s => ({ trips: s.trips.map(t => t.tripRef === tripRef ? handed.value : t) }));
 return handed;
}
/** The emergency summary is open to the responder only while their trip is under way, inside its window. */
export const summaryOpenFor = (trip: Trip, now = Date.now()): boolean => trip.stateCode === 'accepted' && trip.responderRef === RESPONDER_REF && now < windowClosesAt(trip);

/* ---- Admissions -------------------------------------------------------------------------------- */

export type AdmissionAsk = { readonly facilityRef: string; readonly bedCategory: string; readonly priorityCode: string; readonly arrivalInMinutes: number };

export function requestAdmissionAs(ask: AdmissionAsk): Result<Admission> {
 const now = Date.now();
 const made = requestAdmission({ admissionRef: reference('ADM'), subjectRef: PATIENT_REF, facilityRef: ask.facilityRef, bedCategory: ask.bedCategory, priorityCode: ask.priorityCode, arrivalWindowStart: iso(now + ask.arrivalInMinutes * MINUTE), byRole: 'ops-desk' }, now);
 if (made.ok) next(s => ({ admissions: [made.value, ...s.admissions] }));
 return made;
}
const replace = (admission: Admission) => next(s => ({ admissions: s.admissions.map(a => a.admissionRef === admission.admissionRef ? admission : a) }));
const admissionOf = (ref: string) => current().admissions.find(a => a.admissionRef === ref);

/* Every facility answer here is simulated and says so: the facility-decision door refuses every payload, so the
   desk records one only as simulated, and the domain refuses one that is not. */
export function simulateDecision(ref: string, answer: { readonly decisionCode: string; readonly receivingPoint?: string; readonly reasonCode?: string; readonly alternativeOffered: boolean }): Result<Admission> {
 const decided = decide(admissionOf(ref), { ...answer, simulated: true }, Date.now());
 if (!decided.ok) return decided;
 replace(decided.value.admission);
 return { ok: true, value: decided.value.admission };
}
export function simulateMoreInformation(ref: string, informationCode: string): Result<Admission> {
 const asked = askForMore(admissionOf(ref), { informationCode, simulated: true });
 if (asked.ok) replace(asked.value);
 return asked;
}
export function simulateArrival(ref: string, receivingPoint: string, agreedWithPretriage: boolean): Result<Admission> {
 const arrived = arrive(admissionOf(ref), { receivingPoint, agreedWithPretriage, simulated: true }, Date.now());
 if (arrived.ok) replace(arrived.value);
 return arrived;
}
export function simulateHandover(ref: string, receivingRole: string): Result<Admission> {
 const handed = handOver(admissionOf(ref), { receivingRole, encounterRef: `Encounter/synthetic-${ref}`, simulated: true }, Date.now());
 if (handed.ok) replace(handed.value);
 return handed;
}

/** The desk sends the packet: the Passport stand-in makes the emergency card link, and the domain decides whether it goes. */
export function sendPacketFor(ref: string): Result<Packet> {
 const now = Date.now();
 const lifetimeDays = Math.min(recordSettingsNow().cardLifetimeDays, PACKET_POLICY.boundDays);
 const link: HeardLink = { linkRef: reference('LINK'), purpose: PACKET_POLICY.purposes[0] ?? '', expiresAt: now + lifetimeDays * DAY, heardAt: now };
 const sent = sendPacket(admissionOf(ref), link, PACKET_POLICY, now);
 if (sent.ok) next(s => ({ links: [...s.links, link], packets: [...s.packets.filter(p => p.admissionRef !== ref), sent.value] }));
 return sent;
}
export const packetFor = (s: State, ref: string) => s.packets.find(p => p.admissionRef === ref);
export const packetStateFor = (s: State, admission: Admission, now = Date.now()): PacketState => packetStateOf(packetFor(s, admission.admissionRef), admission, now);
export const packetEndsFor = packetEndsAt;
export const packetGrantRole = PACKET_POLICY.grantRole;
/* What the emergency summary opens, by the names the record gives its categories: the words a responder reads, and
   never an entry. Read from the Passport gateway's contract here, because the Passport P1 screens' lib is reached only
   by import() and a responder's panel is not a reason to pull it in. */
export const emergencySummarySaid = gateway.emergencySummary.categories.map(id => records.records.find(record => record.id === id)?.name ?? id).join(', ');

/* ---- The directory ----------------------------------------------------------------------------- */

export const directory = (zoneId?: string, bedCategory?: string) => searchFacilities({ zoneId: zoneId || undefined, bedCategory: bedCategory || undefined });
