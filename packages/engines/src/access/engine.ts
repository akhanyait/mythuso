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
   review of one. And one subscription: appointment.completed@1, from Care.

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

   GET /v1/access/settings@1, POST /v1/access/setting-changes@1 and POST /v1/access/setting-reviews@1,
   through packages/engines/src/settings, with the history in this store's settings_history. They live
   here rather than in apps/api because apps/api holds identity only, and these are policy about the
   bookings, threads and handovers this engine answers. Each act reads the value in force once, when it
   starts: the booking route offers slots and checks the answer against the named-nurse fallback in force,
   and the booking keeps the answer; the thread route measures a message against the length in force as it
   is written, and never a message already kept; the handover reads the desk's hours as it is asked for.

   ── A thread after its visit ─────────────────────────────────────────────────────────────────────

   Access hears appointment.completed@1. Care names the appointment it opens for a booking by booking.json's
   careAppointmentRef, so the thread is found by that name; a completion for an appointment no booking here
   opened — the preview visit — closes nothing. The thread stays open for the hours the setting
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
import { SETTINGS_SCHEMA, historyOf, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { rotaAt } from '../settings/shape.ts';
import { cancelBooking, readBooking, requestBooking, type Booking, type Ledger } from './domain/booking.ts';
import { instantOf, isoIn, type AccessEvent, type Outcome } from './domain/contract.ts';
import { queueHandover, type Handover } from './domain/handover.ts';
import { rosterCandidates } from './domain/roster.ts';
import { accessInForceAt, accessSettings, accessSettingsOf } from './domain/settings.ts';
import { closeThread, completeThread, postMessage, readThread, threadFor, type Actor, type Thread, type ThreadRole } from './domain/thread.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS bookings (booking_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS threads (booking_ref TEXT PRIMARY KEY, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS handovers (subject_ref TEXT NOT NULL, conversation_ref TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (subject_ref, conversation_ref));',
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

/* The emergency numbers are sos.json's, filled into booking.json's sentence by their ids. Nothing here types one. */
const withNumbers = (text: string) => text.replace(/\{(\w+)\}/g, (token, id: string) => sos.emergency.numbers.find(n => n.id === id)?.number ?? token);
/* The appointment Care opens for a booking, named as booking.json says Care names it. */
const careAppointmentOf = (bookingRef: string) => booking.careAppointmentRef.replace('{bookingRef}', bookingRef);

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
  'appointment.completed@1': (event, ctx) => {
   const appointmentRef = String(event.payload.appointmentRef);
   const held = ledgerOf(ctx).bookings.find(b => careAppointmentOf(b.bookingRef) === appointmentRef);
   if (!held) return;
   const at = Date.parse(event.occurredAt);
   const thread = threadOf(ctx, held);
   const completed = completeThread(thread, new Date(at), accessInForceAt(historyOf(ctx.store), at).threadOpenHoursAfterVisit);
   if (completed !== thread) saveThread(ctx, completed);
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

  ...settingsRoutes(accessSettings, { read: 'GET /v1/access/settings@1', change: 'POST /v1/access/setting-changes@1', review: 'POST /v1/access/setting-reviews@1' })
 }
});
