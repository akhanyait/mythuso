/* Medicines & Labs on the engine runtime: prescriptions, the checks they stand on, the chain of custody, a
 * pharmacy's queue and lab orders.
 *
 * WHAT THIS STORE HOLDS. References and states, as packages/catalog/medicines.json whereContentLives says, and
 * nothing a patient's record holds: every table is a reference and a document, and no type the documents are made
 * from has a field for a medicine, a dose or a result. The hand-over PIN is kept as a salt and a SHA-256 digest; the
 * PIN itself travels once, in the answer to the patient who authorised the collection, and the runtime keeps it out
 * of the replay table (secretResponseFields) and out of a request's digest (secretRequestFields).
 *
 * WHAT A REFUSAL KEEPS. A wrong PIN and a broken seal are refused, and a refusal rolls back everything the handler
 * did. The row that counts the wrong PIN, or voids the collection for the seal, is recorded through
 * ctx.recordRefusal into handover_attempts, the one table the hand-over's keptOnRefusal names, so the count
 * survives the refusal and a voided bag cannot be handed over on the next try.
 *
 * WHO. A caller's reference is the runtime's, never a field, and every act that separates duties, authorises a
 * collector or holds a PIN refuses a caller the runtime could not name. Whether a doctor, a pharmacist or a pharmacy
 * may act at all is asked of the vetting contract and of Trust's events heard here (domain/standing.ts).
 *
 * HEARD. person.verified, suspended, reinstated and deactivated, and partner.verified and suspended, for standing;
 * result.acknowledged, which completes a lab order's result.
 *
 * THE CLOCK. The synthetic development laboratory answers an order after its turnaround with a result reference.
 * Medicines publishes lab.result.received@1 and raises a concern with Core through POST /v1/core/alerts@2 on the
 * rung its settings name, keyed by the result's entry so Core can stand it down when Clinical says it was
 * acknowledged. A refusal from Core rolls the tick back, so the result is received again on the next tick rather
 * than received with nobody told. In development Core may be answered by the mock.
 *
 * Nothing here is a real service: no prescription reaches a pharmacy, no bag is sealed and no laboratory is sent a
 * sample.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { defineEngine, instant, ok, refuse, type BusEvent, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, confirmersFromClinical, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { dayOf, outcomeOf, pinDigits, resultAlert, searchFormulary, type Emitted } from './domain/contract.ts';
import { STANDING_EVENTS, learn, mayAct, type Standing, type StandingReader } from './domain/standing.ts';
import { dispense, prescribe, queueFor, runCheck, verify, type Check, type Prescription } from './domain/prescriptions.ts';
import { authorise, collect, handOver, voidedBy, type Attempt, type Authorisation, type Collection } from './domain/collections.ts';
import { acknowledged, close, placeOrder, receiveResult, syntheticResultDue, type LabOrder } from './domain/labs.ts';
import { medicinesSettings, resultRungOf, termsOf } from './domain/settings.ts';

const TABLES = ['checks', 'prescriptions', 'authorisations', 'collections', 'lab_orders', 'standings'] as const;
type Table = typeof TABLES[number];
const schema = [
 ...TABLES.map(name => `CREATE TABLE IF NOT EXISTS ${name} (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);`),
 'CREATE TABLE IF NOT EXISTS handover_attempts (seq INTEGER PRIMARY KEY AUTOINCREMENT, collection_ref TEXT NOT NULL, outcome TEXT NOT NULL, by_ref TEXT NOT NULL, at INTEGER NOT NULL);',
 SETTINGS_SCHEMA
].join('\n');

const get = <T,>(ctx: EngineContext, table: Table, ref: unknown): T | undefined => {
 const row = ctx.store.prepare(`SELECT doc FROM ${table} WHERE ref = ?`).get(String(ref)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as T : undefined;
};
const all = <T,>(ctx: EngineContext, table: Table): T[] => (ctx.store.prepare(`SELECT doc FROM ${table} ORDER BY rowid`).all() as { doc: string }[]).map(row => JSON.parse(row.doc) as T);
const put = (ctx: EngineContext, table: Table, ref: string, doc: unknown) => {
 ctx.store.prepare(`INSERT INTO ${table} (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc`).run(ref, JSON.stringify(doc));
};
const attemptsOn = (ctx: EngineContext, collectionRef: string): Attempt[] =>
 (ctx.store.prepare('SELECT outcome, by_ref, at FROM handover_attempts WHERE collection_ref = ? ORDER BY seq').all(collectionRef) as { outcome: Attempt['outcome']; by_ref: string; at: number }[])
  .map(row => ({ outcome: row.outcome, byRef: row.by_ref, at: row.at }));

const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const text = (value: unknown) => typeof value === 'string' ? value : '';
const publishAll = (ctx: EngineContext, emits: readonly Emitted[], subjectRef: string, purposeOfUse?: string) => {
 for (const event of emits) ctx.publish(event.key as EventKey, { ...event.payload }, { subjectRef, ...(purposeOfUse ? { purposeOfUse } : {}) });
};

/* ── Standing ───────────────────────────────────────────────────────────────────────────────────────── */

