/**
 * ThusoIQ Core on the engine runtime: the closed loop, the alert router and the Control Tower's read.
 *
 * ── What is bound ────────────────────────────────────────────────────────────────────────────────────
 *
 * Six routes: opening a concern, acknowledging, escalating and closing it, raising an alert at version
 * two, and the Control Tower's list of open concerns. The bus route, the protocol registry, the
 * permission check and the audit export stay proposed and are answered by the contract mock. Alerts at
 * version one stay proposed as well: they carry no fallback, so every one of them would have run out of
 * people the moment its deadline passed.
 *
 * An alert is a concern with a rung, a dedupe key and a record entry, kept in the same table as every
 * other concern so that acknowledging, escalating and closing one is the same act; the events it
 * produces are alert.* rather than loop.*, because that is what its subscribers were frozen to hear.
 *
 * ── The clock ────────────────────────────────────────────────────────────────────────────────────────
 *
 * `tick` moves every unacknowledged concern past its deadline to its fallback, with the fallback given
 * the time the owner had, and marks a concern already with its fallback — or past it — exhausted. No
 * rota exists, so there is nobody after the fallback: packages/catalog/closed-loop.json says why, and
 * the escalate route refuses with no-fallback-left, whose sentence names the missing rota.
 *
 * ── Exhausted ────────────────────────────────────────────────────────────────────────────────────────
 *
 * An exhausted concern stays open, keeps the time it ran out, is read first by the Control Tower, and is
 * announced on the bus at the highest severity closed-loop.json allows. It is never closed by the tick,
 * never snoozed and never moved down a rung, and closing it needs an outcome like any other. The event
 * that announces it is not in packages/catalog/events.json yet, so the bus refuses it: the concern is
 * kept exhausted all the same, the refusal is on the bus trail by name, and the tick tries again every
 * time it runs, until the declaration exists and the announcement is accepted once.
 *
 * ── What Core does not read ──────────────────────────────────────────────────────────────────────────
 *
 * No Safety timing. A panic's window and an overdue check-in's grace are Safety's settings, and a Safety
 * concern arrives here with its deadline already worked out from them.
 *
 * Nothing here is a real service: no alert reaches a person, nobody is paged and nobody is on call.
 */
