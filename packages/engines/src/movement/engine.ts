/* Movement on the engine runtime: Thuso Ride trips, responder heartbeats, the synthetic facility directory,
 * admission requests whose facility answer is simulated, and the pre-arrival packet.
 *
 * THUSO RIDE IS NOT AN AMBULANCE. POST /v1/movement/trips@2 refuses a P1 before it reads anything else, the trips
 * table cannot hold one, and POST /v1/movement/ems-requests@1 refuses every request because no licensed ambulance
 * partner is connected. Nothing here calls another engine or names an ambulance route, and nothing sends a P1
 * anywhere.
 *
 * A POSITION ONLY INSIDE A TRIP'S WINDOW. A heartbeat's position is kept only for a trip the responder accepted,
 * one row per trip and never a track, refused after the window, and dropped by the tick once the window and the
 * retention the trip was requested with have passed. A read after that is refused by the same arithmetic,
 * whether or not the tick has run.
 *
 * A PENDING BED IS NEVER BOOKED. The admission read route answers pending and destinationConfirmed from
 * packages/engines/src/movement/domain/admissions.ts presentationOf(), the one reader of the contract's states.
 * A facility's answer is recorded only when it says it is simulated, because the facility-decision door refuses
 * every payload.
 *
 * NO CLINICAL CONTENT. Every table below holds references, codes, states and times. Why a patient travels or is
 * admitted is in the Health Passport; the packet is a link's reference and when it ends, never its secret and
 * never what it opens. scripts/check-boundaries.mjs holds the schema to that.
 *
 * HEARD. person.verified, suspended, reinstated and deactivated, for whether a responder may be online and a
 * clinician may set a P2; passport.share.link_created, to know a link the Passport made — its reference, purpose
 * and end, kept no longer than it could ever be sent as a packet — and passport.share.link_used, to record that a
 * facility opened a packet, and that an open came after the packet ended.
 *
 * SETTINGS. The heartbeat interval and who counts as online are read when a heartbeat arrives or an offer is
 * made; a trip keeps the offers at once, the window and the retention it was requested with. The routes are
 * bound through packages/engines/src/settings.
 *
 * Nothing here is a real service: no trip reaches a responder, no vehicle moves and no facility is asked.
 */
import { randomUUID } from 'node:crypto';
import consent from '../../../catalog/consent.json' with { type: 'json' };
import sharing from '../../../catalog/passport-sharing.json' with { type: 'json' };
import { defineEngine, instant, ok, refuse, type BusEvent, type EngineContext, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, historyOf, settingsRoutes } from '../settings/routes.ts';
import { isoDayOf, movementContract, priorityOf, refusal } from './domain/contract.ts';
import { movementInForce, movementSettings, type MovementInForce } from './domain/settings.ts';
import { STANDING_EVENTS, clearedOn, learn, type Standing } from './domain/standing.ts';
import {
 acceptTrip, declineTrip, handOverTrip, isOnline, offersToMake, requestTrip, windowClosesAt, type Offer, type Responder, type Trip
} from './domain/trips.ts';
import { heartbeat, mustDrop, readPosition, type Position } from './domain/positions.ts';
import { arrive, askForMore, decide, handOver, presentationOf, requestAdmission, type Admission } from './domain/admissions.ts';
import { heardLinkKeptUntil, heardOpen, packetEndsAt, packetPolicyOf, packetStateOf, sendPacket, type HeardLink, type Packet } from './domain/packet.ts';
import { searchFacilities } from './domain/facilities.ts';

const PACKET_POLICY = packetPolicyOf(consent, sharing);

/* The P1 the contract routes nowhere. While packages/catalog/movement.json names no route for it, the P1 route
   has nothing to hand a request to, and refuses in the contract's sentence. */
const AMBULANCE_PARTNER = priorityOf('P1')?.routedTo ?? null;

