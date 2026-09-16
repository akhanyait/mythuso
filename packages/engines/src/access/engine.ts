/* The Access engine on the development runtime: bookings, the visit thread, Gilbert's handover and Access's
   settings.

   The binder has already done the contract's part before any handler here runs — the caller's role,
   the purpose, the required fields and their types, the idempotency key, and a replay of the same key
   from the same caller — so what is left is the domain's decision, run against this engine's own store,
   and the events it publishes. Every answer is either a declared response or a declared refusal id; the
   runtime renders the sentence.

   ── What is bound ────────────────────────────────────────────────────────────────────────────────

   Nine routes: book, read a booking, cancel one, read a visit thread and write in it, hand a Gilbert
   conversation to the nurse queue, and Access's settings — read them, change one, confirm the clinical
   review of one. Eight more since Wave 6, the family arrangements below. And three subscriptions:
   appointment.completed@2, from Care; payment.refunded@1, from Money, which marks a booking refunded by the
   bookingRef it carries; and payment.succeeded@1, which becomes a line on a sponsor's statement and nothing
   more.

   ── The family arrangements ──────────────────────────────────────────────────────────────────────

   A household, a sponsorship and a bill split, and the thing none of them is. A household is a roster:
   POST /v1/access/households@1 opens one, POST /v1/access/household-memberships@1 adds a line to one, and
   GET /v1/access/households@1 reads one to somebody on it. It grants nothing to anybody — not the member,
   not the person who added them — and a request that arrives carrying a scope, a grant or an expiry beside
   the person is refused in the route's own words rather than having the field dropped.

   A sponsorship names a household membership rather than a person, which is what version two of the sponsors
   route exists for. It is offered, and packages/catalog/programmes.json decides what happens next: it starts
   when the person being paid for says yes, in her own account, through .../answer@1, and she stops it there
   too without giving a reason. GET /v1/access/sponsors@1 answers a statement whose lines were built with the
   service already removed unless her line detail names it — the refusal as arithmetic, so no handler and no
   screen is ever handed a field it is meant to hide.

   A bill split divides one of Money's payables. The shares are added up against the payable's own amount in
   cents and refused if they do not reach it, and each payer accepts their own share at the amount they were
   shown before any of it is owed. Nothing here charges anybody: Money does that through its own route, and
   domain/bill-split.ts offers it only the shares somebody accepted.

   POST /v1/access/bookings@2 is the booking route. Version one was withdrawn on 15 September: it had no
   field for what happens if a nurse asked for by name cannot take the visit, so the answer rode inside the
   slot reference, and no field for where the visit is, so every visit was booked as covered. Version two
   takes the zone id and the answer as fields, the domain refuses a zone geography.json does not hold, and
   booking.requested@2 tells Care the suburb — never the address — so Care can offer a real booking.

   ── The handover ─────────────────────────────────────────────────────────────────────────────────

   POST /v1/access/conversations/{conversationRef}/handover@2 carries the urgency the rules set on the
   device, where Gilbert's matcher and the conversation are; this engine holds no conversation and grades
   nothing, so it takes the code, refuses one the assistant contract does not list, and keeps the highest
   sent for a conversation — a calmer one sends nothing. Who answers and whether anybody is on the desk are
   Access's settings handover-answered-by and handover-hours in force when the handover is asked for, and
   whether a window covers the moment is the shared settings code's rotaAt, the rule Core's escalation rota
   is read by: an engine may not import Core's code, so the rule moved rather than being written twice.
   Out of hours the answer says, in this order, that nobody is on the desk, the emergency numbers from
   sos.json, and when the rota next opens, which the handover records as the call back it offered. It never
   refuses because the desk is shut: a person out of hours is told, not turned away.

   ── Settings ─────────────────────────────────────────────────────────────────────────────────────

   GET /v1/access/settings@2, POST /v1/access/setting-changes@1 and POST /v1/access/setting-reviews@2,
   through packages/engines/src/settings, with the history in this store's settings_history. They live
   here rather than in apps/api because apps/api holds identity only, and these are policy about the
   bookings, threads and handovers this engine answers. Each act reads the value in force once, when it
   starts: the booking route offers slots and checks the answer against the named-nurse fallback in force,
   and the booking keeps the answer; the thread route measures a message against the length in force as it
   is written, and never a message already kept; the handover reads the desk's hours as it is asked for.

   ── A thread after its visit ─────────────────────────────────────────────────────────────────────

   Access hears appointment.completed@2, which carries the bookingRef Care heard on booking.requested, so the
   thread is found by this engine's own booking reference and nothing here knows how Care names an appointment.
   Version one carried only Care's appointment, and Access found the thread through a naming rule in booking.json
   that is retired with it. A completion with no bookingRef, or one no booking here holds — the preview visit —
   closes nothing. The thread stays open for the hours the setting
   visit-thread-open-hours-after-visit held at the moment of completion, read from this store's history as it
   stood then, so an admin's change afterwards never moves it. A cancelled booking's thread closes at once,
   in the cancel route.

   ── What the binder cannot check, and this cannot either ─────────────────────────────────────────

   A patient books, reads and hands over only as themselves: the caller's reference must be the subject. A
   caregiver, a guardian and a Thuso Line agent act for somebody else, and whether they may for this
   subject is a household or grant question no store here answers — so they are recorded as the actor
   and not refused. That is a gap, written down, not a permission.

   No event tells Access that Care accepted a booking — Access hears appointment.confirmed and
   appointment.en_route, which name Care's appointment and not this booking — so nothing here confirms.
   The screens' simulated roster does, and says so.

   Every statement below is one statement with its values bound, because the store facade refuses
   anything else; the tables are created by the schema, which the runtime runs before any handler. */