import { randomUUID } from 'node:crypto';
import { BusRefused, defineEngine, instant, ok, refuse, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { EXHAUSTED, engineIds, highestSeverity, ownerRoles, reasons, spanForRung } from './domain/contract.ts';
import { canMove, dueAction, escalated, stateCodeOf, towerOrder, type Loop } from './domain/loops.ts';

const schema = `
CREATE TABLE IF NOT EXISTS loops (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loop_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, loop_ref TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, actor_role TEXT NOT NULL, code TEXT);`;

const PUT = 'INSERT INTO loops (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc';
const AUDIT = 'INSERT INTO loop_audit (loop_ref, at, kind, actor_role, code) VALUES (?, ?, ?, ?, ?)';

const all = (ctx: EngineContext): Loop[] => (ctx.store.prepare('SELECT doc FROM loops ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Loop);
const find = (ctx: EngineContext, ref: unknown): Loop | undefined => {
 const row = ctx.store.prepare('SELECT doc FROM loops WHERE ref = ?').get(String(ref)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as Loop : undefined;
};
const put = (ctx: EngineContext, loop: Loop) => { ctx.store.prepare(PUT).run(loop.loopRef, JSON.stringify(loop)); };
const audit = (ctx: EngineContext, loop: Loop, kind: string, code: string | null = null) => { ctx.store.prepare(AUDIT).run(loop.loopRef, ctx.clock.iso(), kind, ctx.caller.role, code); };
const at = (ms: number) => instant(new Date(ms));
const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/* The engine a caller is, when it is one. A person acts on a concern by role; an engine acts only on the
   concerns that came from it. */
const callerEngine = (ctx: EngineContext): string | null => ctx.caller.role.startsWith('engine:') ? ctx.caller.role.slice('engine:'.length) : null;

/* ── What each change says on the bus ─────────────────────────────────────────────────────────────── */

/* The subject of every event about a concern is the concern itself. Core holds no person's reference,
   and a concern that named one would be a list of who is in trouble. */
const publish = (ctx: EngineContext, loop: Loop, key: EventKey, payload: Record<string, unknown>) =>
 ctx.publish(key, payload, { subjectRef: loop.alertRef ?? loop.loopRef, purposeOfUse: loop.purpose });

function announceEscalated(ctx: EngineContext, loop: Loop, reasonCode: string, fromRung: number | null = loop.rung) {
 if (loop.alertRef) publish(ctx, loop, 'alert.escalated@1', { alertRef: loop.alertRef, fromTier: fromRung, toTier: loop.rung, reasonCode, ownerRole: loop.ownerRole, acknowledgeBy: at(loop.dueBy) });
 else publish(ctx, loop, 'loop.escalated@1', { loopRef: loop.loopRef, reasonCode, ownerRole: loop.ownerRole, dueBy: at(loop.dueBy) });
}

/* A refusal of the announcement is not a reason to stop being exhausted. Anything other than the bus
   refusing it is a fault, and the tick rolls back whole. */
function announceExhausted(ctx: EngineContext, loop: Loop, now: number) {
 try {
  publish(ctx, loop, EXHAUSTED, {
   loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, exhaustedAt: at(loop.exhaustedAt!), severityCode: highestSeverity,
   ...(loop.alertRef ? { alertRef: loop.alertRef } : {})
  });
  put(ctx, { ...loop, announcedAt: now });
 } catch (error) {
  if (!(error instanceof BusRefused)) throw error;
 }
}

/* ── Opening a concern ────────────────────────────────────────────────────────────────────────────── */

type Opening = { sourceEngine: string; ownerRole: string; fallbackRole: string };
function openingRefusal(ctx: EngineContext, opening: Opening): string | null {
 if (callerEngine(ctx) !== opening.sourceEngine) return 'not-your-concern';
 if (!ownerRoles.has(opening.ownerRole)) return 'no-owner';
 if (!ownerRoles.has(opening.fallbackRole) || opening.fallbackRole === opening.ownerRole) return 'no-fallback';
 return null;
}

const fresh = (ctx: EngineContext, opening: Opening, now: number, spanMs: number): Loop => ({
 loopRef: `loop-${randomUUID()}`, sourceEngine: opening.sourceEngine, purpose: ctx.purpose, ownerRole: opening.ownerRole, fallbackRole: opening.fallbackRole,
 escalated: false, openedAt: now, dueBy: now + spanMs, spanMs, acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null,
 closedAt: null, outcomeRef: null, closedByRole: null, alertRef: null, rung: null, dedupeKey: null, recordEntryRef: null
});

const openingOf = (request: HandlerRequest): Opening => ({ sourceEngine: text(request.fields['sourceEngine']), ownerRole: text(request.fields['ownerRole']), fallbackRole: text(request.fields['fallbackRole']) });

function openLoop(request: HandlerRequest, ctx: EngineContext) {
 const opening = openingOf(request);
 const refused = openingRefusal(ctx, opening);
 if (refused) return refuse(refused);
 const now = nowOf(ctx);
 const spanMs = new Date(String(request.fields['dueBy'])).getTime() - now;
 if (!(spanMs > 0)) return refuse('deadline-in-the-past');
 const loop = fresh(ctx, opening, now, spanMs);
 put(ctx, loop);
 audit(ctx, loop, 'opened');
 publish(ctx, loop, 'loop.opened@1', { loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, dueBy: at(loop.dueBy) });
 return ok({ loopRef: loop.loopRef });
}

/* ── Raising an alert ─────────────────────────────────────────────────────────────────────────────── */

function raiseAlert(request: HandlerRequest, ctx: EngineContext) {
 /* The runtime hands Core the names of undeclared fields and never their values, so a reading sent
    under any name looks exactly like any other extra field. Every one is refused. */
 if (request.undeclared.length) return refuse('reading-in-alert');
 const rung = request.fields['rung'] as number;
 const spanMs = spanForRung(rung);
 if (spanMs === undefined) return refuse('unknown-rung');
 const opening = openingOf(request);
 const refused = openingRefusal(ctx, opening);
 if (refused) return refuse(refused);
 const dedupeKey = text(request.fields['dedupeKey']);
 const snoozeReason = request.fields['snoozeReasonCode'] === undefined ? null : text(request.fields['snoozeReasonCode']);
 const now = nowOf(ctx);

 /* One key from one engine is one alert while it is open. Two engines choosing the same key are two concerns. */
 const open = all(ctx).find(loop => loop.closedAt === null && loop.alertRef !== null && loop.sourceEngine === opening.sourceEngine && loop.dedupeKey === dedupeKey);
 if (!open) {
  if (snoozeReason !== null) return refuse('nothing-to-snooze');
  const recordEntryRef = text(request.fields['recordEntryRef']) || null;
  const loop: Loop = { ...fresh(ctx, opening, now, spanMs), alertRef: `alert-${randomUUID()}`, rung, dedupeKey, recordEntryRef };
  put(ctx, loop);
  audit(ctx, loop, 'raised');
  publish(ctx, loop, 'alert.raised@1', {
   alertRef: loop.alertRef, tier: rung, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, acknowledgeBy: at(loop.dueBy),
   ...(recordEntryRef ? { recordEntryRef } : {})
  });
  return ok({ alertRef: loop.alertRef, suppressed: false });
 }

 if (snoozeReason !== null) {
  if (open.exhaustedAt !== null) return refuse('exhausted-not-snoozed');
  if (!reasons.snooze.has(snoozeReason)) return refuse('snooze-without-reason');
  /* A snooze buys one more span of the alert's own rung from now, and only while nobody has taken it on:
     an acknowledged alert has no clock to move. */
  const snoozed = open.acknowledgedAt === null ? { ...open, dueBy: now + open.spanMs } : open;
  put(ctx, snoozed);
  audit(ctx, snoozed, 'snoozed', snoozeReason);
  return ok({ alertRef: open.alertRef, suppressed: true });
 }

 /* Raised again higher, it goes up to that rung. Raised again lower or the same, nothing about it moves:
    an alert is never lowered by a second sender being calmer than the first. */
 if (rung > open.rung!) {
  const higherSpan = spanMs;
  const running = open.acknowledgedAt === null && open.exhaustedAt === null;
  const raised: Loop = { ...open, rung, spanMs: Math.min(open.spanMs, higherSpan), dueBy: running ? Math.min(open.dueBy, now + higherSpan) : open.dueBy };
  put(ctx, raised);
  audit(ctx, raised, 'raised-higher', reasons.raisedAgainHigher);
  announceEscalated(ctx, raised, reasons.raisedAgainHigher, open.rung);
 } else {
  audit(ctx, open, 'absorbed');
 }
 return ok({ alertRef: open.alertRef, suppressed: true });
}

/* ── Acting on a concern ──────────────────────────────────────────────────────────────────────────── */

function acknowledge(request: HandlerRequest, ctx: EngineContext) {
 const loop = find(ctx, request.fields['loopRef']);
 if (!loop) return refuse('no-such-loop');
 if (loop.closedAt !== null) return refuse('loop-closed');
 const engine = callerEngine(ctx);
 if (engine ? engine !== loop.sourceEngine : ctx.caller.role !== loop.ownerRole) return refuse('not-this-loops-owner');
 if (loop.acknowledgedAt !== null) return ok({ acknowledgedAt: at(loop.acknowledgedAt) });
 const taken: Loop = { ...loop, acknowledgedAt: nowOf(ctx), acknowledgedByRole: ctx.caller.role };
 put(ctx, taken);
 audit(ctx, taken, 'acknowledged');
 if (taken.alertRef) publish(ctx, taken, 'alert.acknowledged@1', { alertRef: taken.alertRef, acknowledgedByRole: ctx.caller.role, acknowledgedByRef: ctx.caller.ref ?? ctx.caller.role });
 else publish(ctx, taken, 'loop.acknowledged@1', { loopRef: taken.loopRef, acknowledgedByRole: ctx.caller.role });
 return ok({ acknowledgedAt: at(taken.acknowledgedAt!) });
}

function escalate(request: HandlerRequest, ctx: EngineContext) {
 const reasonCode = text(request.fields['reasonCode']);
 if (!reasons.byCaller.has(reasonCode)) return refuse('reason-not-a-code');
 const loop = find(ctx, request.fields['loopRef']);
 if (!loop) return refuse('no-such-loop');
 const engine = callerEngine(ctx);
 if (engine && engine !== loop.sourceEngine) return refuse('not-your-concern');
 if (loop.closedAt !== null) return refuse('loop-closed');
 /* Nobody after the fallback. The refusal keeps the audit row saying who asked, and nothing else. */
 if (!canMove(loop)) {
  ctx.recordRefusal(AUDIT, loop.loopRef, ctx.clock.iso(), 'escalation-refused-no-rota', ctx.caller.role, reasonCode);
  return refuse('no-fallback-left');
 }
 const moved = escalated(loop, nowOf(ctx));
 put(ctx, moved);
 audit(ctx, moved, 'escalated', reasonCode);
 announceEscalated(ctx, moved, reasonCode);
 return ok({ ownerRole: moved.ownerRole, dueBy: at(moved.dueBy) });
}

function close(request: HandlerRequest, ctx: EngineContext) {
 const loop = find(ctx, request.fields['loopRef']);
 if (!loop) return refuse('no-such-loop');
 if (loop.closedAt !== null) return refuse('loop-closed');
 const outcomeRef = text(request.fields['outcomeRef']);
 if (!outcomeRef) return refuse('no-outcome');
 const closed: Loop = { ...loop, closedAt: nowOf(ctx), outcomeRef, closedByRole: ctx.caller.role };
 put(ctx, closed);
 audit(ctx, closed, 'closed', outcomeRef);
 if (closed.alertRef) publish(ctx, closed, 'alert.closed@1', { alertRef: closed.alertRef, outcomeRef, closedByRole: ctx.caller.role });
 else publish(ctx, closed, 'loop.closed@1', { loopRef: closed.loopRef, outcomeRef, closedByRole: ctx.caller.role });
 return ok({ closedAt: at(closed.closedAt!) });
}

/* ── The Control Tower ────────────────────────────────────────────────────────────────────────────── */

function tower(request: HandlerRequest, ctx: EngineContext) {
 const sourceEngine = request.fields['sourceEngine'] === undefined ? null : text(request.fields['sourceEngine']);
 if (sourceEngine !== null && !engineIds.has(sourceEngine)) return refuse('unknown-source-engine');
 /* A filter narrows what is waiting and never hides a concern that has nobody left. */
 const listed = towerOrder(all(ctx)).filter(loop => sourceEngine === null || loop.sourceEngine === sourceEngine || loop.exhaustedAt !== null);
 return ok({
  loops: listed.map(loop => ({
   loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, stateCode: stateCodeOf(loop), dueBy: at(loop.dueBy),
   ...(loop.exhaustedAt !== null ? { exhaustedAt: at(loop.exhaustedAt) } : {}),
   ...(loop.alertRef ? { alertRef: loop.alertRef } : {})
  })),
  exhaustedCount: listed.filter(loop => loop.exhaustedAt !== null).length
 });
}

export const engine = defineEngine({
 id: 'core',
 store: { schema },
 routes: {
  'POST /v1/core/loops@1': openLoop,
  'GET /v1/core/loops@1': tower,
  'POST /v1/core/loops/{loopRef}/acknowledge@1': acknowledge,
  'POST /v1/core/loops/{loopRef}/escalate@1': escalate,
  'POST /v1/core/loops/{loopRef}/close@1': close,
  'POST /v1/core/alerts@2': raiseAlert
 },
 subscriptions: {},
 tick: ctx => {
  const now = nowOf(ctx);
  for (const loop of all(ctx)) {
   const action = dueAction(loop, now);
   let current = loop;
   if (action === 'escalate') {
    current = escalated(loop, now);
    put(ctx, current);
    audit(ctx, current, 'escalated', reasons.deadlinePassed);
    announceEscalated(ctx, current, reasons.deadlinePassed);
   } else if (action === 'exhaust') {
    current = { ...loop, exhaustedAt: now };
    put(ctx, current);
    audit(ctx, current, 'exhausted');
   }
   if (current.closedAt === null && current.exhaustedAt !== null && current.announcedAt === null) announceExhausted(ctx, current, now);
  }
 }
});
