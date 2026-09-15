/* The Access engine on the development runtime: bookings and the visit thread.

   The binder has already done the contract's part before any handler here runs — the caller's role,
   the purpose, the required fields and their types, the idempotency key, and a replay of the same key
   from the same caller — so what is left is the domain's decision, run against this engine's own store,
   and the events it publishes. Every answer is either a declared response or a declared refusal id; the
   runtime renders the sentence.

   ── What is bound, and what is left to the mock on purpose ───────────────────────────────────────

   Five routes: book, read a booking, cancel one, read a visit thread and write in it.

   POST /v1/access/conversations/{conversationRef}/handover@1 is not bound. Its request carries the
   conversation and the summary entry and nothing about urgency, and conversation.handover@1 must carry
   the urgency the rules set. Gilbert's matcher runs on the phone, so this engine holds no conversation
   to read an urgency from; a handler would have to publish one it did not know, and not-assessed for a
   conversation that showed the ambulance numbers is exactly the lowered emergency Access refuses. The
   screens run the same domain function on the device, where the conversation is. The route needs a
   version that carries the urgency, or a server-side conversation, before it is built.

   ── What the binder cannot check, and this cannot either ─────────────────────────────────────────

   A patient books and reads only their own bookings: the caller's reference must be the subject. A
   caregiver, a guardian and a Thuso Line agent act for somebody else, and whether they may for this
   subject is a household or grant question no store here answers — so they are recorded as the actor
   and not refused. That is a gap, written down, not a permission.

   There is no address on the booking route, so whether a visit is somewhere dispatch reaches cannot be
   asked here; Care asks it when it makes the offer. And no event tells Access that Care accepted a
   booking — Access hears appointment.confirmed and appointment.en_route, which name Care's appointment
   and not this booking — so nothing here confirms. The screens' simulated roster does, and says so.

   Every statement below is one statement with its values bound, because the store facade refuses
   anything else; the tables are created by the schema, which the runtime runs before any handler. */
import { defineEngine, ok, refuse, type Answer, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { cancelBooking, readBooking, requestBooking, type Booking, type Ledger } from './domain/booking.ts';
import type { AccessEvent, Outcome } from './domain/contract.ts';
import { rosterCandidates } from './domain/roster.ts';
import { closeThread, postMessage, readThread, threadFor, type Actor, type Thread, type ThreadRole } from './domain/thread.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS bookings (booking_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, body TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS threads (booking_ref TEXT PRIMARY KEY, body TEXT NOT NULL);'
].join('\n');

const ledgerOf = (ctx: EngineContext): Ledger =>
 ({ bookings: (ctx.store.prepare('SELECT body FROM bookings ORDER BY rowid').all() as { body: string }[]).map(row => JSON.parse(row.body) as Booking) });
const saveBooking = (ctx: EngineContext, booking: Booking) =>
 ctx.store.prepare('INSERT INTO bookings (booking_ref, subject_ref, body) VALUES (?, ?, ?) ON CONFLICT(booking_ref) DO UPDATE SET body = excluded.body')
  .run(booking.bookingRef, booking.subjectRef, JSON.stringify(booking));
const threadOf = (ctx: EngineContext, booking: Booking): Thread => {
 const row = ctx.store.prepare('SELECT body FROM threads WHERE booking_ref = ?').get(booking.bookingRef) as { body: string } | undefined;
 return row ? JSON.parse(row.body) as Thread : threadFor(booking);
};
const saveThread = (ctx: EngineContext, thread: Thread) =>
 ctx.store.prepare('INSERT INTO threads (booking_ref, body) VALUES (?, ?) ON CONFLICT(booking_ref) DO UPDATE SET body = excluded.body')
  .run(thread.bookingRef, JSON.stringify(thread));

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
const subjectFor = (ctx: EngineContext, booking: Booking | undefined) =>
 ctx.caller.role === 'patient' ? ctx.caller.ref ?? '' : booking?.subjectRef ?? '';
