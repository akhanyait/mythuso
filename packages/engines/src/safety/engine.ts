/* Safety on the engine runtime: what Wave 3 can build honestly against the frozen v1 contract.
 *
 * BUILT: POST /v1/safety/panics@1. A nurse, locum, responder or courier presses panic; the domain
 * opens the window in force (packages/catalog/field-safety.json panic.windowMinutes, as an admin last
 * set it) and refuses any window no version of the settings ever held; the panic is stored with the
 * settings version it opened under and panic.raised@1 goes on the bus with who pressed it by role and
 * when sharing ends. The store has no position column, deliberately: no route carries a position yet,
 * so there is nowhere for one to be kept, and when a position route exists it goes through
 * domain/panics.ts, which keeps only the latest and forgets it when sharing stops.
 *
 * BUILT: GET /v1/safety/settings@1 and POST /v1/safety/setting-changes@1. The founder decided on 15
 * September 2026 that Operations sets the field-safety timings on the admin. An admin reads the timings
 * in force with their ranges and history, and changes one with a reason against the version in force;
 * domain/settings.ts decides whether the change is allowed and this file appends it to settings_changes.
 * Nothing in this file updates or deletes a settings_changes row: the history is added to, and the
 * settings in force are always the defaults with it replayed. A change publishes nothing, because no
 * engine acts on one — Core does not read Safety's timings, since Safety sends the deadline on what it
 * raises — and the event contract refuses an event nobody subscribes to.
 *
 * A CHANGE NEVER MOVES SOMETHING ALREADY RUNNING. A panic stores its end when it is pressed and a visit
 * under way stores the settings version and the timings it started with, and nothing reads the settings
 * again for either. A later change is read by the next panic and the next visit, and by nothing else.
 *
 * A PANIC IS NEVER SWALLOWED. The route is idempotent and its key is chosen by the phone, and a key
 * chosen by a phone is not a promise that nobody else chose it. The first version let two nurses whose
 * apps generated the same key share one panic: the second press was answered with the first nurse's
 * panic and nobody at the desk heard about the second nurse at all. The runtime now keys a replay by
 * the identified caller (72390a1); this handler does not rely on that alone. A press is folded into an
 * earlier panic only when the same identified caller presses for the same visit while that panic's
 * window is still open — the same act, answered again, never refused, and with the end it already had.
 * A different caller, a different visit, a caller with no reference or a closed window is always a new
 * panic and a new panic.raised.
 *
 * A PANIC IS NEVER REFUSED OVER BOOKKEEPING. An appointmentRef this engine has never heard of is
 * stored as given, and a phone that read the window before an admin changed it is answered with the
 * window in force rather than refused. The only refusals are the two about the window.
 *
 * HEARD: appointment.in_progress@1. Safety records that a visit is under way, and only one whose code
 * matched, because the event carries visitCodeMatched so that a subscriber can refuse one that says
 * otherwise. It records the settings in force with it. That is the first half of a timer.
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
import type { EngineStore } from '../runtime/types.ts';
import { instant } from './domain/rules.ts';
import { raisePanic } from './domain/panics.ts';
import { changeSetting, defaultTimings, inForce, keyOf, panicWindowOf, timingRows, type SettingsChange, type TimingId } from './domain/settings.ts';

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
 'CREATE TABLE IF NOT EXISTS visits_under_way (',
 ' appointment_ref TEXT PRIMARY KEY,',
 ' heard_at INTEGER NOT NULL,',
 ' settings_version INTEGER NOT NULL,',
 ' grace_minutes INTEGER NOT NULL,',
 ' extension_steps TEXT NOT NULL,',
 ' max_extension_minutes INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS settings_changes (',
 ' settings_version INTEGER PRIMARY KEY,',
 ' timing TEXT NOT NULL,',
 ' from_minutes TEXT NOT NULL,',
 ' to_minutes TEXT NOT NULL,',
 ' reason TEXT NOT NULL,',
 ' changed_by_role TEXT NOT NULL,',
 ' changed_by_ref TEXT NOT NULL,',
 ' changed_at INTEGER NOT NULL',
 ');'
].join('\n');

type OpenPanic = { panic_ref: string; location_share_ends_at: number };
type ChangeRow = { settings_version: number; timing: string; from_minutes: string; to_minutes: string; reason: string; changed_by_role: string; changed_by_ref: string; changed_at: number };

/* The history, oldest first, exactly as it was appended. Read afresh for every act, so the settings in
   force are never a copy this module holds that could fall behind its own table. */