import booking from '../../../catalog/booking.json' with { type: 'json' };
import sos from '../../../catalog/sos.json' with { type: 'json' };
import { defineEngine, ok, refuse, type Answer, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, confirmersFromClinical, historyOf, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { rotaAt } from '../settings/shape.ts';
import { acceptShare, proposeSplit, splitState, type Split, type SplitLedger } from './domain/bill-split.ts';
import { cancelBooking, readBooking, recordRefund, requestBooking, type Booking, type Ledger } from './domain/booking.ts';
import { instantOf, isoIn, type AccessEvent, type Outcome } from './domain/contract.ts';
import { addMember, householdsOf, openHousehold, readHousehold, type Household, type HouseholdLedger } from './domain/household.ts';
import { answerSponsorship, offerSponsorship, statementsFor, type Sponsorship, type SponsoredPayment, type SponsorshipLedger } from './domain/sponsorship.ts';
import { queueHandover, type Handover } from './domain/handover.ts';
import { rosterCandidates } from './domain/roster.ts';
import { accessInForceAt, accessSettings, accessSettingsOf } from './domain/settings.ts';
import { closeThread, completeThread, postMessage, readThread, threadFor, type Actor, type Thread, type ThreadRole } from './domain/thread.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS bookings (booking_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS threads (booking_ref TEXT PRIMARY KEY, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS handovers (subject_ref TEXT NOT NULL, conversation_ref TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (subject_ref, conversation_ref));',
 /* The three family arrangements. Every one of them holds references, states and amounts in cents, and no
    name, no relationship and nothing a visit produced — which is why a column here is a ref and never a
    person. sponsored_payments keeps the subject on its own column because a statement is read by subject. */
 'CREATE TABLE IF NOT EXISTS households (household_ref TEXT PRIMARY KEY, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS sponsorships (sponsorship_ref TEXT PRIMARY KEY, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS sponsored_payments (payment_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS bill_splits (split_ref TEXT PRIMARY KEY, body TEXT NOT NULL);',
 SETTINGS_SCHEMA
].join('\n');

/* Access's settings in force in this store, now. Asked once per act and never kept between acts. */
const accessIn = (ctx: EngineContext) => accessSettingsOf(settingsIn(accessSettings, ctx.store));