const standingKey = (subjectRef: string, role: string) => `${subjectRef} ${role}`;
const reader = (ctx: EngineContext): StandingReader => ({
 of: (subjectRef, role) => get<Standing>(ctx, 'standings', standingKey(subjectRef, role)),
 all: subjectRef => all<Standing>(ctx, 'standings').filter(s => s.subjectRef === subjectRef)
});
const heardStanding = (event: BusEvent, ctx: EngineContext) => {
 const role = typeof event.payload['role'] === 'string' ? event.payload['role'] : text(event.payload['partnerKind']);
 const next = learn(get<Standing>(ctx, 'standings', standingKey(event.subjectRef, role)), event);
 if (next) put(ctx, 'standings', standingKey(next.subjectRef, next.role), next);
};
/* Whether the pharmacy a prescription is routed to is verified today. */
const pharmacyCleared = (ctx: EngineContext, pharmacyRef: string) =>
 mayAct('dispense', { role: 'pharmacy', ref: pharmacyRef }, pharmacyRef, reader(ctx), dayOf(nowOf(ctx)));
const callerMay = (ctx: EngineContext, act: 'prescribe' | 'verify' | 'dispense', pharmacyRef: string) => {
 const ref = ctx.caller.ref;
 if (!ref) return false;
 /* A pharmacy dispenses only what was routed to it. */
 if (ctx.caller.role === 'pharmacy' && ref !== pharmacyRef) return false;
 return mayAct(act, { role: ctx.caller.role, ref }, pharmacyRef, reader(ctx), dayOf(nowOf(ctx)));
};

/* ── The PIN ────────────────────────────────────────────────────────────────────────────────────────── */

/* From the platform's cryptographic source, as many digits as the contract gives, and kept only as a salted digest.
   A PIN derived from anything a person could see — a reference on the bus — could be worked out by whoever saw it. */
const newPin = () => Array.from({ length: pinDigits }, () => String(randomInt(10))).join('');
const digestOf = (salt: string, pin: string) => createHash('sha256').update(`${salt}:${pin}`).digest('hex');

/* ── Routes ─────────────────────────────────────────────────────────────────────────────────────────── */

const prescriptionOf = (ctx: EngineContext, request: HandlerRequest) => get<Prescription>(ctx, 'prescriptions', request.fields['prescriptionRef']);

