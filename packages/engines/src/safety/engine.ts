/* Safety on the engine runtime: the nurse's visit timer, her panic, and the desk that works both.
 *
 * THE TIMER IS STARTED BY THE EVENT, BY THE SERVICE. Safety hears appointment.in_progress@2, which Care
 * publishes only once the visit code has matched and which carries the serviceId booked. It starts the visit's
 * timer from that service's duration in packages/catalog/services.json and the grace, extension steps and
 * ceiling in force (packages/catalog/field-safety.json settings, as an admin last set them), and the timer keeps
 * that settings version and those timings for its whole life. No route starts a timer and no phone sends a
 * minute: POST /v1/safety/checkins@1, which sent expectedMinutes, is withdrawn with no callers, because nothing
 * is left for a phone to start. The same visit heard again keeps the timer it has. A visit whose service the catalogue does not hold
 * cannot be timed, and a delivery that cannot start a timer fails loudly on the trail rather than leaving a
 * nurse in a house with nobody watching the clock.
 *
 * HEARD: appointment.completed@2. The visit is finished and signed, so its timer closes. Safety is listed as a
 * subscriber for that alone; subscribers sit outside the event's fingerprint.
 *
 * THE CLOCK. Each tick, an open timer past its deadline emits checkin.overdue@1 once for that deadline and opens
 * an episode the desk works. Core and Care are its declared subscribers; neither binds a handler for it today.
 *
 * WHO THE TIMER IS FOR. appointment.in_progress@2 names no nurse, because an envelope names a role and never a
 * person. So a timer is held by the first identified nurse to act on it — say she is safe, extend or check out —
 * and anybody else is refused with checkin-held-by-another. A mistake then leaves the timer running, which pages
 * the desk; it never silences it. This is weaker than an event naming the nurse and is reported as open.
 *
 * I AM SAFE (POST …/safe@1) is recorded on the timer and moves nothing: not the deadline, and not an overdue the
 * desk was paged about, which only a person at the desk closes (field-safety.json checkInRule). A request that
 * sends anything beside the check-in is refused as an extension in disguise.
 *
 * EXTEND (POST …/extend@2) says why, in a reason from the contract, in a step the timer's own settings offer, up
 * to its own ceiling. Version one had no reason and is withdrawn, as is close@1, whose single refusal could not
 * answer a reference Safety never started or a timer another nurse holds.
 *
 * THE DESK. Pick-up comes first: an overdue is closed, and a panic resolved, only after a person picked it up,
 * and that is asked before any reason or outcome. A panic resolved publishes panic.resolved@1 — the panic, the
 * outcome's code and when sharing ended, never a position — and Core stands down the concern it opened for it.
 * Closing an overdue publishes nothing, because Core opens no concern for one and no engine acts on a close.
 * The desk's position read answers only while the panic's window is open and refuses after it; this store has
 * no column for where anybody is, so on this runtime it answers when sharing ends and never a position, because
 * no device reports one. The queue carries exactly field-safety.json desk.carries: never the service, the patient
 * or an address, and it takes no filter by any of them.
 *
 * BUILT, AS BEFORE: POST /v1/safety/panics@1, which folds a repeat press only into the same identified caller's
 * open panic for the same visit, and the settings routes at version two through packages/engines/src/settings.
 * A CHANGE NEVER MOVES SOMETHING ALREADY RUNNING: a timer and a panic keep what they started with, and nothing
 * reads the settings again for either.
 *
 * PATIENT SOS AND NEXT OF KIN (Wave 4). POST /v1/safety/sos@2 records a press thinly — how it was pressed, the door
 * the answers route to, whether a condition was ticked as a yes or a no, the area chosen from the list for its window
 * — refuses a band alone, a fall nobody pressed, a plan asking to go first and anything sent beside the answers, and
 * publishes sos.raised@2 for Core's concern and Care's urgent-visit offer. Each of the patient's nominations in force
 * is recorded as an attempt, not sent, because no SMS provider is connected. The patient stands it down with one of
 * the reasons on the screen, which publishes sos.stood_down@1. The desk reads the list, which never carries the
 * patient, the answers or the area, and reads the area only while its window is open; the tick drops the area from
 * this store when the window ends. A patient nominates a next of kin with consent to the version of the wording they
 * read, for the one purpose consent.json allows, and withdraws in one action; the desk tries again inside the window
 * and tries the SOS was pressed under; a guardian is refused on all three before anything else. The arithmetic is
 * ./domain/sos.ts's, and every sentence is packages/catalog/apis/safety.json's.
 *
 * SENTINEL TIERS ONE TO THREE (Wave 5). Safety hears reading.ingested@1, which Devices publishes only for a reading
 * carrying clinical weight, and keeps the reading by where it is in the record — never its value. The first reading of a
 * patient's measure opens a baseline under the window and minimum in force, which the baseline keeps. device.stale@1
 * suspends every baseline a reading from the device is counted in, until a newer reading from it is heard; device.recalled@1
 * takes every reading from the device out of every baseline and deletes none. The stale interval is Devices' own: Safety
 * acts on the announcement and knows no number. Nothing is evaluated, because no baseline rule or threshold is ratified,
 * and the read route says so in the contract's sentence. POST /v1/safety/sentinel-deviations@2 records a tier a named
 * clinician chose, one to three, on a reading Safety heard, refuses tier four in its own words, and publishes
 * sentinel.rung_raised@1, from which Core opens an alert at the rung closed-loop.json names. Version one, which Devices
 * called with a device class it set itself, is withdrawn with no callers. The arithmetic is ./domain/sentinel.ts's.
 *
 * SAFEGUARDING REPORTS (Wave 5). POST /v1/safety/safeguarding-reports@2 records who a concern is about, the group and the
 * kind chosen from packages/catalog/sentinel.json and who recorded it, and nothing typed. It is open, held for a
 * safeguarding officer no role on the register holds yet, and not sent to the police or social development; nothing here
 * updates or deletes a report. It publishes safeguarding.reported@2 carrying the report alone, under the report as its
 * subject, so no log learns who it is about. The desk's list carries no kind, no patient and no reporter, takes no
 * filter, and refuses a guardian before anything is read.
 *
 * SETTINGS. Sentinel's window and minimum wait on a clinical review, so the settings read is at version three with a
 * doctor among its callers and the review route is bound; version two is withdrawn with no callers.
 *
 * Nothing here is a real service: no timer reaches a desk, no panic reaches a person, no press reaches anybody,
 * nobody is told anything, nobody is sent, no patient is monitored and no report reaches anybody.
 */
