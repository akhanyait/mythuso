/* Safety on the engine runtime: the nurse's visit timer, her panic, and the desk that works both.
 *
 * THE TIMER IS STARTED BY THE EVENT, BY THE SERVICE. Safety hears appointment.in_progress@2, which Care
 * publishes only once the visit code has matched and which carries the serviceId booked. It starts the visit's
 * timer from that service's duration in packages/catalog/services.json and the grace, extension steps and
 * ceiling in force (packages/catalog/field-safety.json settings, as an admin last set them), and the timer keeps
 * that settings version and those timings for its whole life. No route starts a timer and no phone sends a
 * minute: POST /v1/safety/checkins@1, which sent expectedMinutes, is still proposed and answered by nothing
 * here. The same visit heard again keeps the timer it has. A visit whose service the catalogue does not hold
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
 * Nothing here is a real service: no timer reaches a desk, no panic reaches a person, and nobody is sent.
 */
import { randomUUID } from 'node:crypto';
import { defineEngine, ok, refuse, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, historyOf, settingsRoutes } from '../settings/routes.ts';
import { acknowledgeOverdue, checkIn, close, completeVisit, extend, extensionLeft, silenceOverdue, standingOf, startTimer, stepsOffered, tick as tickTimer, type Timer } from './domain/checkins.ts';
import { deskQueue } from './domain/desk.ts';
import { acknowledge, positionFor, raisePanic, resolve, sharingEndsAt, type DeskActor, type Panic } from './domain/panics.ts';
import { instant, type EmittedEvent, type Result } from './domain/rules.ts';
import { inForce, panicWindowOf, safetySettings } from './domain/settings.ts';

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

  ...settingsRoutes(safetySettings, { read: 'GET /v1/safety/settings@2', change: 'POST /v1/safety/setting-changes@2' })
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
  }
 },
 tick: ctx => {
  const now = nowOf(ctx);
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