export const engine = defineEngine({
 id: 'medicines',
 store: { schema },
 routes: {
  'GET /v1/medicines/formulary@2': request => {
   const found = searchFormulary(text(request.fields['query']));
   return found.ok ? ok({ ...found.value }) : refuse(found.refusal.id);
  },

  'POST /v1/medicines/interaction-checks@2': (request, ctx) => {
   const ran = runCheck({ checkRef: `check-${randomUUID()}`, subjectRef: text(request.fields['subjectRef']), stageCode: text(request.fields['stageCode']), byRef: ctx.caller.ref }, nowOf(ctx));
   if (!ran.ok) return refuse(ran.refusal.id);
   put(ctx, 'checks', ran.value.checkRef, ran.value);
   return ok({ checkRef: ran.value.checkRef, outcomeCode: ran.value.outcomeCode, reason: outcomeReason(ran.value) });
  },

  'POST /v1/medicines/prescriptions@2': (request, ctx) => {
   const pharmacyRef = text(request.fields['pharmacyRef']);
   const written = prescribe({
    prescriptionRef: `prescription-${randomUUID()}`, subjectRef: text(request.fields['subjectRef']), medicationRequestRef: text(request.fields['medicationRequestRef']),
    checkRef: text(request.fields['checkRef']), scheduleCode: text(request.fields['scheduleCode']), pharmacyRef, notCheckedRead: request.fields['notCheckedRead'] === true
   }, { ref: ctx.caller.ref, cleared: callerMay(ctx, 'prescribe', pharmacyRef), pharmacyCleared: pharmacyCleared(ctx, pharmacyRef), check: get<Check>(ctx, 'checks', request.fields['checkRef']) }, nowOf(ctx));
   if (!written.ok) return refuse(written.refusal.id);
   const { prescription, check } = written.value;
   put(ctx, 'prescriptions', prescription.prescriptionRef, prescription);
   put(ctx, 'checks', check.checkRef, check);
   publishAll(ctx, written.emits, prescription.subjectRef);
   return ok({ prescriptionRef: prescription.prescriptionRef, stateCode: 'prescribed' });
  },

  'POST /v1/medicines/prescriptions/{prescriptionRef}/verify@2': (request, ctx) => {
   const p = prescriptionOf(ctx, request);
   if (!p) return refuse('no-such-prescription');
   const verified = verify(p, { ref: ctx.caller.ref, cleared: callerMay(ctx, 'verify', p.pharmacyRef) }, nowOf(ctx));
   if (!verified.ok) return refuse(verified.refusal.id);
   put(ctx, 'prescriptions', p.prescriptionRef, verified.value);
   publishAll(ctx, verified.emits, p.subjectRef);
   return ok({ verifiedAt: instant(new Date(verified.value.verifiedAt!)) });
  },

  'POST /v1/medicines/prescriptions/{prescriptionRef}/dispense@2': (request, ctx) => {
   const p = prescriptionOf(ctx, request);
   if (!p) return refuse('no-such-prescription');
   const dispensed = dispense(p, {
    dispenseEntryRef: text(request.fields['dispenseEntryRef']), checkRef: text(request.fields['checkRef']), sealRef: text(request.fields['sealRef']), notCheckedRead: request.fields['notCheckedRead'] === true
   }, { ref: ctx.caller.ref, cleared: callerMay(ctx, 'dispense', p.pharmacyRef), pharmacyCleared: pharmacyCleared(ctx, p.pharmacyRef), check: get<Check>(ctx, 'checks', request.fields['checkRef']) }, nowOf(ctx));
   if (!dispensed.ok) return refuse(dispensed.refusal.id);
   put(ctx, 'prescriptions', p.prescriptionRef, dispensed.value.prescription);
   put(ctx, 'checks', dispensed.value.check.checkRef, dispensed.value.check);
   publishAll(ctx, dispensed.emits, p.subjectRef);
   return ok({ dispensedAt: instant(new Date(dispensed.value.prescription.dispensedAt!)) });
  },

  /* The PIN is made here and answered once. Everything the domain is handed about it is a salt and a digest. */
  'POST /v1/medicines/collection-authorisations@1': (request, ctx) => {
   const p = prescriptionOf(ctx, request);
   if (!p) return refuse('no-such-prescription');
   const previous = all<Authorisation>(ctx, 'authorisations').filter(a => a.prescriptionRef === p.prescriptionRef).at(-1);
   const previousCollection = previous ? all<Collection>(ctx, 'collections').find(c => c.authorisationRef === previous.authorisationRef) : undefined;
   const pin = newPin();
   const salt = randomBytes(16).toString('hex');
   const now = nowOf(ctx);
   const given = authorise(p, {
    authorisationRef: `authorisation-${randomUUID()}`, collectorRef: text(request.fields['collectorRef']), collectorRole: text(request.fields['collectorRole']),
    pinSalt: salt, pinDigest: digestOf(salt, pin)
   }, { ref: ctx.caller.ref }, { authorisation: previous, voided: !!(previous && previousCollection && voidedBy(attemptsOn(ctx, previousCollection.collectionRef), previous)) }, termsOf(settingsIn(medicinesSettings, ctx.store)), now);
   if (!given.ok) return refuse(given.refusal.id);
   put(ctx, 'authorisations', given.value.authorisationRef, given.value);
   return ok({ authorisationRef: given.value.authorisationRef, handoverPin: pin, pinExpiresAt: instant(new Date(given.value.pinExpiresAt)), windowEndsAt: instant(new Date(given.value.windowEndsAt)) });
  },

  'POST /v1/medicines/collections@2': (request, ctx) => {
   const p = prescriptionOf(ctx, request);
   if (!p) return refuse('no-such-prescription');
   const authorisation = get<Authorisation>(ctx, 'authorisations', request.fields['authorisationRef']);
   const existing = authorisation ? all<Collection>(ctx, 'collections').find(c => c.authorisationRef === authorisation.authorisationRef) : undefined;
   const collected = collect(p, authorisation, existing, { collectionRef: `collection-${randomUUID()}`, sealRef: text(request.fields['sealRef']) }, { ref: ctx.caller.ref, role: ctx.caller.role }, nowOf(ctx));
   if (!collected.ok) return refuse(collected.refusal.id);
   put(ctx, 'collections', collected.value.collection.collectionRef, collected.value.collection);
   put(ctx, 'prescriptions', p.prescriptionRef, collected.value.prescription);
   publishAll(ctx, collected.emits, p.subjectRef);
   return ok({ collectionRef: collected.value.collection.collectionRef, windowEndsAt: instant(new Date(authorisation!.windowEndsAt)) });
  },

  'POST /v1/medicines/collections/{collectionRef}/handover@2': (request, ctx) => {
   const c = get<Collection>(ctx, 'collections', request.fields['collectionRef']);
   if (!c) return refuse('no-such-collection');
   const authorisation = get<Authorisation>(ctx, 'authorisations', c.authorisationRef)!;
   const p = get<Prescription>(ctx, 'prescriptions', c.prescriptionRef)!;
   const pin = text(request.fields['handoverPin']);
   const matches = digestOf(authorisation.pinSalt, pin) === authorisation.pinDigest;
   const handed = handOver(c, p, authorisation, attemptsOn(ctx, c.collectionRef), { pinMatches: matches, sealIntact: request.fields['sealIntact'] === true }, { ref: ctx.caller.ref }, nowOf(ctx));
   if (handed.keep) ctx.recordRefusal('INSERT INTO handover_attempts (collection_ref, outcome, by_ref, at) VALUES (?, ?, ?, ?)', c.collectionRef, handed.keep.outcome, handed.keep.byRef, handed.keep.at);
   if (!handed.result.ok) return refuse(handed.result.refusal.id);
   put(ctx, 'collections', c.collectionRef, handed.result.value.collection);
   put(ctx, 'prescriptions', p.prescriptionRef, handed.result.value.prescription);
   publishAll(ctx, handed.result.emits, p.subjectRef);
   return ok({ handedOverAt: instant(new Date(handed.result.value.collection.handedOverAt!)) });
  },

  /* The queue carries exactly partnerQueue.carries, and the runtime holds the answer to the fields the route declares. */
  'GET /v1/medicines/orders@2': (request, ctx) => {
   if (!ctx.caller.ref) return refuse('unnamed-caller');
   const pharmacyRef = text(request.fields['pharmacyRef']);
   if (pharmacyRef !== ctx.caller.ref) return refuse('another-pharmacys-queue');
   return ok({
    orders: queueFor(all<Prescription>(ctx, 'prescriptions'), pharmacyRef).map(row => ({
     ...row, prescribedAt: instant(new Date(row.prescribedAt)),
     verifiedAt: row.verifiedAt === null ? null : instant(new Date(row.verifiedAt)),
     dispensedAt: row.dispensedAt === null ? null : instant(new Date(row.dispensedAt))
    }))
   });
  },

  /* Version two, because only the clinician who ordered a test may acknowledge its result, and version one could not
     refuse a caller the runtime cannot name: such an order was ordered by nobody Clinical could match. */
  'POST /v1/medicines/lab-orders@2': (request, ctx) => {
   if (!ctx.caller.ref) return refuse('unnamed-caller');
   const placed = placeOrder({
    labOrderRef: `lab-order-${randomUUID()}`, subjectRef: text(request.fields['subjectRef']), serviceRequestRef: text(request.fields['serviceRequestRef']),
    collectionMode: text(request.fields['collectionMode']), orderedByRef: ctx.caller.ref
   }, nowOf(ctx));
   if (!placed.ok) return refuse(placed.refusal.id);
   put(ctx, 'lab_orders', placed.value.labOrderRef, placed.value);
   publishAll(ctx, placed.emits, placed.value.subjectRef);
   return ok({ labOrderRef: placed.value.labOrderRef });
  },

  'POST /v1/medicines/lab-orders/{labOrderRef}/close@1': (request, ctx) => {
   const order = get<LabOrder>(ctx, 'lab_orders', request.fields['labOrderRef']);
   if (!order) return refuse('no-such-lab-order');
   const closed = close(order, nowOf(ctx));
   if (!closed.ok) return refuse(closed.refusal.id);
   put(ctx, 'lab_orders', order.labOrderRef, closed.value);
   return ok({ closedAt: instant(new Date(closed.value.closedAt!)) });
  },

  /* Who confirms a clinical review is Clinical's review-confirmer setting in force, asked of Clinical (Wave 5). */
  ...settingsRoutes(medicinesSettings, { read: 'GET /v1/medicines/settings@2', change: 'POST /v1/medicines/setting-changes@1', review: 'POST /v1/medicines/setting-reviews@2' }, { confirmers: confirmersFromClinical })
 },
 subscriptions: {
  ...Object.fromEntries(STANDING_EVENTS.map(key => [key, heardStanding])),
  /* Clinical recorded the acknowledgement by the clinician responsible. The order it answers can now close. */
  'result.acknowledged@1': (event, ctx) => {
   const resultRef = text(event.payload['resultRef']);
   const order = all<LabOrder>(ctx, 'lab_orders').find(o => o.resultEntryRef === resultRef);
   if (order) put(ctx, 'lab_orders', order.labOrderRef, acknowledged(order, text(event.payload['acknowledgedByRef']), nowOf(ctx)));
  }
 },
 tick: ctx => {
  const now = nowOf(ctx);
  for (const order of all<LabOrder>(ctx, 'lab_orders')) {
   if (!syntheticResultDue(order, now)) continue;
   const { rung, settingsVersion } = resultRungOf(settingsIn(medicinesSettings, ctx.store));
   const received = receiveResult(order, { resultEntryRef: `synthetic-result-${randomUUID()}`, rung, settingsVersion }, now);
   if (!received.ok) continue;
   put(ctx, 'lab_orders', order.labOrderRef, received.value);
   publishAll(ctx, received.emits, order.subjectRef, 'diagnostics');
   const raised = ctx.call('POST /v1/core/alerts@2', {
    sourceEngine: 'medicines', rung, ownerRole: resultAlert.ownerRole, fallbackRole: resultAlert.fallbackRole,
    recordEntryRef: received.value.resultEntryRef, dedupeKey: received.value.resultEntryRef
   }, { purpose: 'treatment' });
   if (raised.status !== 200) throw new Error(`Core did not take the concern for a lab result (${String(raised.body['error'])}), so the result is not received until it does.`);
  }
 }
});

/* The reason a check came out as it did, as the contract's sentence. */
const outcomeReason = (check: Check): string => {
 const outcome = outcomeOf(check.outcomeCode);
 if (!outcome) throw new Error(`A check answered "${check.outcomeCode}", which packages/catalog/medicines.json does not declare.`);
 return outcome.reason;
};
