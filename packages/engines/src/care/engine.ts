/* The Care engine on the development runtime: ten routes, three subscriptions and a tick, each a
 * thin binding of the pure domain in ./domain to this engine's own SQLite store.
 *
 * WHAT A HANDLER DOES, AND ALL IT DOES. Load the desks from the store, hand the domain the declared
 * fields, the admitted caller and the simulated clock, publish the events the act produced, write the
 * desks back. A refusal is answered by id and the runtime renders the contract's status and sentence,
 * rolls the store back and drops the events, so nothing here types a sentence or undoes a write. The
 * nurse a request is from is the caller reference the runtime admitted, never a field in the body.
 *
 * WHERE THE DATA COMES FROM, AND WHERE IT DOES NOT.
 *   Candidates  packages/catalog/roster.json's nine fictional nurses, each measured from the centre of
 *               her suburb in packages/catalog/geography.json. The nurse-roster door is not built.
 *   Badges      person.trust_updated at version 2, and nothing else. Until Verify publishes one about a
 *               nurse she has no badge here and is withheld — on a fresh runtime that is everybody, which
 *               is the rule working, not the engine broken.
 *   Visits      booking.requested at version 2 registers one, with its suburb's zone id and the nurse
 *               asked for by name, and publishes appointment.requested. A zone geography.json does not
 *               hold is refused an offer until Care is told where the visit is. packages/catalog/care.json's
 *               preview is seeded into the store with its suburb and scheduled against the runtime's clock.
 *   Encounters  The record says one exists by publishing passport.entry.written for an Encounter. No
 *               record route admits engine:care, so that event is the only way Care can know an
 *               encounter is complete and signed, and until it arrives handover and completion refuse.
 *   Codes       The preview's published code for the preview visit; a random six digits for any other,
 *               issued at acceptance and held beside the visit. Who hands it to the patient is Access's
 *               to build and is not here.
 *   Settings    GET /v1/care/settings@1, POST /v1/care/setting-changes@1 and POST /v1/care/setting-reviews@1,
 *               through packages/engines/src/settings, with the history in this store's settings_history
 *               and the clinical reviews in settings_reviews. The offer desk is handed the settings in
 *               force when it makes an offer — the expiry and who may be offered the service — and the
 *               visit desk when a visit starts — whether an Encounter entry counts as signed — and each
 *               keeps what it read: a change reaches the next offer and the next visit, never one already
 *               under way. A doctor confirms a scope setting's review through the review route; until one
 *               does the value is in force and the read route says it is not clinically reviewed.
 *
 *   Named     booking.requested@2's namedNurseFallback is kept beside the appointment. With wait the offer desk
 *   nurses    re-offers only the named nurse while the visit's hour has not come; when she cannot be reached the
 *             offer route refuses with waiting-for-named-nurse and keeps the one row saying the patient is told,
 *             in care_named_waits. With soonest it passes on and records who it went to. No event carries either
 *             to Access yet, so the row is Care's and the telling reaches a patient only on the web preview.
 *   Sync      POST /v1/care/sync-batches@2 carries each operation's visit, observation entry, measure and phone
 *             time, and binds the domain's SyncIntake, with its batches and attached measures in this store.
 *
 *   SOS       sos.raised@2 whose door offers a visit registers the catalogue's sos service as an urgent visit in the
 *             area chosen, scheduled for the moment it was heard, and asks the offer desk for it with every gate in
 *             place; Care's answer — the offer, or the refusal — is kept in care_sos. On this runtime the answer is
 *             service-not-offered, because the catalogue places sos in a later phase than the seed. sos.stood_down@1
 *             withdraws any offer for it still open. See ./domain/sos.ts.
 *
 * WHAT IS NOT BOUND. The four reads (shifts, services, locum shifts, circuits) are answered by the contract mock. */
import { randomInt } from 'node:crypto';
import roster from '../../../catalog/roster.json' with { type: 'json' };
import geography from '../../../catalog/geography.json' with { type: 'json' };
import care from '../../../catalog/care.json' with { type: 'json' };
import records from '../../../catalog/records.json' with { type: 'json' };
import { defineEngine, ok, refuse, type Answer, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsIn, settingsRoutes } from '../settings/routes.ts';
import {
 careContract, careInForceOf, careSettings, instantAt, OfferDesk, SyncIntake, TrustCache, VisitDesk,
 type AppointmentToFill, type Candidate, type CareEvent, type NamedFallback, type NamedWait, type Offer, type QueuedCapture, type Received, type Visit
} from './domain/index.ts';
import { opensAnUrgentVisit, urgentVisitFor, withdrawnOnStandDown } from './domain/sos.ts';
import { withdrawnOnAdmission } from './domain/admission.ts';