import { randomUUID } from 'node:crypto';
import { defineEngine, ok, refuse, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, confirmersFromClinical, historyOf, settingsRoutes } from '../settings/routes.ts';
import { acknowledgeOverdue, checkIn, close, completeVisit, extend, extensionLeft, silenceOverdue, standingOf, startTimer, stepsOffered, tick as tickTimer, type Timer } from './domain/checkins.ts';
import { deskQueue } from './domain/desk.ts';
import { acknowledge, positionFor, raisePanic, resolve, sharingEndsAt, type DeskActor, type Panic } from './domain/panics.ts';
import { instant, type EmittedEvent, type Result } from './domain/rules.ts';
import { inForce, panicWindowOf, safetySettings, sentinelSettingsOf, sosSettingsOf } from './domain/settings.ts';
import {
 evaluate, guardianRefused, heard, leaveByRecall, openBaseline, raiseByHand, recordReport, reportsForDesk, resumeFor, stateFor, suspendFor,
 type Baseline, type Deviation, type HeardReading, type Report, type SentinelEmit
} from './domain/sentinel.ts';
import {
 alertAgain, areaFor, areaSharingEndsAt, firstAttempts, nominate, nominationStateOf, partnerConnected, raiseSos, sosDesk, sosStateOf, standDownSos, withdrawNomination, wouldSay,
 type Attempt, type Nomination, type Sos
} from './domain/sos.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS panics (',
 ' panic_ref TEXT PRIMARY KEY,',
 ' raised_by_role TEXT NOT NULL,',
 ' raised_by_ref TEXT,',
 ' appointment_ref TEXT,',
 ' raised_at INTEGER NOT NULL,',
 ' settings_version INTEGER NOT NULL,',
 ' location_share_ends_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS panic_desk (',
 ' panic_ref TEXT PRIMARY KEY,',
 ' picked_up_at INTEGER,',
 ' picked_up_by TEXT,',
 ' resolved_at INTEGER,',
 ' resolved_by TEXT,',
 ' outcome_code TEXT',
 ');',
 'CREATE TABLE IF NOT EXISTS timers (',
 ' checkin_ref TEXT PRIMARY KEY,',
 ' appointment_ref TEXT NOT NULL UNIQUE,',
 ' settings_version INTEGER NOT NULL,',
 ' held_by_ref TEXT,',
 ' doc TEXT NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS sos (',
 ' sos_ref TEXT PRIMARY KEY,',
 ' patient_ref TEXT NOT NULL,',
 ' area_ends_at INTEGER,',
 ' zone_id TEXT,',
 ' doc TEXT NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS next_of_kin (',
 ' nomination_ref TEXT PRIMARY KEY,',
 ' patient_ref TEXT NOT NULL,',
 ' doc TEXT NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS next_of_kin_attempts (',
 ' notification_ref TEXT PRIMARY KEY,',
 ' sos_ref TEXT NOT NULL,',
 ' nomination_ref TEXT NOT NULL,',
 ' doc TEXT NOT NULL',
 ');',
 /* Sentinel holds references and states and nothing a value could be written into: a reading by where it is in the
    record, a baseline by the settings it was opened under, a tier by who raised it. */
 'CREATE TABLE IF NOT EXISTS sentinel_heard (',
 ' reading_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 ' device_ref TEXT NOT NULL,',
 ' metric TEXT NOT NULL,',
 ' record_entry_ref TEXT NOT NULL UNIQUE,',
 ' heard_at INTEGER NOT NULL,',
 ' left_by_recall_at INTEGER',
 ');',
 'CREATE TABLE IF NOT EXISTS sentinel_baselines (',
 ' subject_ref TEXT NOT NULL,',
 ' metric TEXT NOT NULL,',
 ' doc TEXT NOT NULL,',
 ' PRIMARY KEY (subject_ref, metric)',
 ');',
 'CREATE TABLE IF NOT EXISTS sentinel_deviations (',
 ' deviation_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 ' doc TEXT NOT NULL',
 ');',
 /* A report is added and never updated or deleted: nothing here closes one. */
 'CREATE TABLE IF NOT EXISTS safeguarding_reports (',
 ' report_ref TEXT PRIMARY KEY,',
 ' doc TEXT NOT NULL',
 ');',
 SETTINGS_SCHEMA
].join('\n');

type OpenPanic = { panic_ref: string; location_share_ends_at: number };
type PanicRow = { panic_ref: string; raised_by_role: string; raised_by_ref: string | null; appointment_ref: string | null; raised_at: number; settings_version: number; location_share_ends_at: number };
type DeskRow = { picked_up_at: number | null; picked_up_by: string | null; resolved_at: number | null; resolved_by: string | null; outcome_code: string | null };
type Held = { timer: Timer; heldBy: string | null };

const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const text = (value: unknown) => typeof value === 'string' ? value : null;
/* checkin.overdue is dispatch's business: the purpose every check-in route serves. */
const OVERDUE_PURPOSE = 'dispatch';

/* ── The store ────────────────────────────────────────────────────────────────────────────────────── */

