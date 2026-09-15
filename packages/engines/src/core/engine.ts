/**
 * ThusoIQ Core on the engine runtime: the closed loop, the alert router, the escalation rota and the Control
 * Tower's read.
 *
 * ── What is bound ────────────────────────────────────────────────────────────────────────────────────
 *
 * Eight routes: opening a concern, acknowledging, escalating and closing it, raising an alert at version
 * two, the Control Tower's list of open concerns, and Core's settings read and change. The bus route, the
 * protocol registry, the permission check and the audit export stay proposed and are answered by the
 * contract mock. Alerts at version one stay withdrawn: they carry no fallback. The list, the acknowledgement
 * and the escalation are at version two, and version one of each is withdrawn: version one's list could not
 * say where a concern is on the rota, its acknowledgement did not admit the operator who holds the desk's
 * post, and its escalation refused in a sentence naming a rota that did not exist.
 *
 * An alert is a concern with a rung, a dedupe key and a record entry, kept in the same table as every
 * other concern so that acknowledging, escalating and closing one is the same act; the events it
 * produces are alert.* rather than loop.*, because that is what its subscribers were frozen to hear.
 *
 * ── The rota ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The escalation rota and the minutes at each rung of it are Core's settings (domain/settings.ts), changed
 * by an admin through packages/engines/src/settings with the history in this store. A concern reads the rota
 * in force once, when it is opened, and keeps it: an admin's change reaches the next concern and never one
 * already escalating. Where a concern goes, and when a post is skipped, is domain/loops.ts's.
 *
 * ── The clock ────────────────────────────────────────────────────────────────────────────────────────
 *
 * `tick` acts on every deadline that has passed for a concern nobody has taken on, each at the moment it
 * passed: its owner's to its fallback, its fallback's to the first post of its rota on duty, and up the
 * rota, writing down every post skipped. A concern past the last holder anybody could be is exhausted.
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
 * ── A panic ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * Core hears panic.raised@1, as the event contract already says it does, and alerts every post on duty in
 * the rota in force at once, at the highest severity. That is closed-loop.json's rule and not a setting.
 *
 * ── What Core does not read ──────────────────────────────────────────────────────────────────────────
 *
 * No Safety timing. A panic's window and an overdue check-in's grace are Safety's settings, and a Safety
 * concern arrives here with its deadline already worked out from them.
 *
 * Nothing here is a real service: no alert reaches a person, nobody is paged and nobody is on call.
 */