const FALLBACKS: readonly NamedFallback[] = ['wait', 'soonest'];
const OPERATION_KINDS: readonly string[] = care.sync.operationKinds;
const MEASURES = new Set(records.observations.measures.map(m => m.id));
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const zoneAt = (name: string | null) => (name ? geography.zones.find(z => z.id === name || z.name === name)?.at : undefined) ?? null;

const CANDIDATES: readonly Candidate[] = roster.nurses.map(n => ({ clinicianRef: n.id, roleId: 'nurse', scope: n.scope, base: zoneAt(n.zone) }));

const sql = (value: string | number | null) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`;
const preview = care.preview;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS care_appointments (
 appointment_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, service_id TEXT NOT NULL, zone_id TEXT,
 scheduled_for TEXT, day_offset INTEGER, slot TEXT, named_clinician_ref TEXT,
 previous_clinician_refs TEXT NOT NULL DEFAULT '[]', visit_code TEXT
);
CREATE TABLE IF NOT EXISTS care_offers (offer_ref TEXT PRIMARY KEY, appointment_ref TEXT NOT NULL, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_visits (appointment_ref TEXT PRIMARY KEY, document TEXT NOT NULL, visit_code TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_badges (subject_ref TEXT PRIMARY KEY, badge_tier TEXT NOT NULL, hard_gates_passed INTEGER NOT NULL, occurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_encounters (entry_ref TEXT PRIMARY KEY, author_ref TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_booking_requests (appointment_ref TEXT PRIMARY KEY, booking_ref TEXT NOT NULL UNIQUE, named_nurse_fallback TEXT);
CREATE TABLE IF NOT EXISTS care_named_waits (appointment_ref TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_sync_batches (batch_key TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_sync_observed (appointment_ref TEXT NOT NULL, measure TEXT NOT NULL, PRIMARY KEY (appointment_ref, measure));
CREATE TABLE IF NOT EXISTS care_sos (sos_ref TEXT PRIMARY KEY, appointment_ref TEXT NOT NULL, offer_ref TEXT, refused_id TEXT, heard_at TEXT NOT NULL, stood_down_at TEXT);
INSERT OR IGNORE INTO care_appointments (appointment_ref, subject_ref, service_id, zone_id, day_offset, slot, named_clinician_ref, previous_clinician_refs, visit_code)
 VALUES (${sql(preview.appointmentRef)}, ${sql(preview.subjectRef)}, ${sql(preview.serviceId)}, ${sql(preview.zone)}, ${preview.dayOffset}, ${sql(preview.slot)},
         ${sql(preview.namedClinicianRef)}, ${sql(JSON.stringify(preview.previousClinicianRefs))}, ${sql(preview.visitCode)});
${SETTINGS_SCHEMA}
`;

type AppointmentRow = {
 appointment_ref: string; subject_ref: string; service_id: string; zone_id: string | null; scheduled_for: string | null;
 day_offset: number | null; slot: string | null; named_clinician_ref: string | null; previous_clinician_refs: string; visit_code: string | null;
};

type Desks = { trust: TrustCache; offers: OfferDesk; visits: VisitDesk; sync: SyncIntake; rows: AppointmentRow[] };