const ledgerOf = (ctx: EngineContext): Ledger =>
 ({ bookings: (ctx.store.prepare('SELECT body FROM bookings ORDER BY rowid').all() as { body: string }[]).map(row => JSON.parse(row.body) as Booking) });
const saveBooking = (ctx: EngineContext, held: Booking) =>
 ctx.store.prepare('INSERT INTO bookings (booking_ref, subject_ref, body) VALUES (?, ?, ?) ON CONFLICT(booking_ref) DO UPDATE SET body = excluded.body')
  .run(held.bookingRef, held.subjectRef, JSON.stringify(held));
const threadOf = (ctx: EngineContext, held: Booking): Thread => {
 const row = ctx.store.prepare('SELECT body FROM threads WHERE booking_ref = ?').get(held.bookingRef) as { body: string } | undefined;
 return row ? JSON.parse(row.body) as Thread : threadFor(held);
};
const saveThread = (ctx: EngineContext, thread: Thread) =>
 ctx.store.prepare('INSERT INTO threads (booking_ref, body) VALUES (?, ?) ON CONFLICT(booking_ref) DO UPDATE SET body = excluded.body')
  .run(thread.bookingRef, JSON.stringify(thread));

/* A handover as this store keeps it: the handover, and what the desk said when it was sent — who answers, and
   out of hours the call back offered. Kept per subject, so a conversation reference another person chose never
   reads or raises somebody else's. */
type Kept = { readonly handover: Handover; readonly deskStateCode: string; readonly answeredByRoles: readonly string[]; readonly callbackFrom: string | null; readonly settingsVersion: number };
const keptHandover = (ctx: EngineContext, subjectRef: string, conversationRef: string): Kept | null => {
 const row = ctx.store.prepare('SELECT body FROM handovers WHERE subject_ref = ? AND conversation_ref = ?').get(subjectRef, conversationRef) as { body: string } | undefined;
 return row ? JSON.parse(row.body) as Kept : null;
};
const keepHandover = (ctx: EngineContext, subjectRef: string, kept: Kept) =>
 ctx.store.prepare('INSERT INTO handovers (subject_ref, conversation_ref, body) VALUES (?, ?, ?) ON CONFLICT(subject_ref, conversation_ref) DO UPDATE SET body = excluded.body')
  .run(subjectRef, kept.handover.conversationRef, JSON.stringify(kept));

/* ---- The family arrangements, read out of this store ------------------------------------------------ */
const rows = (ctx: EngineContext, sql: string, ...params: string[]) => (ctx.store.prepare(sql).all(...params) as { body: string }[]).map(row => row.body);
const householdLedger = (ctx: EngineContext): HouseholdLedger =>
 ({ households: rows(ctx, 'SELECT body FROM households ORDER BY rowid').map(body => JSON.parse(body) as Household) });
const saveHousehold = (ctx: EngineContext, held: Household) =>
 ctx.store.prepare('INSERT INTO households (household_ref, body) VALUES (?, ?) ON CONFLICT(household_ref) DO UPDATE SET body = excluded.body').run(held.householdRef, JSON.stringify(held));
const sponsorshipLedger = (ctx: EngineContext): SponsorshipLedger => ({
 sponsorships: rows(ctx, 'SELECT body FROM sponsorships ORDER BY rowid').map(body => JSON.parse(body) as Sponsorship),
 payments: rows(ctx, 'SELECT body FROM sponsored_payments ORDER BY rowid').map(body => JSON.parse(body) as SponsoredPayment)
});
const saveSponsorship = (ctx: EngineContext, held: Sponsorship) =>
 ctx.store.prepare('INSERT INTO sponsorships (sponsorship_ref, body) VALUES (?, ?) ON CONFLICT(sponsorship_ref) DO UPDATE SET body = excluded.body').run(held.sponsorshipRef, JSON.stringify(held));
const splitLedger = (ctx: EngineContext): SplitLedger =>
 ({ splits: rows(ctx, 'SELECT body FROM bill_splits ORDER BY rowid').map(body => JSON.parse(body) as Split) });