import { randomUUID } from 'node:crypto';
import { BusRefused, defineEngine, instant, ok, refuse, type BusEvent, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { EXHAUSTED, PANIC, engineIds, highestSeverity, ownerRoles, panicSpanMs, reasons, spanForRung } from './domain/contract.ts';
import { everyPostOnDuty, holdersOf, movedTo, nextHolder, postOf, settle, stateCodeOf, towerOrder, type KeptRota, type Loop, type Skip } from './domain/loops.ts';
import { coreSettings, rotaOf } from './domain/settings.ts';

const schema = `
CREATE TABLE IF NOT EXISTS loops (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loop_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, loop_ref TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, actor_role TEXT NOT NULL, code TEXT);
${SETTINGS_SCHEMA}`;

const PUT = 'INSERT INTO loops (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc';
const AUDIT = 'INSERT INTO loop_audit (loop_ref, at, kind, actor_role, code) VALUES (?, ?, ?, ?, ?)';

const all = (ctx: EngineContext): Loop[] => (ctx.store.prepare('SELECT doc FROM loops ORDER BY rowid').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Loop);
const find = (ctx: EngineContext, ref: unknown): Loop | undefined => {
 const row = ctx.store.prepare('SELECT doc FROM loops WHERE ref = ?').get(String(ref)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as Loop : undefined;
};
const put = (ctx: EngineContext, loop: Loop) => { ctx.store.prepare(PUT).run(loop.loopRef, JSON.stringify(loop)); };
const at = (ms: number) => instant(new Date(ms));
const audit = (ctx: EngineContext, loop: Loop, kind: string, code: string | null = null, when: string = ctx.clock.iso()) => { ctx.store.prepare(AUDIT).run(loop.loopRef, when, kind, ctx.caller.role, code); };
/* A post passed over is written down by name, why and when, so a review can see that the desk was not paged
   at two in the morning because nobody was on it, rather than because the router forgot it. The Control
   Tower reads the skips back from here rather than from a second copy kept on the concern. */
const SKIPPED: Readonly<Record<Skip['because'], string>> = { 'off-duty': 'skipped-off-duty', 'no-role': 'skipped-no-role' };
const auditSkips = (ctx: EngineContext, loop: Loop, skipped: readonly Skip[], when: number = nowOf(ctx)) => {
 for (const skip of skipped) audit(ctx, loop, SKIPPED[skip.because], skip.post, at(when));
};
function skipsOf(ctx: EngineContext): Map<string, { post: string; because: string; at: string }[]> {
 const rows = ctx.store.prepare('SELECT loop_ref, at, kind, code FROM loop_audit WHERE kind IN (?, ?) ORDER BY seq').all(SKIPPED['off-duty'], SKIPPED['no-role']) as { loop_ref: string; at: string; kind: string; code: string }[];
 const byLoop = new Map<string, { post: string; because: string; at: string }[]>();
 for (const row of rows) byLoop.set(row.loop_ref, [...(byLoop.get(row.loop_ref) ?? []), { post: row.code, because: row.kind === SKIPPED['off-duty'] ? 'off-duty' : 'no-role', at: row.at }]);
 return byLoop;
}
const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/* The rota in force now, read once for whatever starts now and kept on it. */
const rotaNow = (ctx: EngineContext): KeptRota => rotaOf(settingsIn(coreSettings, ctx.store));

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

const fresh = (ctx: EngineContext, opening: { sourceEngine: string; ownerRole: string; fallbackRole: string | null }, now: number, spanMs: number, rota: KeptRota): Loop => ({
 loopRef: `loop-${randomUUID()}`, sourceEngine: opening.sourceEngine, purpose: ctx.purpose, ownerRole: opening.ownerRole, fallbackRole: opening.fallbackRole,
 holder: { kind: 'owner' }, rota, alerted: null, severity: null,
 openedAt: now, dueBy: now + spanMs, spanMs, acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null,
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
 const loop = fresh(ctx, opening, now, spanMs, rotaNow(ctx));
 put(ctx, loop);
 audit(ctx, loop, 'opened', String(loop.rota.settingsVersion));
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
  const loop: Loop = { ...fresh(ctx, opening, now, spanMs, rotaNow(ctx)), alertRef: `alert-${randomUUID()}`, rung, dedupeKey, recordEntryRef };
  put(ctx, loop);
  audit(ctx, loop, 'raised', String(loop.rota.settingsVersion));
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

/* ── A panic ──────────────────────────────────────────────────────────────────────────────────────── */

/* Every post on duty in the rota in force, at once, at the highest severity, and nobody after them. No
   minute of the rota is read on this path and no setting chooses it: closed-loop.json's panic says why.
   One panic is one concern however often the bus delivers it. */
function heardPanic(event: BusEvent, ctx: EngineContext) {
 const panicRef = text(event.payload['panicRef']);
 if (all(ctx).some(loop => loop.holder.kind === 'every-post' && loop.sourceEngine === event.owner && loop.dedupeKey === panicRef)) return;
 const now = nowOf(ctx);
 const rota = rotaNow(ctx);
 const { alerted, skipped } = everyPostOnDuty(rota, now);
 /* The rota's own rules leave no hour without a post on duty, so nobody to alert cannot happen. If it ever
    did, the panic is opened with nobody left rather than dropped: exhausted at once, first in the Control
    Tower, owned by the first post a role holds. */
 const first = alerted[0] ?? rota.posts.find(post => post.role !== null)!;
 const loop: Loop = {
  ...fresh(ctx, { sourceEngine: event.owner, ownerRole: first.role!, fallbackRole: null }, now, panicSpanMs, rota),
  holder: { kind: 'every-post' }, alerted: alerted.map(post => post.id), severity: highestSeverity, dedupeKey: panicRef,
  exhaustedAt: alerted.length ? null : now
 };
 put(ctx, loop);
 audit(ctx, loop, 'panic-alerted-every-post', String(rota.settingsVersion));
 auditSkips(ctx, loop, skipped);
 publish(ctx, loop, 'loop.opened@1', { loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, dueBy: at(loop.dueBy) });
}

/* ── Acting on a concern ──────────────────────────────────────────────────────────────────────────── */

function acknowledge(request: HandlerRequest, ctx: EngineContext) {
 const loop = find(ctx, request.fields['loopRef']);
 if (!loop) return refuse('no-such-loop');
 if (loop.closedAt !== null) return refuse('loop-closed');
 const engine = callerEngine(ctx);
 if (engine ? engine !== loop.sourceEngine : !holdersOf(loop).includes(ctx.caller.role)) return refuse('not-this-loops-owner');
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
 const now = nowOf(ctx);
 const move = nextHolder(loop, now);
 /* Nobody after its holder who is on duty. The refusal keeps the audit row saying who asked, and nothing else. */
 if (loop.exhaustedAt !== null || !move.holder) {
  ctx.recordRefusal(AUDIT, loop.loopRef, ctx.clock.iso(), 'escalation-refused-nobody-left', ctx.caller.role, reasonCode);
  return refuse('no-fallback-left');
 }
 const moved = movedTo(loop, move, now);
 put(ctx, moved);
 auditSkips(ctx, moved, move.skipped);
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

/* Where a concern is and what happens next, from the rota it kept: never the settings in force now, which
   might say something different about a concern opened before an admin's change. */
function towerItem(loop: Loop, skipped: readonly { post: string; because: string; at: string }[]) {
 const post = postOf(loop);
 const running = loop.acknowledgedAt === null && loop.exhaustedAt === null;
 return {
  ...(skipped.length ? { skipped } : {}),
  loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, stateCode: stateCodeOf(loop), dueBy: at(loop.dueBy),
  holder: loop.holder.kind, rotaRungs: loop.rota.posts.length, rotaVersion: loop.rota.settingsVersion,
  ...(post && loop.holder.kind === 'post' ? { rotaRung: loop.holder.index + 1, postId: post.id } : {}),
  ...(running ? (nextHolder(loop, loop.dueBy).holder ? { movesUpAt: at(loop.dueBy) } : { lastRung: true }) : {}),
  ...(loop.alerted ? { alertedPosts: loop.alerted } : {}),
  ...(loop.exhaustedAt !== null ? { exhaustedAt: at(loop.exhaustedAt) } : {}),
  ...(loop.alertRef ? { alertRef: loop.alertRef } : {})
 };
}

function tower(request: HandlerRequest, ctx: EngineContext) {
 const sourceEngine = request.fields['sourceEngine'] === undefined ? null : text(request.fields['sourceEngine']);
 if (sourceEngine !== null && !engineIds.has(sourceEngine)) return refuse('unknown-source-engine');
 /* A filter narrows what is waiting and never hides a concern that has nobody left. */
 const listed = towerOrder(all(ctx)).filter(loop => sourceEngine === null || loop.sourceEngine === sourceEngine || loop.exhaustedAt !== null);
 const skips = skipsOf(ctx);
 return ok({
  loops: listed.map(loop => towerItem(loop, skips.get(loop.loopRef) ?? [])),
  exhaustedCount: listed.filter(loop => loop.exhaustedAt !== null).length
 });
}

export const engine = defineEngine({
 id: 'core',
 store: { schema },
 routes: {
  'POST /v1/core/loops@1': openLoop,
  'GET /v1/core/loops@2': tower,
  'POST /v1/core/loops/{loopRef}/acknowledge@2': acknowledge,
  'POST /v1/core/loops/{loopRef}/escalate@2': escalate,
  'POST /v1/core/loops/{loopRef}/close@1': close,
  'POST /v1/core/alerts@2': raiseAlert,
  ...settingsRoutes(coreSettings, { read: 'GET /v1/core/settings@1', change: 'POST /v1/core/setting-changes@1' })
 },
 subscriptions: { [PANIC]: heardPanic },
 tick: ctx => {
  const now = nowOf(ctx);
  for (const loop of all(ctx)) {
   let current = loop;
   for (const step of settle(loop, now)) {
    current = step.loop;
    put(ctx, current);
    auditSkips(ctx, current, step.skipped, step.at);
    if (step.kind === 'escalated') {
     audit(ctx, current, 'escalated', reasons.deadlinePassed, at(step.at));
     announceEscalated(ctx, current, reasons.deadlinePassed);
    } else {
     audit(ctx, current, 'exhausted', null, at(step.at));
    }
   }
   if (current.closedAt === null && current.exhaustedAt !== null && current.announcedAt === null) announceExhausted(ctx, current, now);
  }
 }
});
