/* Safety on the engine runtime: what Wave 3 can build honestly against the frozen v1 contract.
 *
 * BUILT: POST /v1/safety/panics@1. A nurse, locum, responder or courier presses panic; the domain
 * opens the declared window (packages/catalog/field-safety.json panic.windowMinutes) and refuses any
 * other; the panic is stored and panic.raised@1 goes on the bus with who pressed it by role and when
 * sharing ends. The store has no position column, deliberately: no route carries a position yet, so
 * there is nowhere for one to be kept, and when a position route exists it goes through
 * domain/panics.ts, which keeps only the latest and forgets it when sharing stops.
 *
 * A PANIC IS NEVER SWALLOWED. The route is idempotent and its key is chosen by the phone, and a key
 * chosen by a phone is not a promise that nobody else chose it. The first version let two nurses whose
 * apps generated the same key share one panic: the second press was answered with the first nurse's
 * panic and nobody at the desk heard about the second nurse at all. The runtime now keys a replay by
 * the identified caller (72390a1); this handler does not rely on that alone. A press is folded into an
 * earlier panic only when the same identified caller presses for the same visit while that panic's
 * window is still open — the same act, answered again, never refused. A different caller, a different
 * visit, a caller with no reference or a closed window is always a new panic and a new panic.raised.
 *
 * A PANIC IS NEVER REFUSED OVER BOOKKEEPING. An appointmentRef this engine has never heard of is
 * stored as given. The only refusals are the two about the window.
 *
 * HEARD: appointment.in_progress@1. Safety records that a visit is under way, and only one whose code
 * matched, because the event carries visitCodeMatched so that a subscriber can refuse one that says
 * otherwise. That is the first half of a timer.
 *
 * NOT BUILT, AND WHY (the Wave 3 report lists what each needs):
 *  - POST /v1/safety/checkins@1 sends expectedMinutes and no service. A visit is timed by the service
 *    booked, from packages/catalog/services.json, and nothing Safety hears carries one before the visit
 *    ends: appointment.in_progress@1 has no serviceId and Safety does not hear appointment.requested@1.
 *    Building it would mean timing a visit by a number a phone sent, which is the refusal
 *    expected-minutes-not-the-service. It needs checkins@2 with serviceId, or appointment.in_progress@2.
 *  - POST /v1/safety/checkins/{checkinRef}/extend@1 has no field for a reason, and an extension without
 *    one is refused. It needs extend@2 with reasonId.
 *  - POST /v1/safety/checkins/{checkinRef}/close@1 closes a timer nothing can start.
 *  - appointment.completed@1 does not list safety as a subscriber, so the binder would refuse it.
 * The arithmetic for all of it is written and tested in domain/, and the web and native previews run it.
 */
import { randomUUID } from 'node:crypto';
import { defineEngine, ok, refuse, type EventKey } from '../runtime/index.ts';
import { raisePanic } from './domain/panics.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS panics (',
 ' panic_ref TEXT PRIMARY KEY,',
 ' raised_by_role TEXT NOT NULL,',
 ' raised_by_ref TEXT,',
 ' appointment_ref TEXT,',
 ' raised_at INTEGER NOT NULL,',
 ' location_share_ends_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS visits_under_way (',
 ' appointment_ref TEXT PRIMARY KEY,',
 ' heard_at INTEGER NOT NULL',
 ');'
].join('\n');

type OpenPanic = { panic_ref: string; location_share_ends_at: number };

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
   }, now);
   if (!pressed.ok) return refuse(pressed.refusal.id);

   if (callerRef) {
    const open = ctx.store.prepare(
     'SELECT panic_ref, location_share_ends_at FROM panics WHERE raised_by_role = ? AND raised_by_ref = ? AND appointment_ref IS ? AND location_share_ends_at > ? ORDER BY raised_at DESC LIMIT 1'
    ).get(ctx.caller.role, callerRef, appointmentRef, now) as OpenPanic | undefined;
    if (open) return ok({ panicRef: open.panic_ref, locationShareEndsAt: new Date(open.location_share_ends_at).toISOString() });
   }

   const panic = pressed.value;
   ctx.store.prepare('INSERT INTO panics (panic_ref, raised_by_role, raised_by_ref, appointment_ref, raised_at, location_share_ends_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(panic.panicRef, panic.raisedByRole, callerRef, panic.appointmentRef, panic.raisedAt, panic.locationShareEndsAt);
   /* The subject of the event is the identified caller when there is one. Without a reference the
      panic's own reference stands in, rather than the event going unsent or a subject being guessed. */
   for (const event of pressed.emits) ctx.publish((event.type + '@' + event.version) as EventKey, event.payload, { subjectRef: callerRef ?? panic.panicRef });
   return ok({ panicRef: panic.panicRef, locationShareEndsAt: new Date(panic.locationShareEndsAt).toISOString() });
  }
 },
 subscriptions: {
  'appointment.in_progress@1': (event, ctx) => {
   if (event.payload.visitCodeMatched !== true || typeof event.payload.appointmentRef !== 'string') return;
   ctx.store.prepare('INSERT OR IGNORE INTO visits_under_way (appointment_ref, heard_at) VALUES (?, ?)')
    .run(event.payload.appointmentRef, ctx.clock.now().getTime());
  }
 }
});