const heldFrom = (row: { held_by_ref: string | null; doc: string } | undefined): Held | undefined => row ? { timer: JSON.parse(row.doc) as Timer, heldBy: row.held_by_ref } : undefined;
const timerByRef = (ctx: EngineContext, checkinRef: unknown) => heldFrom(ctx.store.prepare('SELECT held_by_ref, doc FROM timers WHERE checkin_ref = ?').get(String(checkinRef)) as { held_by_ref: string | null; doc: string } | undefined);
const timerByVisit = (ctx: EngineContext, appointmentRef: unknown) => heldFrom(ctx.store.prepare('SELECT held_by_ref, doc FROM timers WHERE appointment_ref = ?').get(String(appointmentRef)) as { held_by_ref: string | null; doc: string } | undefined);
const allTimers = (ctx: EngineContext): Held[] => (ctx.store.prepare('SELECT held_by_ref, doc FROM timers ORDER BY rowid').all() as { held_by_ref: string | null; doc: string }[]).map(row => heldFrom(row)!);
const putTimer = (ctx: EngineContext, timer: Timer, heldBy: string | null) => { ctx.store.prepare('UPDATE timers SET held_by_ref = ?, doc = ? WHERE checkin_ref = ?').run(heldBy, JSON.stringify(timer), timer.checkinRef); };

/* A panic as the domain reads it, from what was pressed and what the desk has done since. No position is ever
   read back, because none is ever written. */
function panicFrom(ctx: EngineContext, row: PanicRow): Panic & { raisedByRef: string | null } {
 const desk = ctx.store.prepare('SELECT picked_up_at, picked_up_by, resolved_at, resolved_by, outcome_code FROM panic_desk WHERE panic_ref = ?').get(row.panic_ref) as DeskRow | undefined;
 return {
  panicRef: row.panic_ref, raisedByRole: row.raised_by_role, nurseRef: row.raised_by_ref ?? row.panic_ref, raisedByRef: row.raised_by_ref,
  appointmentRef: row.appointment_ref, raisedAt: row.raised_at, settingsVersion: row.settings_version, locationShareEndsAt: row.location_share_ends_at,
  acknowledged: desk?.picked_up_at != null ? { at: desk.picked_up_at, by: desk.picked_up_by ?? '' } : null,
  resolved: desk?.resolved_at != null ? { at: desk.resolved_at, by: desk.resolved_by ?? '', outcomeId: desk.outcome_code ?? '' } : null,
  position: null
 };
}
const panicByRef = (ctx: EngineContext, panicRef: unknown) => {
 const row = ctx.store.prepare('SELECT panic_ref, raised_by_role, raised_by_ref, appointment_ref, raised_at, settings_version, location_share_ends_at FROM panics WHERE panic_ref = ?').get(String(panicRef)) as PanicRow | undefined;
 return row ? panicFrom(ctx, row) : undefined;
};
const allPanics = (ctx: EngineContext) => (ctx.store.prepare('SELECT panic_ref, raised_by_role, raised_by_ref, appointment_ref, raised_at, settings_version, location_share_ends_at FROM panics ORDER BY raised_at').all() as PanicRow[]).map(row => panicFrom(ctx, row));
const putDesk = (ctx: EngineContext, panic: Panic) => {
 ctx.store.prepare('INSERT INTO panic_desk (panic_ref, picked_up_at, picked_up_by, resolved_at, resolved_by, outcome_code) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(panic_ref) DO UPDATE SET picked_up_at = excluded.picked_up_at, picked_up_by = excluded.picked_up_by, resolved_at = excluded.resolved_at, resolved_by = excluded.resolved_by, outcome_code = excluded.outcome_code')
  .run(panic.panicRef, panic.acknowledged?.at ?? null, panic.acknowledged?.by ?? null, panic.resolved?.at ?? null, panic.resolved?.by ?? null, panic.resolved?.outcomeId ?? null);
};
const publishAll = (ctx: EngineContext, emits: readonly EmittedEvent[], subjectRef: string, purposeOfUse?: string) => {
 for (const event of emits) ctx.publish((event.type + '@' + event.version) as EventKey, event.payload, { subjectRef, ...(purposeOfUse ? { purposeOfUse } : {}) });
};

/* ── A patient's SOS and their next of kin ─────────────────────────────────────────────────────────────── */

/* The area is its own column, so dropping it when its window ends is one statement and the rest of the SOS — the
   thin record sos.json says is kept — stays as it was. */