const actorFor = (ctx: EngineContext, booking: Booking): Actor | null => {
 const role = ctx.caller.role as ThreadRole;
 if (role === 'patient' || role === 'nurse') return ctx.caller.ref ? { role, ref: ctx.caller.ref } : null;
 return { role, ref: booking.subjectRef };
};
/* The route declares no attachment field, so the binder never hands one over; what it does hand over is
   the name of anything undeclared that was sent. A name that is a file of some kind is refused in words
   rather than silently dropped, because a person who attached a photo should be told it did not go. */
const ATTACHMENT = /attach|photo|image|picture|file|media|voice|audio|video|document/i;

export const engine = defineEngine({
 id: 'access',
 store: { schema },
 subscriptions: {},
 routes: {
  'POST /v1/access/bookings@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { idempotencyKey: string; subjectRef: string; serviceId: string; mode: string; slotRef: string };
   if (ctx.caller.role === 'patient' && ctx.caller.ref !== f.subjectRef) return refuse('caller-not-allowed');
   if (f.mode !== 'home') return refuse('service-not-here');
   const outcome = requestBooking(ledgerOf(ctx),
    { idempotencyKey: f.idempotencyKey, subjectRef: f.subjectRef, serviceId: f.serviceId, mode: 'home', slotRef: f.slotRef, actorRole: ctx.caller.role },
    { now: ctx.clock.now(), candidates: rosterCandidates(), visitCovered: true });
   if (!outcome.refused && outcome.events.length) saveBooking(ctx, outcome.value.booking);
   return answer(ctx, outcome, 'POST /v1/access/bookings@1', 'slot-not-offered', v => ({ bookingRef: v.booking.bookingRef, stateCode: v.booking.state }));
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
    /* A cancelled visit's thread closes with it, and keeps what was said. */
    saveThread(ctx, closeThread(threadOf(ctx, outcome.value.booking), 'booking-cancelled'));
   }
   return answer(ctx, outcome, 'POST /v1/access/bookings/{bookingRef}/cancel@1', 'booking-not-found',
    v => ({ bookingRef: v.booking.bookingRef, stateCode: v.booking.state, windowCode: v.booking.cancellation?.windowCode ?? 'before-window' }));
  },

  'GET /v1/access/visit-threads/{bookingRef}@1': (request: HandlerRequest, ctx: EngineContext) => {
   const booking = bookingByRef(ctx, String(request.fields.bookingRef));
   const actor = booking ? actorFor(ctx, booking) : null;
   if (!booking || !actor) return refuse('not-on-this-visit');
   return answer(ctx, readThread(threadOf(ctx, booking), actor), 'GET /v1/access/visit-threads/{bookingRef}@1', 'not-on-this-visit',
    v => ({ threadStateCode: v.threadStateCode, messages: v.messages.map(m => ({ ...m })) }));
  },

  'POST /v1/access/visit-threads/{bookingRef}/messages@1': (request: HandlerRequest, ctx: EngineContext) => {
   const f = request.fields as { idempotencyKey: string; bookingRef: string; message: string };
   const booking = bookingByRef(ctx, f.bookingRef);
   const actor = booking ? actorFor(ctx, booking) : null;
   if (!booking || !actor) return refuse('not-on-this-visit');
   const thread = threadOf(ctx, booking);
   const attachments = request.undeclared.filter(name => ATTACHMENT.test(name)).length;
   const outcome = postMessage(thread, { idempotencyKey: f.idempotencyKey, actor, message: f.message, attachments, now: ctx.clock.now() });
   if (!outcome.refused && outcome.value.thread !== thread) saveThread(ctx, outcome.value.thread);
   return answer(ctx, outcome, 'POST /v1/access/visit-threads/{bookingRef}/messages@1', 'not-on-this-visit',
    v => ({ messageRef: v.message.messageRef, deliveryCode: v.message.deliveryCode }));
  }
 }
});