const saveSplit = (ctx: EngineContext, held: Split) =>
 ctx.store.prepare('INSERT INTO bill_splits (split_ref, body) VALUES (?, ?) ON CONFLICT(split_ref) DO UPDATE SET body = excluded.body').run(held.splitRef, JSON.stringify(held));

/* A refusal or the handler's own answer, for the routes that publish nothing. The family arrangements emit
   no event at all — nothing is owed, dispatched or paid by making one — so there is no outbox to flush. */
function settle<T>(outcome: Outcome<T>, body: (value: T) => Record<string, unknown>): Answer {
 return outcome.refused ? refuse(outcome.id) : ok(body(outcome.value));
}

/* The emergency numbers are sos.json's, filled into booking.json's sentence by their ids. Nothing here types one. */
const withNumbers = (text: string) => text.replace(/\{(\w+)\}/g, (token, id: string) => sos.emergency.numbers.find(n => n.id === id)?.number ?? token);
const publishAll = (ctx: EngineContext, events: readonly AccessEvent[]) => {
 for (const event of events) ctx.publish(`${event.type}@${event.version}` as EventKey, { ...event.payload }, { subjectRef: event.subjectRef, actorRole: event.actorRole });
};

/* A refusal the route declares, or a shared one, passes through by id. One that belongs to no route —
   a nurse whose badge is not current — is answered with the route refusal that is true of it: a slot
   with her was never offered. */
function answer<T>(ctx: EngineContext, outcome: Outcome<T>, route: string, otherwise: string, body: (value: T) => Record<string, unknown>): Answer {
 if (outcome.refused) return refuse(outcome.route === route ? outcome.id : otherwise);
 publishAll(ctx, outcome.events);
 return ok(body(outcome.value));
}

const bookingByRef = (ctx: EngineContext, bookingRef: string) => ledgerOf(ctx).bookings.find(b => b.bookingRef === bookingRef);
/* A patient is the subject; anybody else acts for the subject the booking is about. See the header. */
const subjectFor = (ctx: EngineContext, held: Booking | undefined) =>
 ctx.caller.role === 'patient' ? ctx.caller.ref ?? '' : held?.subjectRef ?? '';
const actorFor = (ctx: EngineContext, held: Booking): Actor | null => {
 const role = ctx.caller.role as ThreadRole;
 if (role === 'patient' || role === 'nurse') return ctx.caller.ref ? { role, ref: ctx.caller.ref } : null;
 return { role, ref: held.subjectRef };
};
/* The route declares no attachment field, so the binder never hands one over; what it does hand over is
   the name of anything undeclared that was sent. A name that is a file of some kind is refused in words
   rather than silently dropped, because a person who attached a photo should be told it did not go —
   whatever visit-thread-photos says, since this preview has no upload for it to switch on. */
const ATTACHMENT = /attach|photo|image|picture|file|media|voice|audio|video|document/i;