function load(ctx: EngineContext): Desks {
 const now = ctx.clock.now();
 const rows = ctx.store.prepare('SELECT * FROM care_appointments').all() as AppointmentRow[];
 for (const row of rows) {
  /* The preview visit is scheduled against the runtime's clock the first time anybody reads it, and
     then kept, so advancing the clock past midnight does not move the visit with it. */
  if (row.scheduled_for === null && row.day_offset !== null && row.slot) row.scheduled_for = instantAt(now, row.day_offset, row.slot, careContract.timezone);
 }
 /* What a booking asked for, beside the appointment it opened: its own reference, which completion carries back
    to Access, and the patient's answer to what happens if the nurse asked for by name cannot take it. A separate
    table rather than new columns, so a development store written before either existed is read, not rewritten. */
 const requested = new Map((ctx.store.prepare('SELECT appointment_ref, booking_ref, named_nurse_fallback FROM care_booking_requests').all() as { appointment_ref: string; booking_ref: string; named_nurse_fallback: string | null }[])
  .map(r => [r.appointment_ref, r]));
 const appointments: AppointmentToFill[] = rows.map(row => ({
  appointmentRef: row.appointment_ref, subjectRef: row.subject_ref, serviceId: row.service_id, zone: zoneAt(row.zone_id),
  scheduledFor: row.scheduled_for ?? '', namedClinicianRef: row.named_clinician_ref,
  previousClinicianRefs: JSON.parse(row.previous_clinician_refs) as string[],
  bookingRef: requested.get(row.appointment_ref)?.booking_ref ?? null,
  /* An answer this engine does not recognise is kept as no answer, which the offer desk reads as wait. */
  namedNurseFallback: FALLBACKS.find(f => f === requested.get(row.appointment_ref)?.named_nurse_fallback) ?? null
 }));
 const told = (ctx.store.prepare('SELECT document FROM care_named_waits').all() as { document: string }[]).map(r => JSON.parse(r.document) as NamedWait);
 const offers = (ctx.store.prepare('SELECT document FROM care_offers ORDER BY rowid').all() as { document: string }[]).map(r => JSON.parse(r.document) as Offer);
 const held = (ctx.store.prepare('SELECT document, visit_code FROM care_visits').all() as { document: string; visit_code: string }[])
  .map(r => ({ visit: JSON.parse(r.document) as Visit, visitCode: r.visit_code }));
 const badges = (ctx.store.prepare('SELECT * FROM care_badges').all() as { subject_ref: string; badge_tier: string; hard_gates_passed: number; occurred_at: string }[])
  .map(b => ({ subjectRef: b.subject_ref, badgeTier: b.badge_tier, hardGatesPassed: b.hard_gates_passed === 1, occurredAt: b.occurred_at }));
 const written = new Set((ctx.store.prepare('SELECT entry_ref FROM care_encounters').all() as { entry_ref: string }[]).map(r => r.entry_ref));
 const trust = new TrustCache(careContract.badgeTiers, badges);
 /* Asked when an offer is made or a visit starts, from this store's own history, and kept by what asked. */
 const inForce = () => careInForceOf(settingsIn(careSettings, ctx.store));
 const visits = new VisitDesk({ contract: careContract, held, settings: inForce, record: { encounterComplete: ref => written.has(ref), encounterSigned: ref => written.has(ref) } });
 const batches = (ctx.store.prepare('SELECT batch_key, document FROM care_sync_batches').all() as { batch_key: string; document: string }[]).map(r => [r.batch_key, JSON.parse(r.document) as Received] as const);
 const observed = (ctx.store.prepare('SELECT appointment_ref, measure FROM care_sync_observed').all() as { appointment_ref: string; measure: string }[]).map(r => [r.appointment_ref, r.measure] as const);
 return {
  trust, rows, visits,
  offers: new OfferDesk({ contract: careContract, trust, candidates: () => CANDIDATES, book: { appointments, offers, bookings: held.map(h => h.visit), told }, settings: inForce }),
  sync: new SyncIntake({ contract: careContract, visits, trust, state: { batches, observed } })
 };
}

/* The one row a refused offer may keep, as POST /v1/care/offers@2's keptOnRefusal names it: that the patient of a
   visit waiting for a named nurse is to be told she cannot take it. Everything else the refusal did rolls back. */
const TOLD_UPSERT = 'INSERT INTO care_named_waits (appointment_ref, document) VALUES (?, ?) ON CONFLICT(appointment_ref) DO UPDATE SET document = excluded.document';