const historyOf = (store: EngineStore): SettingsChange[] =>
 (store.prepare('SELECT settings_version, timing, from_minutes, to_minutes, reason, changed_by_role, changed_by_ref, changed_at FROM settings_changes ORDER BY settings_version').all() as ChangeRow[])
  .map(row => ({ settingsVersion: row.settings_version, timing: row.timing as TimingId, from: JSON.parse(row.from_minutes), to: JSON.parse(row.to_minutes), reason: row.reason, byRole: row.changed_by_role, byRef: row.changed_by_ref, at: row.changed_at }));

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
    if (open) return ok({ panicRef: open.panic_ref, locationShareEndsAt: new Date(open.location_share_ends_at).toISOString() });
   }

   const panic = pressed.value;
   ctx.store.prepare('INSERT INTO panics (panic_ref, raised_by_role, raised_by_ref, appointment_ref, raised_at, settings_version, location_share_ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(panic.panicRef, panic.raisedByRole, callerRef, panic.appointmentRef, panic.raisedAt, panic.settingsVersion, panic.locationShareEndsAt);
   /* The subject of the event is the identified caller when there is one. Without a reference the
      panic's own reference stands in, rather than the event going unsent or a subject being guessed. */
   for (const event of pressed.emits) ctx.publish((event.type + '@' + event.version) as EventKey, event.payload, { subjectRef: callerRef ?? panic.panicRef });
   return ok({ panicRef: panic.panicRef, locationShareEndsAt: new Date(panic.locationShareEndsAt).toISOString() });
  },

  'GET /v1/safety/settings@1': (_request, ctx) => {
   const history = historyOf(ctx.store);
   const current = inForce(history);
   return ok({
    settingsVersion: current.settingsVersion,
    settings: timingRows.map(row => ({
     timing: row.id, unit: row.unit, inForce: current.timings[keyOf(row.id)], default: defaultTimings[keyOf(row.id)],
     lowest: row.lowest.value, highest: row.highest.value
    })),
    history: history.map(change => ({
     settingsVersion: change.settingsVersion, timing: change.timing, from: change.from, to: change.to,
     reason: change.reason, byRole: change.byRole, byRef: change.byRef, at: instant(change.at)
    }))
   });
  },

  'POST /v1/safety/setting-changes@1': (request, ctx) => {
   const now = ctx.clock.now().getTime();
   /* The caller's role and reference are the runtime's, never a field: who made a change is recorded from
      the caller the binder admitted, so a request cannot name somebody else as having made it. */
   const changed = changeSetting(historyOf(ctx.store), {
    timing: request.fields.timing, minutes: request.fields.minutes, stepMinutes: request.fields.stepMinutes,
    reason: request.fields.reason, expectedVersion: request.fields.expectedVersion,
    byRole: ctx.caller.role, byRef: ctx.caller.ref
   }, now);
   if (!changed.ok) return refuse(changed.refusal.id);
   const { change } = changed.value;
   ctx.store.prepare('INSERT INTO settings_changes (settings_version, timing, from_minutes, to_minutes, reason, changed_by_role, changed_by_ref, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(change.settingsVersion, change.timing, JSON.stringify(change.from), JSON.stringify(change.to), change.reason, change.byRole, change.byRef, change.at);
   return ok({ settingsVersion: change.settingsVersion, appliesFrom: instant(change.at) });
  }
 },
 subscriptions: {
  'appointment.in_progress@1': (event, ctx) => {
   if (event.payload.visitCodeMatched !== true || typeof event.payload.appointmentRef !== 'string') return;
   /* The settings in force when the visit started, kept with it. OR IGNORE keeps the first: the same
      visit heard again is not a new start, and must not pick up a change made since. */
   const { settingsVersion, timings } = inForce(historyOf(ctx.store));
   ctx.store.prepare('INSERT OR IGNORE INTO visits_under_way (appointment_ref, heard_at, settings_version, grace_minutes, extension_steps, max_extension_minutes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(event.payload.appointmentRef, ctx.clock.now().getTime(), settingsVersion, timings.graceMinutes, JSON.stringify(timings.extensionSteps), timings.maxExtensionMinutes);
  }
 }
});