type SosRow = { zone_id: string | null; doc: string };
const sosFrom = (row: SosRow | undefined): Sos | undefined => row ? { ...(JSON.parse(row.doc) as Omit<Sos, 'zoneId'>), zoneId: row.zone_id } : undefined;
const sosByRef = (ctx: EngineContext, sosRef: unknown) => sosFrom(ctx.store.prepare('SELECT zone_id, doc FROM sos WHERE sos_ref = ?').get(String(sosRef)) as SosRow | undefined);
const allSos = (ctx: EngineContext): Sos[] => (ctx.store.prepare('SELECT zone_id, doc FROM sos ORDER BY rowid').all() as SosRow[]).map(row => sosFrom(row)!);
const putSos = (ctx: EngineContext, sos: Sos) => {
 const { zoneId, ...kept } = sos;
 ctx.store.prepare('INSERT INTO sos (sos_ref, patient_ref, area_ends_at, zone_id, doc) VALUES (?, ?, ?, ?, ?) ON CONFLICT(sos_ref) DO UPDATE SET area_ends_at = excluded.area_ends_at, zone_id = excluded.zone_id, doc = excluded.doc')
  .run(sos.sosRef, sos.patientRef, areaSharingEndsAt(sos), zoneId, JSON.stringify(kept));
};
const nominationByRef = (ctx: EngineContext, nominationRef: unknown): Nomination | undefined => {
 const row = ctx.store.prepare('SELECT doc FROM next_of_kin WHERE nomination_ref = ?').get(String(nominationRef)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as Nomination : undefined;
};
const allNominations = (ctx: EngineContext): Nomination[] => (ctx.store.prepare('SELECT doc FROM next_of_kin ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Nomination);
const putNomination = (ctx: EngineContext, nomination: Nomination) => {
 ctx.store.prepare('INSERT INTO next_of_kin (nomination_ref, patient_ref, doc) VALUES (?, ?, ?) ON CONFLICT(nomination_ref) DO UPDATE SET doc = excluded.doc').run(nomination.nominationRef, nomination.patientRef, JSON.stringify(nomination));
};
const allAttempts = (ctx: EngineContext): Attempt[] => (ctx.store.prepare('SELECT doc FROM next_of_kin_attempts ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Attempt);
const attemptsFor = (ctx: EngineContext, sosRef: string, nominationRef: string) =>
 (ctx.store.prepare('SELECT COUNT(*) AS n FROM next_of_kin_attempts WHERE sos_ref = ? AND nomination_ref = ?').get(sosRef, nominationRef) as { n: number }).n;
const putAttempt = (ctx: EngineContext, attempt: Attempt) => {
 ctx.store.prepare('INSERT INTO next_of_kin_attempts (notification_ref, sos_ref, nomination_ref, doc) VALUES (?, ?, ?, ?)').run(attempt.notificationRef, attempt.sosRef, attempt.nominationRef, JSON.stringify(attempt));
};
const optionalInstant = (at: number | null) => at === null ? null : instant(at);

/* ── Sentinel and safeguarding ──────────────────────────────────────────────────────────────────────── */

type HeardRow = { reading_ref: string; subject_ref: string; device_ref: string; metric: string; record_entry_ref: string; heard_at: number; left_by_recall_at: number | null };
const HEARD_COLUMNS = 'reading_ref, subject_ref, device_ref, metric, record_entry_ref, heard_at, left_by_recall_at';
const allHeard = (ctx: EngineContext): HeardReading[] => (ctx.store.prepare(`SELECT ${HEARD_COLUMNS} FROM sentinel_heard ORDER BY heard_at, rowid`).all() as HeardRow[]).map(row => ({
 readingRef: row.reading_ref, subjectRef: row.subject_ref, deviceRef: row.device_ref, metric: row.metric, recordEntryRef: row.record_entry_ref, heardAt: row.heard_at, leftByRecallAt: row.left_by_recall_at
}));
const allBaselines = (ctx: EngineContext): Baseline[] => (ctx.store.prepare('SELECT doc FROM sentinel_baselines ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Baseline);
const putBaseline = (ctx: EngineContext, baseline: Baseline) => {
 ctx.store.prepare('INSERT INTO sentinel_baselines (subject_ref, metric, doc) VALUES (?, ?, ?) ON CONFLICT(subject_ref, metric) DO UPDATE SET doc = excluded.doc').run(baseline.subjectRef, baseline.metric, JSON.stringify(baseline));
};
const allDeviations = (ctx: EngineContext): Deviation[] => (ctx.store.prepare('SELECT doc FROM sentinel_deviations ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Deviation);
const allReports = (ctx: EngineContext): Report[] => (ctx.store.prepare('SELECT doc FROM safeguarding_reports ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Report);
const publishSentinel = (ctx: EngineContext, emits: readonly SentinelEmit[], subjectRef: string) => {
 for (const event of emits) ctx.publish((event.type + '@' + event.version) as EventKey, event.payload, { subjectRef });
};

/* ── The nurse ────────────────────────────────────────────────────────────────────────────────────── */

/* Her three acts share one shape: find the timer, refuse a nurse other than the one who holds it, ask the domain,
   and keep what it answers with her as the holder. The runtime refuses an idempotent write from a caller it
   cannot identify, so a holder is always somebody. A refusal rolls back, so a refused first act holds nothing. */
function asHolder(request: HandlerRequest, ctx: EngineContext, act: (timer: Timer, now: number) => Result<Timer>, answer: (timer: Timer, now: number) => Record<string, unknown>) {
 const found = timerByRef(ctx, request.fields.checkinRef);
 if (!found) return refuse('no-such-checkin');
 const holder = ctx.caller.ref ?? ctx.caller.role;
 if (found.heldBy !== null && found.heldBy !== holder) return refuse('checkin-held-by-another');
 const now = nowOf(ctx);
 const result = act(found.timer, now);
 if (!result.ok) return refuse(result.refusal.id);
 const kept: Timer = { ...result.value, nurseRef: holder };
 putTimer(ctx, kept, holder);
 return ok(answer(kept, now));
}

/* ── The desk ─────────────────────────────────────────────────────────────────────────────────────── */

/* The person at the desk, as the runtime admitted them. The binder admits only the desk's roles to these routes,
   and the domain asks the same list again, so an engine can never pick up or resolve a panic. */
const deskActor = (ctx: EngineContext): Extract<DeskActor, { kind: 'person' }> => ({ kind: 'person', role: ctx.caller.role, ref: ctx.caller.ref ?? ctx.caller.role });

export const engine = defineEngine({
 id: 'safety',
 store: { schema },
 routes: {
  'POST /v1/safety/panics@1': (request, ctx) => {
   const now = ctx.clock.now().getTime();
   /* Who pressed it, and the only source for that is the caller the runtime identified. In development
      that reference arrives in a request header and is believed (apis.json, engineRuntime): it is not
      proof of identity, and a production door has to establish it before any of this is real. */
   const callerRef = ctx.caller.ref;
   const appointmentRef = typeof request.fields.appointmentRef === 'string' ? request.fields.appointmentRef : null;
   const panicRef = 'panic-' + randomUUID();
   const pressed = raisePanic({
    panicRef, raisedByRole: ctx.caller.role, nurseRef: callerRef ?? panicRef,
    appointmentRef, locationShareMinutes: request.fields.locationShareMinutes as number
   }, now, panicWindowOf(historyOf(ctx.store)));
   if (!pressed.ok) return refuse(pressed.refusal.id);

   if (callerRef) {
    const open = ctx.store.prepare(
     'SELECT panic_ref, location_share_ends_at FROM panics WHERE raised_by_role = ? AND raised_by_ref = ? AND appointment_ref IS ? AND location_share_ends_at > ? ORDER BY raised_at DESC LIMIT 1'
    ).get(ctx.caller.role, callerRef, appointmentRef, now) as OpenPanic | undefined;
    /* A panic the desk has already resolved is over, even inside its window: a press after it is a new panic. */
    if (open && !panicByRef(ctx, open.panic_ref)?.resolved) return ok({ panicRef: open.panic_ref, locationShareEndsAt: new Date(open.location_share_ends_at).toISOString() });
   }

   const panic = pressed.value;
   ctx.store.prepare('INSERT INTO panics (panic_ref, raised_by_role, raised_by_ref, appointment_ref, raised_at, settings_version, location_share_ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(panic.panicRef, panic.raisedByRole, callerRef, panic.appointmentRef, panic.raisedAt, panic.settingsVersion, panic.locationShareEndsAt);
   /* The subject of the event is the identified caller when there is one. Without a reference the
      panic's own reference stands in, rather than the event going unsent or a subject being guessed. */
   publishAll(ctx, pressed.emits, callerRef ?? panic.panicRef);
   return ok({ panicRef: panic.panicRef, locationShareEndsAt: new Date(panic.locationShareEndsAt).toISOString() });
  },

  'GET /v1/safety/checkins@1': (request, ctx) => {
   const found = timerByVisit(ctx, request.fields.appointmentRef);
   if (!found) return refuse('no-timer-for-that-visit');
   const { timer } = found;
   const now = nowOf(ctx);
   const saidSafeAt = timer.checkIns.at(-1);
   return ok({
    checkinRef: timer.checkinRef, stateCode: standingOf(timer, now), dueAt: instant(timer.dueAt), settingsVersion: timer.settingsVersion,
    extensionMinutesLeft: extensionLeft(timer), extensionStepsOffered: stepsOffered(timer),
    ...(saidSafeAt === undefined ? {} : { saidSafeAt: instant(saidSafeAt) })
   });
  },

  'POST /v1/safety/checkins/{checkinRef}/extend@2': (request, ctx) => asHolder(request, ctx,
   (timer, now) => extend(timer, { minutes: request.fields.extraMinutes as number, reasonId: text(request.fields.reasonCode) }, now),
   timer => ({ dueAt: instant(timer.dueAt), extensionMinutesLeft: extensionLeft(timer) })),

  /* I am safe. Anything sent beside the check-in — minutes, a deadline — is an extension without a reason, and
     is refused before the timer is so much as read. checkIn records the moment and the answer to an overdue,
     and nothing else. */
  'POST /v1/safety/checkins/{checkinRef}/safe@1': (request, ctx) => request.undeclared.length
   ? refuse('safe-is-not-an-extension')
   : asHolder(request, ctx, checkIn, (timer, now) => ({ saidSafeAt: instant(now), dueAt: instant(timer.dueAt) })),

  'POST /v1/safety/checkins/{checkinRef}/close@2': (request, ctx) => asHolder(request, ctx,
   (timer, now) => close(timer, 'nurse', now),
   timer => ({ closedAt: instant(timer.closedAt!) })),

  'POST /v1/safety/overdue-checkins/{checkinRef}/pick-up@1': (request, ctx) => {
   const found = timerByRef(ctx, request.fields.checkinRef);
   if (!found) return refuse('no-such-checkin');
   const picked = acknowledgeOverdue(found.timer, deskActor(ctx).ref, nowOf(ctx));
   if (!picked.ok) return refuse(picked.refusal.id);
   putTimer(ctx, picked.value, found.heldBy);
   return ok({ pickedUpAt: instant(picked.value.overdue!.acknowledged!.at) });
  },

  /* Pick-up comes first: silenceOverdue asks whether a person picked the overdue up before it asks for the
     reason. The close is Safety's own record; no engine hears it, so nothing is published. */
  'POST /v1/safety/overdue-checkins/{checkinRef}/close@1': (request, ctx) => {
   const found = timerByRef(ctx, request.fields.checkinRef);
   if (!found) return refuse('no-such-checkin');
   const closed = silenceOverdue(found.timer, { reasonId: text(request.fields.reasonCode), by: deskActor(ctx).ref }, nowOf(ctx));
   if (!closed.ok) return refuse(closed.refusal.id);
   putTimer(ctx, closed.value, found.heldBy);
   return ok({ closedAt: instant(closed.value.overdue!.silenced!.at) });
  },

  'POST /v1/safety/panics/{panicRef}/pick-up@1': (request, ctx) => {
   const panic = panicByRef(ctx, request.fields.panicRef);
   if (!panic) return refuse('no-such-panic');
   const picked = acknowledge(panic, deskActor(ctx), nowOf(ctx));
   if (!picked.ok) return refuse(picked.refusal.id);
   putDesk(ctx, picked.value);
   return ok({ pickedUpAt: instant(picked.value.acknowledged!.at) });
  },

  'POST /v1/safety/panics/{panicRef}/resolve@1': (request, ctx) => {
   const panic = panicByRef(ctx, request.fields.panicRef);
   if (!panic) return refuse('no-such-panic');
   const resolved = resolve(panic, { outcomeId: text(request.fields.outcomeCode), actor: deskActor(ctx) }, nowOf(ctx));
   if (!resolved.ok) return refuse(resolved.refusal.id);
   putDesk(ctx, resolved.value);
   /* The same subject panic.raised went out under, so a review can put the two side by side. */
   publishAll(ctx, resolved.emits, panic.raisedByRef ?? panic.panicRef);
   return ok({ resolvedAt: instant(resolved.value.resolved!.at), sharingEndedAt: instant(sharingEndsAt(resolved.value)) });
  },

  /* Only while the window is open, and positionFor is the only way to it: after the window, or after the panic
     was resolved, the desk is refused, and told sharing has ended rather than shown where she was. */
  'GET /v1/safety/panics/{panicRef}/position@1': (request, ctx) => {
   const panic = panicByRef(ctx, request.fields.panicRef);
   if (!panic) return refuse('no-such-panic');
   const seen = positionFor(panic, nowOf(ctx));
   if (!seen.ok) return refuse('position-no-longer-shared');
   return ok({
    sharingEndsAt: instant(sharingEndsAt(panic)),
    ...(seen.value ? { position: { lat: seen.value.lat, lng: seen.value.lng, at: instant(seen.value.at) } } : {})
   });
  },

  /* The queue, worked out from the timers and panics rather than kept, carrying the contract's keys and nothing
     else. A name and a suburb are the roster's, and Safety holds none: the nurse is the reference the runtime
     identified, and the suburb is null. A filter of any kind is refused rather than ignored. */
  'GET /v1/safety/desk-queue@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('desk-queue-takes-no-filter');
   const now = nowOf(ctx);
   const timers = allTimers(ctx);
   const panics = allPanics(ctx);
   const holders = new Map<string, string | null>([...timers.map(t => [t.timer.checkinRef, t.heldBy] as const), ...panics.map(p => [p.panicRef, p.raisedByRef] as const)]);
   const items = deskQueue(timers.map(t => t.timer), panics, now, () => ({ nurse: null, suburb: null })).map(item => ({
    kind: item.kind, reference: item.reference, nurse: holders.get(item.reference) ?? null, suburb: item.suburb,
    raisedAt: instant(item.raisedAt), ageMinutes: item.ageMinutes,
    acknowledgement: item.acknowledgement ? { at: instant(item.acknowledgement.at), by: item.acknowledgement.by } : null,
    answeredAt: item.answeredAt === null ? null : instant(item.answeredAt), outcome: item.outcome,
    sharingEndsAt: item.sharingEndsAt === null ? null : instant(item.sharingEndsAt), sharing: item.sharing, open: item.open
   }));
   return ok({ items });
  },

  /* A press. The patient is the caller the runtime identified, never a field: the runtime refuses an idempotent write
     from a caller it cannot identify, so there is always somebody. Every refusal comes before anything is written, and
     the attempts for next of kin are recorded in the same act, so a press is never on record without them. */
  'POST /v1/safety/sos@2': (request, ctx) => {
   const patientRef = ctx.caller.ref ?? ctx.caller.role;
   const now = nowOf(ctx);
   const pressed = raiseSos({
    sosRef: 'sos-' + randomUUID(), patientRef, channel: request.fields.channel,
    answers: { conditionTicked: request.fields.conditionTicked, zoneId: request.fields.zoneId, callbackAvailable: request.fields.callbackAvailable },
    undeclared: request.undeclared
   }, now, sosSettingsOf(historyOf(ctx.store)));
   if (!pressed.ok) return refuse(pressed.refusal.id);
   const sos = pressed.value;
   putSos(ctx, sos);
   const attempts = firstAttempts(sos, allNominations(ctx), () => 'notification-' + randomUUID(), now);
   for (const attempt of attempts) putAttempt(ctx, attempt);
   publishAll(ctx, pressed.emits, patientRef);
   const areaEnds = areaSharingEndsAt(sos);
   return ok({
    sosRef: sos.sosRef, stateCode: sosStateOf(sos), routedTo: sos.routedTo,
    ...(sos.failureCode === null ? {} : { failureCode: sos.failureCode }), ...(areaEnds === null ? {} : { areaSharedUntil: instant(areaEnds) }),
    partnerConnected, settingsVersion: sos.settingsVersion,
    nextOfKin: attempts.map(a => ({ nominationRef: a.nominationRef, notificationRef: a.notificationRef, statusCode: a.statusCode, reasonCode: a.reasonCode }))
   });
  },

  /* Only the person who pressed it, and somebody else's is answered as if it did not exist. */
  'POST /v1/safety/sos/{sosRef}/stand-down@1': (request, ctx) => {
   const found = sosByRef(ctx, request.fields.sosRef);
   const patientRef = ctx.caller.ref ?? ctx.caller.role;
   if (!found || found.patientRef !== patientRef) return refuse('no-sos-of-yours');
   const now = nowOf(ctx);
   const stood = standDownSos(found, { patientRef, reasonCode: request.fields.reasonCode }, now);
   if (!stood.ok) return refuse(stood.refusal.id);
   putSos(ctx, stood.value);
   publishAll(ctx, stood.emits, found.patientRef);
   return ok({ stoodDownAt: instant(now), areaSharingEndedAt: instant(areaSharingEndsAt(stood.value) ?? now) });
  },

  /* The desk's list carries the contract's keys and nothing else, and a filter of any kind is refused rather than ignored. */
  'GET /v1/safety/sos@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('sos-list-takes-no-filter');
   const items = sosDesk(allSos(ctx), allAttempts(ctx), nowOf(ctx)).map(row => ({
    sosRef: row.sosRef, raisedAt: instant(row.raisedAt), ageMinutes: row.ageMinutes, stateCode: row.stateCode, channel: row.channel,
    routedTo: row.routedTo, failureCode: row.failureCode, areaShared: row.areaShared, areaSharedUntil: optionalInstant(row.areaSharedUntil),
    stoodDown: row.stoodDown && { at: instant(row.stoodDown.at), reasonCode: row.stoodDown.reasonCode }, settingsVersion: row.settingsVersion,
    nextOfKin: row.nextOfKin.map(n => ({ ...n, windowEndsAt: instant(n.windowEndsAt) }))
   }));
   return ok({ items });
  },

  /* Only while the window is open and it has not been stood down, and areaFor is the only way to it. */
  'GET /v1/safety/sos/{sosRef}/area@1': (request, ctx) => {
   const found = sosByRef(ctx, request.fields.sosRef);
   if (!found) return refuse('no-such-sos');
   const seen = areaFor(found, nowOf(ctx));
   if (!seen.ok) return refuse(seen.refusal.id);
   return ok({ zoneId: seen.value.zoneId, sharedUntil: instant(seen.value.sharedUntil) });
  },

  'POST /v1/safety/next-of-kin@2': (request, ctx) => {
   const made = nominate({
    nominationRef: 'nomination-' + randomUUID(), actorRole: ctx.caller.role, patientRef: ctx.caller.ref ?? ctx.caller.role,
    contactRef: String(request.fields.contactRef), purpose: request.fields.purpose, consentVersion: request.fields.consentVersion, consentGiven: request.fields.consentGiven
   }, nowOf(ctx));
   if (!made.ok) return refuse(made.refusal.id);
   const nomination = made.value;
   putNomination(ctx, nomination);
   return ok({ nominationRef: nomination.nominationRef, purpose: nomination.purpose, consentVersion: nomination.consentVersion, nominatedAt: instant(nomination.nominatedAt), expiresAt: instant(nomination.expiresAt) });
  },

  'GET /v1/safety/next-of-kin@1': (_request, ctx) => {
   if (!ctx.caller.ref) return refuse('nominations-read-by-their-patient');
   const now = nowOf(ctx);
   const nominations = allNominations(ctx).filter(n => n.patientRef === ctx.caller.ref).sort((a, b) => b.nominatedAt - a.nominatedAt).map(n => ({
    nominationRef: n.nominationRef, contactRef: n.contactRef, purpose: n.purpose, consentVersion: n.consentVersion,
    nominatedAt: instant(n.nominatedAt), expiresAt: instant(n.expiresAt), withdrawnAt: optionalInstant(n.withdrawnAt), stateCode: nominationStateOf(n, now)
   }));
   return ok({ nominations });
  },

  'POST /v1/safety/next-of-kin/{nominationRef}/withdraw@1': (request, ctx) => {
   const withdrawn = withdrawNomination(nominationByRef(ctx, request.fields.nominationRef), { actorRole: ctx.caller.role, patientRef: ctx.caller.ref ?? ctx.caller.role }, nowOf(ctx));
   if (!withdrawn.ok) return refuse(withdrawn.refusal.id);
   putNomination(ctx, withdrawn.value);
   return ok({ withdrawnAt: instant(withdrawn.value.withdrawnAt!) });
  },

  /* Nothing is sent, so nothing is published: the attempt is recorded as not sent, with why, and what it would have said. */
  'POST /v1/safety/next-of-kin/{nominationRef}/alert@2': (request, ctx) => {
   const sos = sosByRef(ctx, request.fields.sosRef);
   const nomination = nominationByRef(ctx, request.fields.nominationRef);
   const now = nowOf(ctx);
   const tried = alertAgain({
    actorRole: ctx.caller.role, sos, nomination, undeclared: request.undeclared, notificationRef: 'notification-' + randomUUID(),
    attemptsSoFar: sos && nomination ? attemptsFor(ctx, sos.sosRef, nomination.nominationRef) : 0
   }, now);
   if (!tried.ok) return refuse(tried.refusal.id);
   const attempt = tried.value;
   putAttempt(ctx, attempt);
   return ok({ notificationRef: attempt.notificationRef, statusCode: attempt.statusCode, reasonCode: attempt.reasonCode, attempt: attempt.attempt, attemptsAllowed: sos!.attemptsAllowed, windowEndsAt: instant(sos!.alertWindowEndsAt), wouldSay: wouldSay(now) });
  },

  /* A tier raised by a named clinician. Every refusal is decided on the readings Sentinel heard, before anything is kept,
     and the patient's token is the subject of the event, as it is of any alert about a patient. */
  'POST /v1/safety/sentinel-deviations@2': (request, ctx) => {
   const now = nowOf(ctx);
   const raised = raiseByHand({
    deviationRef: 'deviation-' + randomUUID(), subjectRef: request.fields.subjectRef, recordEntryRef: request.fields.recordEntryRef, rung: request.fields.rung,
    byRole: ctx.caller.role, byRef: ctx.caller.ref, undeclared: request.undeclared
   }, allHeard(ctx), now);
   if (!raised.ok) return refuse(raised.refusal.id);
   const deviation = raised.value;
   ctx.store.prepare('INSERT INTO sentinel_deviations (deviation_ref, subject_ref, doc) VALUES (?, ?, ?)').run(deviation.deviationRef, deviation.subjectRef, JSON.stringify(deviation));
   publishSentinel(ctx, raised.emits, deviation.subjectRef);
   return ok({ deviationRef: deviation.deviationRef, rung: deviation.rung, raisedAt: instant(now), toldCode: deviation.toldCode, evaluationCode: evaluate().code });
  },

  /* Read whole, from what each baseline kept, with the evaluation's answer — which is not evaluated — and never a value. */
  'GET /v1/safety/sentinel-baselines@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('sentinel-read-takes-no-filter');
   const state = stateFor(String(request.fields.subjectRef), allBaselines(ctx), allHeard(ctx), allDeviations(ctx), nowOf(ctx));
   if (!state) return refuse('nothing-heard-for-that-patient');
   return ok({
    evaluationCode: state.evaluation.code, notEvaluatedReasonCode: state.evaluation.reasonCode,
    baselines: state.baselines.map(b => ({
     metric: b.metric, stateCode: b.stateCode, countedSoFar: b.countedSoFar, neededToForm: b.neededToForm, windowDays: b.windowDays,
     settingsVersion: b.settingsVersion, openedAt: instant(b.openedAt), suspendedSince: optionalInstant(b.suspendedSince), leftByRecall: b.leftByRecall
    })),
    raised: state.raised.map(d => ({ deviationRef: d.deviationRef, rung: d.rung, recordEntryRef: d.recordEntryRef, raisedAt: instant(d.raisedAt), raisedByRole: d.raisedByRole, toldCode: d.toldCode }))
   });
  },

  /* Recorded, held for the officer and not sent, in one act. The report is the subject of the event rather than the patient,
     so no engine's log learns that a safeguarding concern exists about somebody. */
  'POST /v1/safety/safeguarding-reports@2': (request, ctx) => {
   const now = nowOf(ctx);
   const recorded = recordReport({
    reportRef: 'safeguarding-' + randomUUID(), subjectRef: String(request.fields.subjectRef), groupCode: request.fields.groupCode, categoryCode: request.fields.categoryCode,
    byRole: ctx.caller.role, byRef: ctx.caller.ref, undeclared: request.undeclared
   }, now);
   if (!recorded.ok) return refuse(recorded.refusal.id);
   const report = recorded.value;
   ctx.store.prepare('INSERT INTO safeguarding_reports (report_ref, doc) VALUES (?, ?)').run(report.reportRef, JSON.stringify(report));
   publishSentinel(ctx, recorded.emits, report.reportRef);
   return ok({ reportRef: report.reportRef, recordedAt: instant(now), stateCode: report.stateCode, heldForCode: report.heldForCode, statutoryCode: report.statutoryCode, statutoryReasonCode: report.statutoryReasonCode });
  },

  /* A guardian is refused before anything else, then a filter. The rows are reportsForDesk()'s, which carry no kind, no patient and no reporter. */
  'GET /v1/safety/safeguarding-reports@1': (request, ctx) => {
   const guardian = guardianRefused(ctx.caller.role);
   if (guardian) return refuse(guardian.refusal.id);
   if (request.undeclared.length) return refuse('safeguarding-list-takes-no-filter');
   return ok({ items: reportsForDesk(allReports(ctx), nowOf(ctx)).map(row => ({ ...row, recordedAt: instant(row.recordedAt) })) });
  },

  /* Sentinel's baseline window and minimum wait on a clinical review (Wave 5), so who confirms one is Clinical's
     review-confirmer setting in force, asked of Clinical, as it is on Access, Care and Medicines. */
  ...settingsRoutes(safetySettings, { read: 'GET /v1/safety/settings@4', change: 'POST /v1/safety/setting-changes@2', review: 'POST /v1/safety/setting-reviews@2' }, { confirmers: confirmersFromClinical })
 },
 subscriptions: {
  'appointment.in_progress@2': (event, ctx) => {
   if (event.payload.visitCodeMatched !== true || typeof event.payload.appointmentRef !== 'string') return;
   /* The settings in force when the visit started, kept on the timer. OR IGNORE keeps the first: the same visit
      heard again is not a new start, and must not pick up a change made since. */
   const settings = inForce(historyOf(ctx.store));
   const started = startTimer({
    checkinRef: 'checkin-' + randomUUID(), event: { appointmentRef: event.payload.appointmentRef, visitCodeMatched: true },
    serviceId: String(event.payload.serviceId), nurseRef: null
   }, ctx.clock.now().getTime(), settings);
   if (!started.ok) throw new Error(`Safety heard ${event.payload.appointmentRef} under way and could not time it: ${started.refusal.statement}`);
   ctx.store.prepare('INSERT OR IGNORE INTO timers (checkin_ref, appointment_ref, settings_version, held_by_ref, doc) VALUES (?, ?, ?, ?, ?)')
    .run(started.value.checkinRef, started.value.appointmentRef, started.value.settingsVersion, null, JSON.stringify(started.value));
  },
  /* Finished and signed: nobody is left in the house to time. An overdue the desk was paged about stays on the
     desk, answered, until a person there closes it. */
  'appointment.completed@2': (event, ctx) => {
   const found = timerByVisit(ctx, event.payload.appointmentRef);
   if (!found) return;
   const completed = completeVisit(found.timer, ctx.clock.now().getTime());
   if (completed.ok) putTimer(ctx, completed.value, found.heldBy);
  },
  /* A reading that reached the record with clinical weight, which is the only kind Devices publishes on this event. It is
     heard once, opens the patient's baseline for its measure under the settings in force if none is open, and lifts a
     suspension its device's silence put on any baseline. A payload without what it declares fails loudly on the trail,
     rather than a reading quietly missing from somebody's baseline. */
  'reading.ingested@1': (event, ctx) => {
   const now = nowOf(ctx);
   const reading = heard(event.payload, event.subjectRef, now);
   if (!reading) throw new Error('Safety heard reading.ingested@1 without the reading, device, measure and record entry it declares, and cannot place it in a baseline.');
   const kept = ctx.store.prepare(`INSERT OR IGNORE INTO sentinel_heard (${HEARD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(reading.readingRef, reading.subjectRef, reading.deviceRef, reading.metric, reading.recordEntryRef, reading.heardAt, null);
   if (!kept.changes) return;
   const baselines = allBaselines(ctx);
   if (!baselines.some(b => b.subjectRef === reading.subjectRef && b.metric === reading.metric)) {
    putBaseline(ctx, openBaseline(reading.subjectRef, reading.metric, sentinelSettingsOf(historyOf(ctx.store)), now));
   }
   for (const lifted of resumeFor(baselines, reading.deviceRef, now)) putBaseline(ctx, lifted);
  },
  /* Devices announced a certified device stale under its own interval in force. Safety knows no interval: it suspends,
     from now, every baseline a counted reading from the device is in. */
  'device.stale@1': (event, ctx) => {
   const deviceRef = text(event.payload.deviceRef);
   if (!deviceRef) return;
   for (const suspended of suspendFor(allBaselines(ctx), allHeard(ctx), deviceRef, nowOf(ctx))) putBaseline(ctx, suspended);
  },
  /* Every reading from a recalled device leaves every baseline, marked with when; none is deleted. */
  'device.recalled@1': (event, ctx) => {
   const deviceRef = text(event.payload.deviceRef);
   if (!deviceRef) return;
   const now = nowOf(ctx);
   const left = leaveByRecall(allHeard(ctx), allBaselines(ctx), deviceRef, now);
   for (const reading of left.readings) ctx.store.prepare('UPDATE sentinel_heard SET left_by_recall_at = ? WHERE reading_ref = ? AND left_by_recall_at IS NULL').run(now, reading.readingRef);
   for (const baseline of left.baselines) putBaseline(ctx, baseline);
  }
 },
 tick: ctx => {
  const now = nowOf(ctx);
  /* The area an SOS was pressed from is dropped when the window it was pressed under ends. areaFor() refuses after it
     whether or not this has run; this is what makes nothing keeping where somebody was true of the store itself. */
  ctx.store.prepare('UPDATE sos SET zone_id = NULL WHERE zone_id IS NOT NULL AND area_ends_at <= ?').run(now);
  for (const { timer, heldBy } of allTimers(ctx)) {
   if (timer.closedAt !== null) continue;
   const ticked = tickTimer(timer, now);
   if (!ticked.ok || !ticked.emits.length) continue;
   putTimer(ctx, ticked.value, heldBy);
   /* The check-in is the subject: Safety keeps no patient's token, and the event is about a timer. */
   publishAll(ctx, ticked.emits, timer.checkinRef, OVERDUE_PURPOSE);
  }
 }
});