function save(ctx: EngineContext, desks: Desks): void {
 const s = ctx.store;
 for (const row of desks.rows) s.prepare('UPDATE care_appointments SET scheduled_for = ? WHERE appointment_ref = ? AND scheduled_for IS NULL').run(row.scheduled_for, row.appointment_ref);
 for (const o of desks.offers.state().offers) {
  s.prepare('INSERT INTO care_offers (offer_ref, appointment_ref, document) VALUES (?, ?, ?) ON CONFLICT(offer_ref) DO UPDATE SET document = excluded.document').run(o.offerRef, o.appointmentRef, JSON.stringify(o));
 }
 for (const { visit, visitCode } of desks.visits.state()) {
  s.prepare('INSERT INTO care_visits (appointment_ref, document, visit_code) VALUES (?, ?, ?) ON CONFLICT(appointment_ref) DO UPDATE SET document = excluded.document').run(visit.appointmentRef, JSON.stringify(visit), visitCode);
 }
 for (const b of desks.trust.state()) {
  s.prepare('INSERT INTO care_badges (subject_ref, badge_tier, hard_gates_passed, occurred_at) VALUES (?, ?, ?, ?) ON CONFLICT(subject_ref) DO UPDATE SET badge_tier = excluded.badge_tier, hard_gates_passed = excluded.hard_gates_passed, occurred_at = excluded.occurred_at')
   .run(b.subjectRef, b.badgeTier, b.hardGatesPassed ? 1 : 0, b.occurredAt);
 }
 for (const t of desks.offers.state().told ?? []) s.prepare(TOLD_UPSERT).run(t.appointmentRef, JSON.stringify(t));
 const synced = desks.sync.state();
 for (const [key, received] of synced.batches) s.prepare('INSERT OR IGNORE INTO care_sync_batches (batch_key, document) VALUES (?, ?)').run(key, JSON.stringify(received));
 for (const [appointmentRef, measure] of synced.observed) s.prepare('INSERT OR IGNORE INTO care_sync_observed (appointment_ref, measure) VALUES (?, ?)').run(appointmentRef, measure);
}

/* An operation in a queued batch, held to the inner shape POST /v1/care/sync-batches@2 declares. The binder checks
   that operations is a list of objects; what is inside each is the handler's to hold, and a batch with one
   operation it cannot read is refused whole rather than applied round it. */
type Operation = { operationRef: string; kind: string; appointmentRef: string; observationRef: string; measure: string; deviceAt: string };
const words = (row: Record<string, unknown>, ...names: string[]) => names.every(n => typeof row[n] === 'string' && (row[n] as string).trim() !== '');
function operationsIn(request: HandlerRequest): { ok: true; operations: Operation[] } | { ok: false; id: string } {
 const rows = Array.isArray(request.fields.operations) ? request.fields.operations as unknown[] : [];
 const objects = rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row));
 if (objects.length !== rows.length) return { ok: false, id: 'operation-incomplete' };
 /* What was queued is asked before whether it is complete: a start queued without a measure is refused as a start. */
 if (objects.some(row => typeof row.kind === 'string' && !OPERATION_KINDS.includes(row.kind))) return { ok: false, id: 'operation-not-replayed' };
 const complete = objects.every(row => words(row, 'operationRef', 'kind', 'appointmentRef', 'observationRef', 'measure', 'deviceAt')
  && MEASURES.has(row.measure as string) && INSTANT.test(row.deviceAt as string) && Number.isFinite(Date.parse(row.deviceAt as string)));
 return complete ? { ok: true, operations: objects as unknown as Operation[] } : { ok: false, id: 'operation-incomplete' };
}

/* The domain's events, onto the bus. The actor defaults to the admitted caller's role; a tick says it
   was the system, and passes the purpose the domain took from the route, as the runtime requires. */
function publish(ctx: EngineContext, events: readonly CareEvent[], fromTick = false): void {
 for (const e of events) {
  ctx.publish(`${e.type}@${e.version}` as EventKey, e.payload, { subjectRef: e.subjectRef, purposeOfUse: e.purposeOfUse, ...(fromTick ? { actorRole: 'system' } : {}) });
 }
}

const text = (request: HandlerRequest, field: string) => String(request.fields[field] ?? '');
const list = (request: HandlerRequest, field: string) => Array.isArray(request.fields[field]) ? (request.fields[field] as unknown[]).map(String) : [];