export const engine = defineEngine({
 id: 'access',
 store: { schema },
 subscriptions: {
  /* Care completed a visit. The thread of the booking it came from stays open for the hours in force at that
     moment and then closes; the instant it closes is written once, so a redelivery or a later change to the
     setting moves nothing. */
  'appointment.completed@2': (event, ctx) => {
   const bookingRef = typeof event.payload.bookingRef === 'string' ? event.payload.bookingRef : null;
   const held = bookingRef === null ? undefined : ledgerOf(ctx).bookings.find(b => b.bookingRef === bookingRef);
   if (!held) return;
   const at = Date.parse(event.occurredAt);
   const thread = threadOf(ctx, held);
   const completed = completeThread(thread, new Date(at), accessInForceAt(historyOf(ctx.store), at).threadOpenHoursAfterVisit);
   if (completed !== thread) saveThread(ctx, completed);
  },
  /* Money returned what was paid for a booking. Found by the bookingRef the event carries, and marked once; a
     refund with no bookingRef, or for a booking this store does not hold, marks nothing. See recordRefund.
     A refunded payment also leaves a sponsor's statement, because a line for money that came back is a line
     for care that was not paid for. */
  'payment.refunded@1': (event, ctx) => {
   if (typeof event.payload.paymentRef === 'string') ctx.store.prepare('DELETE FROM sponsored_payments WHERE payment_ref = ?').run(event.payload.paymentRef);
   const bookingRef = typeof event.payload.bookingRef === 'string' ? event.payload.bookingRef : null;
   if (bookingRef === null || typeof event.payload.paymentRef !== 'string' || typeof event.payload.amountCents !== 'number') return;
   const marked = recordRefund(ledgerOf(ctx), { bookingRef, paymentRef: event.payload.paymentRef, amountCents: event.payload.amountCents, at: event.occurredAt });
   if (marked) saveBooking(ctx, marked.booking);
  },
  /* A payment went through. It is kept here only where the person it was for has an agreed sponsorship, and
     only as a day and an amount: the event names the payment, the payable, the amount and the method, and
     nothing about the care, so there is nothing else a statement could carry. The event names no payer
     either, which is why domain/sponsorship.ts attributes a line to one sponsorship and never to one of two. */
  'payment.succeeded@1': (event, ctx) => {
   const { paymentRef, amountCents } = event.payload as { paymentRef?: unknown; amountCents?: unknown };
   if (typeof paymentRef !== 'string' || typeof amountCents !== 'number' || !event.subjectRef) return;
   if (!sponsorshipLedger(ctx).sponsorships.some(s => s.sponsoredSubjectRef === event.subjectRef && s.stateCode === 'agreed')) return;
   const line: SponsoredPayment = { paymentRef, subjectRef: event.subjectRef, paidOnDay: isoIn(new Date(event.occurredAt)), amountCents, serviceId: null };
   ctx.store.prepare('INSERT INTO sponsored_payments (payment_ref, subject_ref, body) VALUES (?, ?, ?) ON CONFLICT(payment_ref) DO UPDATE SET body = excluded.body')
    .run(paymentRef, event.subjectRef, JSON.stringify(line));
  }
 },
 routes: {
  'POST /v1/access/bookings@2': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { idempotencyKey: string; subjectRef: string; serviceId: string; mode: string; slotRef: string; zoneId: string; namedNurseFallback?: string };
   if (ctx.caller.role === 'patient' && ctx.caller.ref !== f.subjectRef) return refuse('caller-not-allowed');
   if (f.mode !== 'home') return refuse('service-not-here');
   const outcome = requestBooking(ledgerOf(ctx),
    { idempotencyKey: f.idempotencyKey, subjectRef: f.subjectRef, serviceId: f.serviceId, mode: 'home', slotRef: f.slotRef, zoneId: f.zoneId, namedNurseFallback: f.namedNurseFallback ?? null, actorRole: ctx.caller.role },
    { now: ctx.clock.now(), candidates: rosterCandidates(), namedNurseFallback: accessIn(ctx).namedNurseFallback });
   if (!outcome.refused && outcome.events.length) saveBooking(ctx, outcome.value.booking);
   return answer(ctx, outcome, 'POST /v1/access/bookings@2', 'slot-not-offered', v => ({
    bookingRef: v.booking.bookingRef, stateCode: v.booking.state,
    ...(v.booking.namedNurseFallback !== null ? { namedNurseFallback: v.booking.namedNurseFallback } : {})
   }));
  },

  'GET /v1/access/bookings/{bookingRef}@1': (request: HandlerRequest, ctx: EngineContext) => {
   const bookingRef = String(request.fields.bookingRef);
   const held = bookingByRef(ctx, bookingRef);
   return answer(ctx, readBooking(ledgerOf(ctx), bookingRef, subjectFor(ctx, held)), 'GET /v1/access/bookings/{bookingRef}@1', 'booking-not-found', v => ({ ...v }));
  },

  'POST /v1/access/bookings/{bookingRef}/cancel@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { idempotencyKey: string; bookingRef: string; reasonCode: string };
   const held = bookingByRef(ctx, f.bookingRef);
   const outcome = cancelBooking(ledgerOf(ctx),
    { idempotencyKey: f.idempotencyKey, bookingRef: f.bookingRef, subjectRef: subjectFor(ctx, held), reasonCode: f.reasonCode, actorRole: ctx.caller.role },
    ctx.clock.now());
   if (!outcome.refused && outcome.events.length) {
    saveBooking(ctx, outcome.value.booking);
    /* A cancelled visit's thread closes with it, at once, and keeps what was said. */
    saveThread(ctx, closeThread(threadOf(ctx, outcome.value.booking), 'booking-cancelled'));
   }
   return answer(ctx, outcome, 'POST /v1/access/bookings/{bookingRef}/cancel@1', 'booking-not-found',
    v => ({ bookingRef: v.booking.bookingRef, stateCode: v.booking.state, windowCode: v.booking.cancellation?.windowCode ?? 'before-window' }));
  },

  'GET /v1/access/visit-threads/{bookingRef}@1': (request: HandlerRequest, ctx: EngineContext) => {
   const held = bookingByRef(ctx, String(request.fields.bookingRef));
   const actor = held ? actorFor(ctx, held) : null;
   if (!held || !actor) return refuse('not-on-this-visit');
   return answer(ctx, readThread(threadOf(ctx, held), actor, ctx.clock.now()), 'GET /v1/access/visit-threads/{bookingRef}@1', 'not-on-this-visit',
    v => ({ threadStateCode: v.threadStateCode, messages: v.messages.map(m => ({ ...m })) }));
  },

  'POST /v1/access/visit-threads/{bookingRef}/messages@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { idempotencyKey: string; bookingRef: string; message: string };
   const held = bookingByRef(ctx, f.bookingRef);
   const actor = held ? actorFor(ctx, held) : null;
   if (!held || !actor) return refuse('not-on-this-visit');
   const thread = threadOf(ctx, held);
   const attachments = request.undeclared.filter(name => ATTACHMENT.test(name)).length;
   const outcome = postMessage(thread, { idempotencyKey: f.idempotencyKey, actor, message: f.message, attachments, now: ctx.clock.now(), maxCharacters: accessIn(ctx).threadMaxCharacters });
   if (!outcome.refused && outcome.value.thread !== thread) saveThread(ctx, outcome.value.thread);
   return answer(ctx, outcome, 'POST /v1/access/visit-threads/{bookingRef}/messages@1', 'not-on-this-visit',
    v => ({ messageRef: v.message.messageRef, deliveryCode: v.message.deliveryCode }));
  },

  /* Who answers and whether anybody is there are read from the settings in force as the handover is asked for,
     and the desk is evaluated by rotaAt, the one rule for a rota. Out of hours the answer carries, in order,
     that nobody is there, the emergency numbers and the call back — and the handover still goes, because the
     queue is what a nurse reads when the desk opens. */
  'POST /v1/access/conversations/{conversationRef}/handover@2': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { conversationRef: string; summaryEntryRef: string; urgencyCode: string };
   const subjectRef = ctx.caller.ref ?? '';
   if (!subjectRef) return refuse('caller-not-allowed');
   const now = ctx.clock.now();
   const inForce = accessIn(ctx);
   const held = keptHandover(ctx, subjectRef, f.conversationRef);
   const outcome = queueHandover({ handovers: held ? [held.handover] : [] },
    { conversationRef: f.conversationRef, summaryEntryRef: f.summaryEntryRef, urgencyCode: f.urgencyCode, actorRole: ctx.caller.role, subjectRef, now });
   if (outcome.refused) return refuse(outcome.id);
   const desk = rotaAt(inForce.handoverHours, now.getTime());
   const opens = desk.opens;
   const callbackFrom = desk.open || !opens ? null : instantOf(isoIn(new Date(opens.at)), opens.from, new Date(opens.at));
   const deskStateCode = desk.open ? 'open' : 'out-of-hours';
   if (outcome.value.sentNow) {
    keepHandover(ctx, subjectRef, { handover: outcome.value.handover, deskStateCode, answeredByRoles: inForce.handoverAnsweredBy, callbackFrom, settingsVersion: inForce.settingsVersion });
    publishAll(ctx, outcome.events);
   }
   const words = booking.handover;
   return ok({
    handoverRef: outcome.value.handover.handoverRef, urgencyCode: outcome.value.handover.urgencyCode, sentNow: outcome.value.sentNow,
    deskStateCode, answeredByRoles: [...inForce.handoverAnsweredBy],
    ...(desk.open ? {} : { outOfHours: words.outOfHours, outOfHoursNumbers: withNumbers(words.outOfHoursNumbers), ...(callbackFrom ? { callbackFrom } : {}) })
   });
  },

  /* ---- The family arrangements (Wave 6) ------------------------------------------------------------
     A household is a roster: opening one, adding to one and reading one. None of the three opens anybody's
     record, and the refusal that says so fires on the words of a field the routes never declared, rather
     than on a field being quietly dropped — the binder hands over the names of everything undeclared, which
     is the same door the visit thread reads an attachment through. */
  'POST /v1/access/households@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { memberSubjectRefs: readonly string[] };
   const outcome = openHousehold(householdLedger(ctx),
    { openedBySubjectRef: ctx.caller.ref ?? '', memberSubjectRefs: f.memberSubjectRefs, sent: request.undeclared, now: ctx.clock.now() });
   if (!outcome.refused) saveHousehold(ctx, outcome.value.household);
   return settle(outcome, v => ({ householdRef: v.household.householdRef }));
  },

  'POST /v1/access/household-memberships@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { householdRef: string; memberSubjectRef: string };
   const outcome = addMember(householdLedger(ctx),
    { householdRef: f.householdRef, memberSubjectRef: f.memberSubjectRef, addedBySubjectRef: ctx.caller.ref ?? '', sent: request.undeclared, now: ctx.clock.now() });
   if (!outcome.refused) saveHousehold(ctx, outcome.value.household);
   return settle(outcome, v => ({ householdRef: v.household.householdRef, memberSubjectRef: v.membership.memberSubjectRef, addedOnDay: v.membership.addedOnDay }));
  },

  /* Named, one household, to somebody on it. Unnamed, every household the caller is on — which is an empty
     list for somebody on none, because there is no household they were refused. */
  'GET /v1/access/households@1': (request: HandlerRequest, ctx: EngineContext) => {
   const householdRef = typeof request.fields.householdRef === 'string' ? request.fields.householdRef : null;
   const ledger = householdLedger(ctx);
   const subjectRef = ctx.caller.ref ?? '';
   const said = (households: readonly Household[]) => ({
    households: households.map(h => ({
     householdRef: h.householdRef,
     members: h.members.map(m => ({ memberSubjectRef: m.memberSubjectRef, addedBySubjectRef: m.addedBySubjectRef, addedOnDay: m.addedOnDay }))
    }))
   });
   if (householdRef === null) return ok(said(householdsOf(ledger, subjectRef)));
   return settle(readHousehold(ledger, householdRef, subjectRef), v => said([v.household]));
  },

  /* A sponsorship names a household membership, never a typed name, and starts offered: packages/catalog/
     programmes.json says it starts when the person being paid for says yes, and she says it below. */
  'POST /v1/access/sponsors@2': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { householdRef: string; sponsoredSubjectRef: string };
   const outcome = offerSponsorship(sponsorshipLedger(ctx), householdLedger(ctx),
    { idempotencyKey: ctx.idempotencyKey ?? '', householdRef: f.householdRef, sponsoredSubjectRef: f.sponsoredSubjectRef, payerSubjectRef: ctx.caller.ref ?? '', sent: request.undeclared, now: ctx.clock.now() });
   if (!outcome.refused) saveSponsorship(ctx, outcome.value.sponsorship);
   return settle(outcome, v => ({ sponsorshipRef: v.sponsorship.sponsorshipRef, stateCode: v.sponsorship.stateCode, lineDetailId: v.sponsorship.lineDetailId }));
  },

  'POST /v1/access/sponsors/{sponsorshipRef}/answer@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { sponsorshipRef: string; answerCode: string };
   const outcome = answerSponsorship(sponsorshipLedger(ctx),
    { sponsorshipRef: f.sponsorshipRef, answerCode: f.answerCode, bySubjectRef: ctx.caller.ref ?? '', now: ctx.clock.now() });
   if (!outcome.refused) saveSponsorship(ctx, outcome.value.sponsorship);
   return settle(outcome, v => ({ sponsorshipRef: v.sponsorship.sponsorshipRef, stateCode: v.sponsorship.stateCode }));
  },

  /* The statement, which is the refusal done as arithmetic: the lines were built by domain/sponsorship.ts
     with the service already removed unless the recipient's line detail names it, so there is no field
     here for this handler to decide to leave out. */
  'GET /v1/access/sponsors@1': (request: HandlerRequest, ctx: EngineContext) => {
   const sponsorshipRef = typeof request.fields.sponsorshipRef === 'string' ? request.fields.sponsorshipRef : null;
   const outcome = statementsFor(sponsorshipLedger(ctx), { subjectRef: ctx.caller.ref ?? '', sponsorshipRef, sent: request.undeclared });
   return settle(outcome, v => ({
    sponsorships: v.statements.map(({ sponsorship, lines }) => ({
     sponsorshipRef: sponsorship.sponsorshipRef, householdRef: sponsorship.householdRef,
     sponsoredSubjectRef: sponsorship.sponsoredSubjectRef, payerSubjectRef: sponsorship.payerSubjectRef,
     stateCode: sponsorship.stateCode, lineDetailId: sponsorship.lineDetailId,
     paidCents: lines.reduce((total, line) => total + line.amountCents, 0),
     lines: lines.map(line => ({ ...line }))
    }))
   }));
  },

  /* A split divides one payable's amount and nothing else. The shares must add up to it in cents, and each
     payer accepts their own before any of it is owed. */
  'POST /v1/access/bill-splits@2': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { payableRef: string; amountCents: number; shares: readonly { payerSubjectRef: string; amountCents: number }[] };
   const outcome = proposeSplit(splitLedger(ctx),
    { idempotencyKey: ctx.idempotencyKey ?? '', payableRef: f.payableRef, amountCents: f.amountCents, shares: f.shares, proposedBySubjectRef: ctx.caller.ref ?? '', sent: request.undeclared, now: ctx.clock.now() });
   if (!outcome.refused) saveSplit(ctx, outcome.value.split);
   return settle(outcome, v => ({
    splitRef: v.split.splitRef, stateCode: splitState(v.split),
    shares: v.split.shares.map(s => ({ payerSubjectRef: s.payerSubjectRef, amountCents: s.amountCents, stateCode: s.stateCode }))
   }));
  },

  'POST /v1/access/bill-splits/{splitRef}/accept@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { splitRef: string; amountCents: number };
   const outcome = acceptShare(splitLedger(ctx),
    { splitRef: f.splitRef, amountCents: f.amountCents, bySubjectRef: ctx.caller.ref ?? '', sent: request.undeclared, now: ctx.clock.now() });
   if (!outcome.refused) saveSplit(ctx, outcome.value.split);
   return settle(outcome, v => ({
    splitRef: v.split.splitRef, stateCode: splitState(v.split), shareStateCode: v.share.stateCode,
    acceptedCount: v.split.shares.filter(s => s.stateCode === 'accepted').length, shareCount: v.split.shares.length
   }));
  },

  /* Who confirms a clinical review is Clinical's review-confirmer setting in force, asked of Clinical (Wave 5). */
  ...settingsRoutes(accessSettings, { read: 'GET /v1/access/settings@2', change: 'POST /v1/access/setting-changes@1', review: 'POST /v1/access/setting-reviews@2' }, { confirmers: confirmersFromClinical })
 }
});