const schema = [
 'CREATE TABLE IF NOT EXISTS movement_trips (',
 ' trip_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 " priority_class TEXT NOT NULL CHECK (priority_class IN ('P2', 'P3')),",
 ' priority_reason_code TEXT,',
 ' priority_set_by_ref TEXT,',
 ' pickup_window_start INTEGER NOT NULL,',
 ' zone_id TEXT NOT NULL,',
 ' facility_ref TEXT NOT NULL,',
 ' admission_ref TEXT,',
 ' requested_by_role TEXT NOT NULL,',
 ' requested_by_ref TEXT,',
 ' requested_at INTEGER NOT NULL,',
 ' offers_at_once INTEGER NOT NULL,',
 ' trip_window_minutes INTEGER NOT NULL,',
 ' position_retention_minutes INTEGER NOT NULL,',
 ' settings_version INTEGER NOT NULL,',
 ' state_code TEXT NOT NULL,',
 ' responder_ref TEXT,',
 ' accepted_at INTEGER,',
 ' handed_over_at INTEGER,',
 ' receiving_role TEXT',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_offers (',
 ' trip_ref TEXT NOT NULL,',
 ' responder_ref TEXT NOT NULL,',
 ' offered_at INTEGER NOT NULL,',
 ' declined_at INTEGER,',
 ' PRIMARY KEY (trip_ref, responder_ref)',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_responders (',
 ' responder_ref TEXT PRIMARY KEY,',
 ' online INTEGER NOT NULL,',
 ' last_beat_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_positions (',
 ' trip_ref TEXT PRIMARY KEY,',
 ' lat REAL NOT NULL,',
 ' lng REAL NOT NULL,',
 ' reported_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_standing (',
 ' subject_ref TEXT NOT NULL,',
 ' role TEXT NOT NULL,',
 ' verified_until TEXT,',
 ' stopped INTEGER NOT NULL,',
 ' ended INTEGER NOT NULL,',
 ' heard_at TEXT NOT NULL,',
 ' PRIMARY KEY (subject_ref, role)',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_admissions (',
 ' admission_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 ' facility_ref TEXT NOT NULL,',
 ' bed_category TEXT NOT NULL,',
 " priority_code TEXT NOT NULL CHECK (priority_code IN ('P2', 'P3')),",
 ' arrival_window_start INTEGER NOT NULL,',
 ' requested_by_role TEXT NOT NULL,',
 ' requested_at INTEGER NOT NULL,',
 ' state_code TEXT NOT NULL,',
 ' receiving_point TEXT,',
 ' reason_code TEXT,',
 ' alternative_offered INTEGER NOT NULL,',
 ' information_code TEXT,',
 ' decision_simulated INTEGER NOT NULL,',
 ' decided_at INTEGER,',
 ' arrived_at INTEGER,',
 ' agreed_with_pretriage INTEGER,',
 ' handed_over_at INTEGER,',
 ' receiving_role TEXT,',
 ' encounter_ref TEXT',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_links_heard (',
 ' link_ref TEXT PRIMARY KEY,',
 ' purpose TEXT NOT NULL,',
 ' expires_at INTEGER NOT NULL,',
 ' heard_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS movement_packets (',
 ' admission_ref TEXT PRIMARY KEY,',
 ' link_ref TEXT NOT NULL,',
 ' sent_at INTEGER NOT NULL,',
 ' link_ends_at INTEGER NOT NULL,',
 ' opened_at INTEGER,',
 ' opened_by_role TEXT,',
 ' opened_after_end INTEGER NOT NULL',
 ');',
 SETTINGS_SCHEMA
].join('\n');

const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const at = (ms: number) => instant(new Date(ms));
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const settingsOf = (ctx: EngineContext): MovementInForce => movementInForce(historyOf(ctx.store));

/* ── The store ────────────────────────────────────────────────────────────────────────────────────── */

type TripRow = {
 trip_ref: string; subject_ref: string; priority_class: string; priority_reason_code: string | null; priority_set_by_ref: string | null; pickup_window_start: number;
 zone_id: string; facility_ref: string; admission_ref: string | null; requested_by_role: string; requested_by_ref: string | null; requested_at: number;
 offers_at_once: number; trip_window_minutes: number; position_retention_minutes: number; settings_version: number; state_code: string;
 responder_ref: string | null; accepted_at: number | null; handed_over_at: number | null; receiving_role: string | null;
};
const TRIP_COLUMNS = 'trip_ref, subject_ref, priority_class, priority_reason_code, priority_set_by_ref, pickup_window_start, zone_id, facility_ref, admission_ref, requested_by_role, requested_by_ref, requested_at, offers_at_once, trip_window_minutes, position_retention_minutes, settings_version, state_code, responder_ref, accepted_at, handed_over_at, receiving_role';
const tripFrom = (r: TripRow): Trip => ({
 tripRef: r.trip_ref, subjectRef: r.subject_ref, priorityClass: r.priority_class as 'P2' | 'P3', priorityReasonCode: r.priority_reason_code, prioritySetByRef: r.priority_set_by_ref,
 pickupWindowStart: r.pickup_window_start, zoneId: r.zone_id, facilityRef: r.facility_ref, admissionRef: r.admission_ref, requestedByRole: r.requested_by_role,
 requestedByRef: r.requested_by_ref, requestedAt: r.requested_at, offersAtOnce: r.offers_at_once, tripWindowMinutes: r.trip_window_minutes,
 positionRetentionMinutes: r.position_retention_minutes, settingsVersion: r.settings_version, stateCode: r.state_code as Trip['stateCode'],
 responderRef: r.responder_ref, acceptedAt: r.accepted_at, handedOverAt: r.handed_over_at, receivingRole: r.receiving_role
});
const tripByRef = (ctx: EngineContext, ref: unknown) => {
 const row = ctx.store.prepare(`SELECT ${TRIP_COLUMNS} FROM movement_trips WHERE trip_ref = ?`).get(text(ref)) as TripRow | undefined;
 return row ? tripFrom(row) : undefined;
};
const tripsIn = (ctx: EngineContext, state: string) =>
 (ctx.store.prepare(`SELECT ${TRIP_COLUMNS} FROM movement_trips WHERE state_code = ? ORDER BY requested_at, trip_ref`).all(state) as TripRow[]).map(tripFrom);
const insertTrip = (ctx: EngineContext, t: Trip) => ctx.store.prepare(`INSERT INTO movement_trips (${TRIP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
 .run(t.tripRef, t.subjectRef, t.priorityClass, t.priorityReasonCode, t.prioritySetByRef, t.pickupWindowStart, t.zoneId, t.facilityRef, t.admissionRef, t.requestedByRole,
  t.requestedByRef, t.requestedAt, t.offersAtOnce, t.tripWindowMinutes, t.positionRetentionMinutes, t.settingsVersion, t.stateCode, t.responderRef, t.acceptedAt, t.handedOverAt, t.receivingRole);
const putTripState = (ctx: EngineContext, t: Trip) => ctx.store.prepare('UPDATE movement_trips SET state_code = ?, responder_ref = ?, accepted_at = ?, handed_over_at = ?, receiving_role = ? WHERE trip_ref = ?')
 .run(t.stateCode, t.responderRef, t.acceptedAt, t.handedOverAt, t.receivingRole, t.tripRef);

type OfferRow = { trip_ref: string; responder_ref: string; offered_at: number; declined_at: number | null };
const offerFrom = (r: OfferRow): Offer => ({ tripRef: r.trip_ref, responderRef: r.responder_ref, offeredAt: r.offered_at, declinedAt: r.declined_at });
const offersFor = (ctx: EngineContext, tripRef: string) =>
 (ctx.store.prepare('SELECT trip_ref, responder_ref, offered_at, declined_at FROM movement_offers WHERE trip_ref = ?').all(tripRef) as OfferRow[]).map(offerFrom);
const offerOf = (ctx: EngineContext, tripRef: string, responderRef: string | null) => offersFor(ctx, tripRef).find(o => o.responderRef === responderRef);

type StandingRow = { subject_ref: string; role: string; verified_until: string | null; stopped: number; ended: number; heard_at: string };
const standingOf = (ctx: EngineContext, subjectRef: string | null, role: string): Standing | undefined => {
 if (!subjectRef) return undefined;
 const r = ctx.store.prepare('SELECT subject_ref, role, verified_until, stopped, ended, heard_at FROM movement_standing WHERE subject_ref = ? AND role = ?').get(subjectRef, role) as StandingRow | undefined;
 return r ? { subjectRef: r.subject_ref, role: r.role, verifiedUntil: r.verified_until, stopped: r.stopped === 1, ended: r.ended === 1, heardAt: r.heard_at } : undefined;
};
const clearedAs = (ctx: EngineContext, ref: string | null, role: string, now: number) => clearedOn(standingOf(ctx, ref, role), isoDayOf(now));

type ResponderRow = { responder_ref: string; online: number; last_beat_at: number };
const responders = (ctx: EngineContext): Responder[] =>
 (ctx.store.prepare('SELECT responder_ref, online, last_beat_at FROM movement_responders').all() as ResponderRow[]).map(r => ({ responderRef: r.responder_ref, online: r.online === 1, lastBeatAt: r.last_beat_at }));

type PositionRow = { trip_ref: string; lat: number; lng: number; reported_at: number };
const positionOf = (ctx: EngineContext, tripRef: string): Position | undefined => {
 const r = ctx.store.prepare('SELECT trip_ref, lat, lng, reported_at FROM movement_positions WHERE trip_ref = ?').get(tripRef) as PositionRow | undefined;
 return r ? { tripRef: r.trip_ref, lat: r.lat, lng: r.lng, reportedAt: r.reported_at } : undefined;
};

type AdmissionRow = {
 admission_ref: string; subject_ref: string; facility_ref: string; bed_category: string; priority_code: string; arrival_window_start: number; requested_by_role: string;
 requested_at: number; state_code: string; receiving_point: string | null; reason_code: string | null; alternative_offered: number; information_code: string | null;
 decision_simulated: number; decided_at: number | null; arrived_at: number | null; agreed_with_pretriage: number | null; handed_over_at: number | null;
 receiving_role: string | null; encounter_ref: string | null;
};
const ADMISSION_COLUMNS = 'admission_ref, subject_ref, facility_ref, bed_category, priority_code, arrival_window_start, requested_by_role, requested_at, state_code, receiving_point, reason_code, alternative_offered, information_code, decision_simulated, decided_at, arrived_at, agreed_with_pretriage, handed_over_at, receiving_role, encounter_ref';
const admissionFrom = (r: AdmissionRow): Admission => ({
 admissionRef: r.admission_ref, subjectRef: r.subject_ref, facilityRef: r.facility_ref, bedCategory: r.bed_category, priorityCode: r.priority_code as 'P2' | 'P3',
 arrivalWindowStart: r.arrival_window_start, requestedByRole: r.requested_by_role, requestedAt: r.requested_at, stateCode: r.state_code as Admission['stateCode'],
 receivingPoint: r.receiving_point, reasonCode: r.reason_code, alternativeOffered: r.alternative_offered === 1, informationCode: r.information_code,
 decisionSimulated: r.decision_simulated === 1, decidedAt: r.decided_at, arrivedAt: r.arrived_at,
 agreedWithPretriage: r.agreed_with_pretriage === null ? null : r.agreed_with_pretriage === 1, handedOverAt: r.handed_over_at, receivingRole: r.receiving_role, encounterRef: r.encounter_ref
});
const admissionByRef = (ctx: EngineContext, ref: unknown) => {
 const row = ctx.store.prepare(`SELECT ${ADMISSION_COLUMNS} FROM movement_admissions WHERE admission_ref = ?`).get(text(ref)) as AdmissionRow | undefined;
 return row ? admissionFrom(row) : undefined;
};
const flag = (value: boolean | null) => (value === null ? null : value ? 1 : 0);
const insertAdmission = (ctx: EngineContext, a: Admission) => ctx.store.prepare(`INSERT INTO movement_admissions (${ADMISSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
 .run(a.admissionRef, a.subjectRef, a.facilityRef, a.bedCategory, a.priorityCode, a.arrivalWindowStart, a.requestedByRole, a.requestedAt, a.stateCode, a.receivingPoint,
  a.reasonCode, flag(a.alternativeOffered), a.informationCode, flag(a.decisionSimulated), a.decidedAt, a.arrivedAt, flag(a.agreedWithPretriage), a.handedOverAt, a.receivingRole, a.encounterRef);
const putAdmission = (ctx: EngineContext, a: Admission) => ctx.store.prepare('UPDATE movement_admissions SET state_code = ?, receiving_point = ?, reason_code = ?, alternative_offered = ?, information_code = ?, decision_simulated = ?, decided_at = ?, arrived_at = ?, agreed_with_pretriage = ?, handed_over_at = ?, receiving_role = ?, encounter_ref = ? WHERE admission_ref = ?')
 .run(a.stateCode, a.receivingPoint, a.reasonCode, flag(a.alternativeOffered), a.informationCode, flag(a.decisionSimulated), a.decidedAt, a.arrivedAt, flag(a.agreedWithPretriage), a.handedOverAt, a.receivingRole, a.encounterRef, a.admissionRef);

type HeardRow = { link_ref: string; purpose: string; expires_at: number; heard_at: number };
const heardFrom = (r: HeardRow): HeardLink => ({ linkRef: r.link_ref, purpose: r.purpose, expiresAt: r.expires_at, heardAt: r.heard_at });
const heardLinkOf = (ctx: EngineContext, ref: unknown) => {
 const r = ctx.store.prepare('SELECT link_ref, purpose, expires_at, heard_at FROM movement_links_heard WHERE link_ref = ?').get(text(ref)) as HeardRow | undefined;
 return r ? heardFrom(r) : undefined;
};

type PacketRow = { admission_ref: string; link_ref: string; sent_at: number; link_ends_at: number; opened_at: number | null; opened_by_role: string | null; opened_after_end: number };
const PACKET_COLUMNS = 'admission_ref, link_ref, sent_at, link_ends_at, opened_at, opened_by_role, opened_after_end';
const packetFrom = (r: PacketRow): Packet => ({ admissionRef: r.admission_ref, linkRef: r.link_ref, sentAt: r.sent_at, linkEndsAt: r.link_ends_at, openedAt: r.opened_at, openedByRole: r.opened_by_role, openedAfterEnd: r.opened_after_end === 1 });
const packetOf = (ctx: EngineContext, admissionRef: string) => {
 const r = ctx.store.prepare(`SELECT ${PACKET_COLUMNS} FROM movement_packets WHERE admission_ref = ?`).get(admissionRef) as PacketRow | undefined;
 return r ? packetFrom(r) : undefined;
};
const packetByLink = (ctx: EngineContext, linkRef: string) => {
 const r = ctx.store.prepare(`SELECT ${PACKET_COLUMNS} FROM movement_packets WHERE link_ref = ?`).get(linkRef) as PacketRow | undefined;
 return r ? packetFrom(r) : undefined;
};
const putPacket = (ctx: EngineContext, p: Packet) => ctx.store.prepare(`INSERT INTO movement_packets (${PACKET_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(admission_ref) DO UPDATE SET link_ref = excluded.link_ref, sent_at = excluded.sent_at, link_ends_at = excluded.link_ends_at, opened_at = excluded.opened_at, opened_by_role = excluded.opened_by_role, opened_after_end = excluded.opened_after_end`)
 .run(p.admissionRef, p.linkRef, p.sentAt, p.linkEndsAt, p.openedAt, p.openedByRole, p.openedAfterEnd ? 1 : 0);

/* Offer a requested trip to cleared, online responders it has not asked, up to the offers it keeps. Asked when a
   trip is requested, when an offer is declined, when a responder comes online and on every tick. */
function offer(ctx: EngineContext, trip: Trip, now: number, settings: MovementInForce) {
 const candidates = responders(ctx).filter(r => isOnline(r, now, settings) && clearedAs(ctx, r.responderRef, 'responder', now));
 for (const responderRef of offersToMake(trip, offersFor(ctx, trip.tripRef), candidates)) {
  ctx.store.prepare('INSERT INTO movement_offers (trip_ref, responder_ref, offered_at, declined_at) VALUES (?, ?, ?, ?)').run(trip.tripRef, responderRef, now, null);
 }
}

/* Undeclared names that would make an admission request say where the bed stands. The binder never hands their
   values over; a request that sends one is refused in the engine's sentence rather than silently dropped. */
const SAYS_WHERE_THE_BED_STANDS = /(state|status|booked|booking|confirm|reserv|bed(number|no|ref|id)?$)/i;

/* ── The routes ───────────────────────────────────────────────────────────────────────────────────── */

function admissionFor(ctx: EngineContext, request: HandlerRequest) {
 const found = admissionByRef(ctx, request.fields.admissionRef);
 return found && !(ctx.caller.role === 'patient' && ctx.caller.ref !== found.subjectRef) ? found : undefined;
}

export const engine = defineEngine({
 id: 'movement',
 store: { schema },
 routes: {
  'POST /v1/movement/trips@2': (request, ctx) => {
   const now = nowOf(ctx);
   const settings = settingsOf(ctx);
   const made = requestTrip({
    tripRef: 'trip-' + randomUUID(), subjectRef: request.fields.subjectRef, priorityClass: request.fields.priorityClass,
    pickupWindowStart: request.fields.pickupWindowStart, zoneId: request.fields.zoneId, facilityRef: request.fields.facilityRef,
    admissionRef: request.fields.admissionRef, priorityReasonCode: request.fields.priorityReasonCode, prioritySetByRef: request.fields.prioritySetByRef,
    byRole: ctx.caller.role, byRef: ctx.caller.ref
   }, { now, settings, callerCleared: clearedAs(ctx, ctx.caller.ref, ctx.caller.role, now), admissionKnown: ref => admissionByRef(ctx, ref) !== undefined });
   if (!made.ok) return refuse(made.refusal.id);
   const trip = made.value;
   insertTrip(ctx, trip);
   ctx.publish('trip.requested@1', { tripRef: trip.tripRef, priorityClass: trip.priorityClass, pickupWindowStart: at(trip.pickupWindowStart) }, { subjectRef: trip.subjectRef });
   offer(ctx, trip, now, settings);
   return ok({ tripRef: trip.tripRef, stateCode: trip.stateCode, settingsVersion: trip.settingsVersion });
  },

  'POST /v1/movement/responder-heartbeats@2': (request, ctx) => {
   const now = nowOf(ctx);
   const settings = settingsOf(ctx);
   const trip = typeof request.fields.tripRef === 'string' ? tripByRef(ctx, request.fields.tripRef) : undefined;
   const beat = heartbeat({ online: request.fields.online, tripRef: request.fields.tripRef, lat: request.fields.lat, lng: request.fields.lng },
    { cleared: clearedAs(ctx, ctx.caller.ref, 'responder', now), trip, byRef: ctx.caller.ref, now });
   if (!beat.ok) return refuse(beat.refusal.id);
   const online = request.fields.online === true;
   ctx.store.prepare('INSERT INTO movement_responders (responder_ref, online, last_beat_at) VALUES (?, ?, ?) ON CONFLICT(responder_ref) DO UPDATE SET online = excluded.online, last_beat_at = excluded.last_beat_at')
    .run(ctx.caller.ref, online ? 1 : 0, now);
   const position = beat.value.position;
   if (position) {
    ctx.store.prepare('INSERT INTO movement_positions (trip_ref, lat, lng, reported_at) VALUES (?, ?, ?, ?) ON CONFLICT(trip_ref) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, reported_at = excluded.reported_at')
     .run(position.tripRef, position.lat, position.lng, position.reportedAt);
   }
   if (online) for (const waiting of tripsIn(ctx, 'requested')) offer(ctx, waiting, now, settings);
   return ok({ nextBeatSeconds: settings.heartbeatIntervalSeconds, positionKept: position !== null, settingsVersion: settings.settingsVersion });
  },

  'POST /v1/movement/trips/{tripRef}/accept@2': (request, ctx) => {
   const now = nowOf(ctx);
   const trip = tripByRef(ctx, request.fields.tripRef);
   const taken = acceptTrip(trip, trip && offerOf(ctx, trip.tripRef, ctx.caller.ref), { ref: ctx.caller.ref ?? '', cleared: clearedAs(ctx, ctx.caller.ref, 'responder', now) }, now);
   if (!taken.ok) return refuse(taken.refusal.id);
   const accepted = taken.value;
   if (trip!.stateCode === 'requested') {
    putTripState(ctx, accepted);
    ctx.publish('trip.accepted@1', { tripRef: accepted.tripRef, responderRef: accepted.responderRef }, { subjectRef: accepted.subjectRef });
    const admission = accepted.admissionRef ? admissionByRef(ctx, accepted.admissionRef) : undefined;
    if (admission) {
     ctx.publish('transport.enroute@1', { admissionRef: admission.admissionRef, priorityClass: accepted.priorityClass, expectedArrivalAt: at(admission.arrivalWindowStart) }, { subjectRef: accepted.subjectRef });
    }
   }
   return ok({ zoneId: accepted.zoneId, facilityRef: accepted.facilityRef, windowClosesAt: at(windowClosesAt(accepted)) });
  },

  'POST /v1/movement/trips/{tripRef}/decline@1': (request, ctx) => {
   const now = nowOf(ctx);
   const trip = tripByRef(ctx, request.fields.tripRef);
   const declined = declineTrip(trip, trip && offerOf(ctx, trip.tripRef, ctx.caller.ref), now);
   if (!declined.ok) return refuse(declined.refusal.id);
   ctx.store.prepare('UPDATE movement_offers SET declined_at = ? WHERE trip_ref = ? AND responder_ref = ? AND declined_at IS NULL').run(now, declined.value.tripRef, declined.value.responderRef);
   offer(ctx, trip!, now, settingsOf(ctx));
   return ok({ declined: true });
  },

  'POST /v1/movement/trips/{tripRef}/handover@2': (request, ctx) => {
   const now = nowOf(ctx);
   const handed = handOverTrip(tripByRef(ctx, request.fields.tripRef), { byRef: ctx.caller.ref, receivingRole: request.fields.receivingRole, checklistComplete: request.fields.checklistComplete }, now);
   if (!handed.ok) return refuse(handed.refusal.id);
   putTripState(ctx, handed.value);
   return ok({ handedOverAt: at(now), windowClosedAt: at(windowClosesAt(handed.value)) });
  },

  'GET /v1/movement/trips/{tripRef}/position@1': (request, ctx) => {
   const trip = tripByRef(ctx, request.fields.tripRef);
   const read = readPosition(trip, ctx.caller, trip && positionOf(ctx, trip.tripRef), nowOf(ctx));
   if (!read.ok) return refuse(read.refusal.id);
   return ok({ lat: read.value.lat, lng: read.value.lng, reportedAt: at(read.value.reportedAt), windowClosesAt: at(read.value.windowClosesAt) });
  },

  /* Nothing is sent: there is no partner to send it to. While packages/catalog/movement.json routes a P1 nowhere
     there is no branch that sends one, and the day a partner is contracted this route is a new version with a
     door whose conditions are met, not an edit to this line. */
  'POST /v1/movement/ems-requests@1': () => {
   if (AMBULANCE_PARTNER !== null) throw new Error(`packages/catalog/movement.json now routes a P1 to "${AMBULANCE_PARTNER}", and this route has no adapter to hand it to. ${refusal('no-ambulance-partner-connected').statement}`);
   return refuse('no-ambulance-partner-connected');
  },

  'GET /v1/movement/facilities@2': request => {
   const found = searchFacilities({ zoneId: request.fields.zoneId, bedCategory: request.fields.bedCategory, undeclared: request.undeclared });
   if (!found.ok) return refuse(found.refusal.id);
   return ok({
    facilities: found.value.map(f => ({ facilityRef: f.ref, name: f.name, zoneId: f.zoneId, bedCategories: [...f.bedCategories], hours: f.hours, synthetic: movementContract.facilities.synthetic }))
   });
  },

  'POST /v1/movement/admissions@2': (request, ctx) => {
   if (request.undeclared.some(name => SAYS_WHERE_THE_BED_STANDS.test(name))) return refuse('pending-bed-shown-as-booked');
   const now = nowOf(ctx);
   const made = requestAdmission({
    admissionRef: 'admission-' + randomUUID(), subjectRef: request.fields.subjectRef, facilityRef: request.fields.facilityRef, bedCategory: request.fields.bedCategory,
    priorityCode: request.fields.priorityCode, arrivalWindowStart: request.fields.arrivalWindowStart, byRole: ctx.caller.role
   }, now);
   if (!made.ok) return refuse(made.refusal.id);
   const a = made.value;
   insertAdmission(ctx, a);
   ctx.publish('admission.requested@1', { admissionRef: a.admissionRef, facilityRef: a.facilityRef, bedCategory: a.bedCategory, arrivalWindowStart: at(a.arrivalWindowStart) }, { subjectRef: a.subjectRef });
   return ok({ admissionRef: a.admissionRef, stateCode: a.stateCode, pending: presentationOf(a.stateCode).pending });
  },

  'GET /v1/movement/admissions/{admissionRef}@2': (request, ctx) => {
   const admission = admissionFor(ctx, request);
   if (!admission) return refuse('not-found');
   const shown = presentationOf(admission.stateCode);
   return ok({
    stateCode: admission.stateCode, pending: shown.pending, destinationConfirmed: shown.destinationConfirmed,
    ...(shown.destinationConfirmed && admission.receivingPoint ? { receivingPoint: admission.receivingPoint } : {}),
    decisionSimulated: admission.decisionSimulated, packetStateCode: packetStateOf(packetOf(ctx, admission.admissionRef), admission, nowOf(ctx))
   });
  },

  'POST /v1/movement/admissions/{admissionRef}/packet@2': (request, ctx) => {
   const now = nowOf(ctx);
   const admission = admissionFor(ctx, request);
   const sent = sendPacket(admission, heardLinkOf(ctx, request.fields.shareLinkRef), PACKET_POLICY, now);
   if (!sent.ok) return refuse(sent.refusal.id);
   putPacket(ctx, sent.value);
   return ok({ sentAt: at(now), endsAt: at(packetEndsAt(sent.value, admission!)) });
  },

  'POST /v1/movement/admissions/{admissionRef}/decision@2': (request, ctx) => {
   const decided = decide(admissionFor(ctx, request), {
    decisionCode: request.fields.decisionCode, receivingPoint: request.fields.receivingPoint, alternativeOffered: request.fields.alternativeOffered,
    reasonCode: request.fields.reasonCode, simulated: request.fields.simulated
   }, nowOf(ctx));
   if (!decided.ok) return refuse(decided.refusal.id);
   putAdmission(ctx, decided.value.admission);
   ctx.publish(decided.value.announce.key, decided.value.announce.payload, { subjectRef: decided.value.admission.subjectRef });
   return ok({ stateCode: decided.value.admission.stateCode, pending: presentationOf(decided.value.admission.stateCode).pending });
  },

  'POST /v1/movement/admissions/{admissionRef}/more-information@1': (request, ctx) => {
   const asked = askForMore(admissionFor(ctx, request), { informationCode: request.fields.informationCode, simulated: request.fields.simulated });
   if (!asked.ok) return refuse(asked.refusal.id);
   putAdmission(ctx, asked.value);
   return ok({ stateCode: asked.value.stateCode, pending: presentationOf(asked.value.stateCode).pending });
  },

  'POST /v1/movement/admissions/{admissionRef}/arrival@2': (request, ctx) => {
   const now = nowOf(ctx);
   const arrived = arrive(admissionFor(ctx, request), { receivingPoint: request.fields.receivingPoint, agreedWithPretriage: request.fields.agreedWithPretriage, simulated: request.fields.simulated }, now);
   if (!arrived.ok) return refuse(arrived.refusal.id);
   const a = arrived.value;
   putAdmission(ctx, a);
   ctx.publish('admission.arrived@1', { admissionRef: a.admissionRef, receivingPoint: a.receivingPoint }, { subjectRef: a.subjectRef });
   ctx.publish('triage.verified@1', { admissionRef: a.admissionRef, agreedWithPretriage: a.agreedWithPretriage === true }, { subjectRef: a.subjectRef });
   return ok({ arrivedAt: at(now) });
  },

  'POST /v1/movement/admissions/{admissionRef}/handover@2': (request, ctx) => {
   const now = nowOf(ctx);
   const handed = handOver(admissionFor(ctx, request), { receivingRole: request.fields.receivingRole, encounterRef: request.fields.encounterRef, simulated: request.fields.simulated }, now);
   if (!handed.ok) return refuse(handed.refusal.id);
   const a = handed.value;
   putAdmission(ctx, a);
   ctx.publish('admission.handover_complete@1', { admissionRef: a.admissionRef, receivingRole: a.receivingRole, encounterRef: a.encounterRef }, { subjectRef: a.subjectRef });
   return ok({ handedOverAt: at(now) });
  },

  ...settingsRoutes(movementSettings, { read: 'GET /v1/movement/settings@1', change: 'POST /v1/movement/setting-changes@1' })
 },

 subscriptions: {
  ...Object.fromEntries(STANDING_EVENTS.map(key => [key, (event: BusEvent, ctx: EngineContext) => {
   const role = text(event.payload['role']);
   const next = learn(standingOf(ctx, event.subjectRef, role), event);
   if (!next) return;
   ctx.store.prepare('INSERT INTO movement_standing (subject_ref, role, verified_until, stopped, ended, heard_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(subject_ref, role) DO UPDATE SET verified_until = excluded.verified_until, stopped = excluded.stopped, ended = excluded.ended, heard_at = excluded.heard_at')
    .run(next.subjectRef, next.role, next.verifiedUntil, next.stopped ? 1 : 0, next.ended ? 1 : 0, next.heardAt);
  }])),

  /* A reference, a purpose and two times — never the secret, which the event never carries, and never a scope,
     which it does not carry either. Kept no longer than the link could ever be sent as a packet. */
  'passport.share.link_created@1': (event, ctx) => {
   const expiresAt = Date.parse(text(event.payload['expiresAt']));
   const linkRef = text(event.payload['linkRef']);
   if (!linkRef || !Number.isFinite(expiresAt)) return;
   ctx.store.prepare('INSERT OR IGNORE INTO movement_links_heard (link_ref, purpose, expires_at, heard_at) VALUES (?, ?, ?, ?)').run(linkRef, text(event.payload['purpose']), expiresAt, nowOf(ctx));
  },

  'passport.share.link_used@1': (event, ctx) => {
   const packet = packetByLink(ctx, text(event.payload['linkRef']));
   const admission = packet && admissionByRef(ctx, packet.admissionRef);
   if (!packet || !admission) return;
   putPacket(ctx, heardOpen(packet, admission, text(event.payload['openedByRole']), nowOf(ctx)));
  }
 },

 /* Each tick: drop every position whose trip's window and retention have passed, forget every heard link that can
    no longer be sent, and offer waiting trips to responders who came online. */
 tick: ctx => {
  const now = nowOf(ctx);
  const withPositions = ctx.store.prepare(`SELECT ${TRIP_COLUMNS.split(', ').map(c => `t.${c}`).join(', ')} FROM movement_trips t JOIN movement_positions p ON p.trip_ref = t.trip_ref`).all() as TripRow[];
  for (const trip of withPositions.map(tripFrom)) {
   if (mustDrop(trip, now)) ctx.store.prepare('DELETE FROM movement_positions WHERE trip_ref = ?').run(trip.tripRef);
  }
  for (const link of (ctx.store.prepare('SELECT link_ref, purpose, expires_at, heard_at FROM movement_links_heard').all() as HeardRow[]).map(heardFrom)) {
   if (now >= heardLinkKeptUntil(link, PACKET_POLICY)) ctx.store.prepare('DELETE FROM movement_links_heard WHERE link_ref = ?').run(link.linkRef);
  }
  const settings = settingsOf(ctx);
  for (const waiting of tripsIn(ctx, 'requested')) offer(ctx, waiting, now, settings);
 }
});