/* One shape for every route: who is asking, load, act, and either refuse or save and answer. */
type Act = (request: HandlerRequest, desks: Desks, now: Date, clinicianRef: string, ctx: EngineContext) => Answer;
function bind(act: Act, needsClinician = true) {
 return (request: HandlerRequest, ctx: EngineContext): Answer => {
  const clinicianRef = ctx.caller.ref ?? '';
  if (needsClinician && !clinicianRef) return refuse('caller-not-allowed');
  const desks = load(ctx);
  const answered = act(request, desks, ctx.clock.now(), clinicianRef, ctx);
  if ('ok' in answered) save(ctx, desks);
  return answered;
 };
}

export const engine = defineEngine({
 id: 'care',
 store: { schema: SCHEMA },

 routes: {
  /* A visit waiting for a named nurse she cannot be offered is refused, and the refusal keeps the row saying the
     patient is told so — the runtime rolls everything else back, and without the row nobody would ever be told. */
  'POST /v1/care/offers@2': bind((request, desks, now, _ref, ctx) => {
   const appointmentRef = text(request, 'appointmentRef');
   const made = desks.offers.offer({ idempotencyKey: ctx.idempotencyKey ?? text(request, 'idempotencyKey'), appointmentRef, serviceId: text(request, 'serviceId') }, now);
   if (!made.ok) {
    const told = made.id === 'waiting-for-named-nurse' ? desks.offers.toldFor(appointmentRef) : null;
    if (told) ctx.recordRefusal(TOLD_UPSERT, told.appointmentRef, JSON.stringify(told));
    return refuse(made.id);
   }
   publish(ctx, made.events);
   return ok({ offerRef: made.value.offerRef, offerExpiresAt: made.value.offerExpiresAt });
  }, false),

  'POST /v1/care/offers/{offerRef}/accept@1': bind((request, desks, now, clinicianRef, ctx) => {
   const accepted = desks.offers.accept({ idempotencyKey: ctx.idempotencyKey ?? text(request, 'idempotencyKey'), offerRef: text(request, 'offerRef') }, { clinicianRef }, now);
   if (!accepted.ok) return refuse(accepted.id);
   const booking = desks.offers.booking(accepted.value.appointmentRef)!;
   const row = desks.rows.find(r => r.appointment_ref === booking.appointmentRef);
   desks.visits.hold(booking, row?.visit_code ?? String(randomInt(0, 1_000_000)).padStart(6, '0'));
   publish(ctx, accepted.events);
   return ok({ appointmentRef: accepted.value.appointmentRef, scheduledFor: accepted.value.scheduledFor });
  }),

  /* Declining does not pass the visit on here. The route emits nothing, so the next offer is made from
     the tick, as an act of offering with its own appointment.offered. */
  'POST /v1/care/offers/{offerRef}/decline@1': bind((request, desks, now, clinicianRef, ctx) => {
   const declined = desks.offers.decline({ idempotencyKey: ctx.idempotencyKey ?? text(request, 'idempotencyKey'), offerRef: text(request, 'offerRef') }, { clinicianRef }, now, { passOn: false });
   if (!declined.ok) return refuse(declined.id);
   return ok({ declined: true });
  }),

  'POST /v1/care/visits/{appointmentRef}/start@1': bind((request, desks, now, clinicianRef, ctx) => {
   const started = desks.visits.start({ appointmentRef: text(request, 'appointmentRef'), visitCode: text(request, 'visitCode') }, { clinicianRef }, now);
   if (!started.ok) return refuse(started.id);
   publish(ctx, started.events);
   return ok({ startedAt: started.value.startedAt });
  }),

  'POST /v1/care/visits/{appointmentRef}/checklist@1': bind((request, desks, now, clinicianRef) => {
   const recorded = desks.visits.checklist({ appointmentRef: text(request, 'appointmentRef'), protocolVersionId: text(request, 'protocolVersionId'), completedItems: list(request, 'completedItems') }, { clinicianRef }, now);
   if (!recorded.ok) return refuse(recorded.id);
   return ok({ recordedAt: recorded.value.recordedAt });
  }),

  'POST /v1/care/visits/{appointmentRef}/capture@1': bind((request, desks, _now, clinicianRef) => {
   const attached = desks.visits.capture({ appointmentRef: text(request, 'appointmentRef'), observationRefs: list(request, 'observationRefs') }, { clinicianRef });
   if (!attached.ok) return refuse(attached.id);
   return ok({ attachedCount: attached.value.attachedCount });
  }),

  'POST /v1/care/visits/{appointmentRef}/handover@2': bind((request, desks, now, clinicianRef, ctx) => {
   const queued = desks.visits.handover({ appointmentRef: text(request, 'appointmentRef'), encounterRef: text(request, 'encounterRef') }, { clinicianRef }, now);
   if (!queued.ok) return refuse(queued.id);
   publish(ctx, queued.events);
   return ok({ reviewQueued: queued.value.reviewQueued });
  }),

  'POST /v1/care/visits/{appointmentRef}/complete@2': bind((request, desks, now, clinicianRef, ctx) => {
   const done = desks.visits.complete({ appointmentRef: text(request, 'appointmentRef'), visitCode: text(request, 'visitCode'), encounterRef: text(request, 'encounterRef') }, { clinicianRef }, now);
   if (!done.ok) return refuse(done.id);
   publish(ctx, done.events);
   return ok({ completedAt: done.value.completedAt });
  }),

  /* The offline queue, decided by the domain's SyncIntake exactly as packages/catalog/capture.json resolves each
     conflict. Who captured a reading is the nurse the runtime admitted, never a field in the batch. Conflicts are
     answered rather than refused, because a refusal rolls back the readings that did apply. */
  'POST /v1/care/sync-batches@2': bind((request, desks, now, clinicianRef) => {
   const read = operationsIn(request);
   if (!read.ok) return refuse(read.id);
   const operations: QueuedCapture[] = read.operations.map(o => ({
    operationRef: o.operationRef, kind: 'capture', appointmentRef: o.appointmentRef, observationId: o.measure, observationRef: o.observationRef, capturedBy: clinicianRef, deviceAt: o.deviceAt
   }));
   const received = desks.sync.receive({ batchRef: text(request, 'batchRef'), operations }, { clinicianRef }, now);
   if (!received.ok) return refuse(received.id);
   const r = received.value;
   return ok({
    acceptedCount: r.acceptedCount,
    applied: r.applied.map(a => ({ operationRef: a.operationRef, receivedAt: a.receivedAt, deviceAt: a.deviceBelieved, clockSkew: a.clockSkew })),
    conflicts: r.conflicts.map(c => ({ operationRef: c.operationRef, conflictCode: c.conflictId })),
    refused: r.refused.map(x => ({ operationRef: x.operationRef, refusalId: x.id })),
    ...(r.notMerged ? { notMerged: r.notMerged } : {})
   });
  }),

  ...settingsRoutes(careSettings, { read: 'GET /v1/care/settings@1', change: 'POST /v1/care/setting-changes@1', review: 'POST /v1/care/setting-reviews@1' })
 },

 subscriptions: {
  'person.trust_updated@2': (event, ctx) => {
   const desks = load(ctx);
   desks.trust.learn({ type: event.type, version: event.version, subjectRef: event.subjectRef, occurredAt: event.occurredAt, payload: event.payload as { badgeTier: string; hardGatesPassed: boolean } });
   save(ctx, desks);
  },

  'passport.entry.written@1': (event, ctx) => {
   if (event.payload.resourceType !== 'Encounter') return;
   ctx.store.prepare('INSERT OR IGNORE INTO care_encounters (entry_ref, author_ref) VALUES (?, ?)').run(String(event.payload.entryRef), String(event.payload.authorRef));
  },

  /* booking.requested@2 names the suburb by its zone id in geography.json, and the nurse asked for by name when
     there was one. The zone is kept as its id and resolved to the zone's centre when an offer is made, so a zone
     geography.json does not hold is refused an offer as visit-zone-unknown rather than guessed at. */
  /* An SOS whose door offers a visit is an urgent visit, offered through the same desk and gates as any other. Care's
     own answer, offered or refused, is kept beside the SOS, so a refusal is on record rather than silent. Any other door
     opens nothing here, and no plan is read. */
  'sos.raised@2': (event, ctx) => {
   if (!opensAnUrgentVisit(event.payload.routedTo)) return;
   const sosRef = String(event.payload.sosRef);
   const zoneId = typeof event.payload.zoneId === 'string' ? event.payload.zoneId : null;
   const now = ctx.clock.now();
   const visit = urgentVisitFor({ sosRef, subjectRef: event.subjectRef, zone: zoneAt(zoneId) }, now);
   const fresh = ctx.store.prepare('INSERT OR IGNORE INTO care_appointments (appointment_ref, subject_ref, service_id, zone_id, scheduled_for) VALUES (?, ?, ?, ?, ?)')
    .run(visit.appointmentRef, visit.subjectRef, visit.serviceId, zoneId, visit.scheduledFor);
   if (!fresh.changes) return;
   const desks = load(ctx);
   const made = desks.offers.offer({ idempotencyKey: 'sos-' + sosRef, appointmentRef: visit.appointmentRef, serviceId: visit.serviceId }, now);
   ctx.store.prepare('INSERT INTO care_sos (sos_ref, appointment_ref, offer_ref, refused_id, heard_at) VALUES (?, ?, ?, ?, ?)')
    .run(sosRef, visit.appointmentRef, made.ok ? made.value.offerRef : null, made.ok ? null : made.id, now.toISOString());
   if (!made.ok) return;
   publish(ctx, made.events);
   save(ctx, desks);
  },

  /* Stood down: an offer nobody accepted is withdrawn, so no nurse takes a visit nobody needs and the tick never passes
     it on. An accepted visit is a person's to call off, and stays as it is. */
  'sos.stood_down@1': (event, ctx) => {
   const sosRef = String(event.payload.sosRef);
   const held = ctx.store.prepare('SELECT appointment_ref FROM care_sos WHERE sos_ref = ?').get(sosRef) as { appointment_ref: string } | undefined;
   if (!held) return;
   ctx.store.prepare('UPDATE care_sos SET stood_down_at = ? WHERE sos_ref = ? AND stood_down_at IS NULL').run(ctx.clock.iso(), sosRef);
   const desks = load(ctx);
   for (const offer of withdrawnOnStandDown(desks.offers.offersFor(held.appointment_ref), sosRef)) offer.state = 'withdrawn';
   save(ctx, desks);
  },

  /* Wave 5: a hospital admitted the patient, so an offer nobody accepted for any of their visits is withdrawn. See
     ./domain/admission.ts for what is left for a person, and why nothing about the admission is kept. */
  'passport.admission.detected@1': (event, ctx) => {
   const refs = (ctx.store.prepare('SELECT appointment_ref FROM care_appointments WHERE subject_ref = ?').all(event.subjectRef) as { appointment_ref: string }[]).map(row => row.appointment_ref);
   if (!refs.length) return;
   const desks = load(ctx);
   for (const offer of withdrawnOnAdmission(refs.flatMap(ref => desks.offers.offersFor(ref)))) offer.state = 'withdrawn';
   save(ctx, desks);
  },

  'booking.requested@2': (event, ctx) => {
   const appointmentRef = `apt-${String(event.payload.bookingRef)}`;
   const requestedFor = typeof event.payload.requestedFor === 'string' ? event.payload.requestedFor : null;
   const named = typeof event.payload.namedClinicianRef === 'string' ? event.payload.namedClinicianRef : null;
   const fresh = ctx.store.prepare('INSERT OR IGNORE INTO care_appointments (appointment_ref, subject_ref, service_id, zone_id, scheduled_for, named_clinician_ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(appointmentRef, event.subjectRef, String(event.payload.serviceId), String(event.payload.zoneId), requestedFor, named);
   if (!fresh.changes) return;
   const answer = named !== null && typeof event.payload.namedNurseFallback === 'string' ? event.payload.namedNurseFallback : null;
   ctx.store.prepare('INSERT INTO care_booking_requests (appointment_ref, booking_ref, named_nurse_fallback) VALUES (?, ?, ?)')
    .run(appointmentRef, String(event.payload.bookingRef), answer);
   ctx.publish('appointment.requested@1', {
    appointmentRef, serviceId: String(event.payload.serviceId), mode: String(event.payload.mode), ...(requestedFor ? { preferredFrom: requestedFor } : {})
   }, { subjectRef: event.subjectRef, purposeOfUse: 'dispatch', causationId: event.eventId });
  }
 },

 /* Time passing is what lapses an offer, and what passes a declined one on. */
 tick: ctx => {
  const desks = load(ctx);
  const now = ctx.clock.now();
  const passed = [...desks.offers.lapse(now), ...desks.offers.passOnDeclined(now)];
  for (const p of passed) if (p.next.ok) publish(ctx, p.next.events, true);
  save(ctx, desks);
 }
});
