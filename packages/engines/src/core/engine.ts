/**
 * ThusoIQ Core on the engine runtime: the closed loop, the alert router, the escalation rota and the Control
 * Tower's read.
 *
 * ── What is bound ────────────────────────────────────────────────────────────────────────────────────
 *
 * Thirteen routes: opening a concern, acknowledging, escalating and closing it, raising an alert at version
 * two, the Control Tower's list of open concerns, Core's settings read and change, and — Wave 6 — the bus's
 * front door, the protocol registry's read, its ratify route (which never ratifies, see below), a role ×
 * scope × purpose check and an audit export. Alerts at version one stay withdrawn: they carry no fallback. The list is at version two:
 * version one could not say where a concern is on the rota. The acknowledgement and the escalation are at
 * version three and the close at version two, and every earlier version of each is withdrawn: the first
 * acknowledgement did not admit the operator who holds the desk's post, the first escalation refused in a
 * sentence naming a rota that did not exist, and the second of each, like the first close, did not admit the
 * Head of Operations, who holds the last post now that the role is on the vetting register. The first close
 * did not admit the Control Tower operator either, and took no outcome but a reference; the second takes one
 * of the outcomes closed-loop.json lists.
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
 * ── A patient's SOS ──────────────────────────────────────────────────────────────────────────────────
 *
 * Core hears sos.raised@2 and opens one concern for the SOS, owned by the desk, falling back to a nurse and then
 * walking the rota in force, whatever door it went to; it hears sos.stood_down@1 and closes that concern with the
 * outcome closed-loop.json maps the reason to, through the close route's own rule. Nothing else: Core reads no plan,
 * so who pressed changes neither the owner, the deadline nor the Control Tower's order.
 *
 * ── A Sentinel tier and a safeguarding concern ─────────────────────────────────────────────────────────
 *
 * Core hears sentinel.rung_raised@1 and opens one alert for a tier raised at or above the rung closed-loop.json
 * sentinel.opensAtRung names, owned by a doctor with a nurse behind them and given the ladder's time for the rung raised;
 * below that rung it opens nothing. It hears safeguarding.reported@2 and opens one concern owned by the desk, falling back
 * to the Head of Operations; closing it never closes the report, which is Safety's. Core stays a declared subscriber of
 * reading.ingested@1 and binds no handler for it: the frozen POST /v1/core/events@1 names it as the event that justifies
 * Devices calling Core, so removing Core would break that route, and Core never carries clinical content
 * (packages/catalog/apis.json clinicalContent.alwaysForEngines). A reading reaches Core only as a tier a clinician raised
 * on one, and the bus withholds reading.ingested@1 from Core because nothing here registers for it.
 *
 * ── What Core does not read ──────────────────────────────────────────────────────────────────────────
 *
 * No Safety timing. A panic's window and an overdue check-in's grace are Safety's settings, and a Safety
 * concern arrives here with its deadline already worked out from them.
 *
 * Nothing here is a real service: no alert reaches a person, nobody is paged and nobody is on call.
 */
import { randomUUID } from 'node:crypto';
import { BusRefused, capabilitiesOf, defineEngine, instant, ok, refuse, roleServesPurpose, scopeMatrixRoles, type BusEvent, type EngineContext, type EventKey, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { DAY_MS } from '../settings/shape.ts';
import { EXHAUSTED, PANIC, PANIC_RESOLVED, RESULT_ACKNOWLEDGED, resultAlertsFrom, resultClosesAs, engineIds, highestSeverity, outcomes, ownerRoles, panicOutcomes, panicSpanMs, reasons, spanForRung, SOS, SOS_STOOD_DOWN, sosFallbackRole, sosOutcomes, sosOwnerRole, sosSpanMs } from './domain/contract.ts';
import { DISCHARGE, dischargeFallbackRole, dischargeOwnerRole, dischargeSpanMs } from './domain/contract.ts';
import { SAFEGUARDING, SENTINEL, safeguardingFallbackRole, safeguardingOwnerRole, safeguardingSpanMs, sentinelFallbackRole, sentinelOpensAtRung, sentinelOwnerRole } from './domain/contract.ts';
import { nobodyHoldsMedicalDirector, protocolVersions } from './domain/structural.ts';
import { closeRefusal, everyPostOnDuty, holdersOf, movedTo, nextHolder, postOf, settle, stateCodeOf, towerOrder, type KeptRota, type Loop, type Skip } from './domain/loops.ts';
import { auditExportMaxDaysOf, coreSettings, rotaOf } from './domain/settings.ts';

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
 closedAt: null, outcomeRef: null, outcomeCode: null, closedByRole: null, alertRef: null, rung: null, dedupeKey: null, recordEntryRef: null
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

/* ── A panic resolved ─────────────────────────────────────────────────────────────────────────────── */

/* A person at Safety's desk resolved the panic, so the concern Core opened for it stands down: closed with the
   closed loop's outcome that closed-loop.json panicResolved maps the panic's outcome to, pointing at the panic,
   where Safety keeps what happened, by the role that resolved it. It closes through closeRefusal, the rule the
   close route asks, so a stand-down can never close what a person at the Control Tower could not. A concern
   somebody already closed is left as it is. An outcome the map does not name is not guessed at: the concern stays
   open for a person to close, and the audit says why it was not stood down. Only the concern that came from the
   engine that resolved this panic is touched; nothing else about it moves, and no rota is read. */
function heardPanicResolved(event: BusEvent, ctx: EngineContext) {
 const panicRef = text(event.payload['panicRef']);
 const loop = all(ctx).find(open => open.holder.kind === 'every-post' && open.sourceEngine === event.owner && open.dedupeKey === panicRef);
 if (!loop) return;
 const outcomeCode = panicOutcomes.get(text(event.payload['outcomeCode'])) ?? '';
 const refused = closeRefusal(loop, outcomeCode, outcomes);
 if (refused) {
  if (loop.closedAt === null) audit(ctx, loop, 'panic-resolved-not-stood-down', refused);
  return;
 }
 const closed: Loop = { ...loop, closedAt: nowOf(ctx), outcomeRef: panicRef, outcomeCode, closedByRole: event.actorRole };
 put(ctx, closed);
 audit(ctx, closed, 'closed', outcomeCode);
 publish(ctx, closed, 'loop.closed@1', { loopRef: closed.loopRef, outcomeRef: panicRef, closedByRole: event.actorRole });
}

/* ── A lab result acknowledged ────────────────────────────────────────────────────────────────────── */

/* The clinician who ordered a test acknowledged its result, so the alert Medicines raised when the result arrived
   stands down: closed with the outcome closed-loop.json resultAcknowledged names, pointing at the result's entry,
   by the role that acknowledged it, through the same closeRefusal the close route asks. Only an open alert raised
   by the engine that contract names under the result's entry as its key is touched. An alert nobody acknowledges
   is never closed here: it walks the rota like any other. */
function heardResultAcknowledged(event: BusEvent, ctx: EngineContext) {
 const resultRef = text(event.payload['resultRef']);
 const loop = all(ctx).find(open => open.alertRef !== null && open.closedAt === null && open.sourceEngine === resultAlertsFrom && open.dedupeKey === resultRef);
 if (!loop) return;
 const refused = closeRefusal(loop, resultClosesAs, outcomes);
 if (refused) {
  audit(ctx, loop, 'result-acknowledged-not-stood-down', refused);
  return;
 }
 const closed: Loop = { ...loop, closedAt: nowOf(ctx), outcomeRef: resultRef, outcomeCode: resultClosesAs, closedByRole: event.actorRole };
 put(ctx, closed);
 audit(ctx, closed, 'closed', resultClosesAs);
 publish(ctx, closed, 'alert.closed@1', { alertRef: closed.alertRef, outcomeRef: resultRef, closedByRole: event.actorRole });
}

/* ── A patient's SOS ─────────────────────────────────────────────────────────────────────────────────── */

/* The concern Core holds for an SOS: not an alert, not a panic, from the engine that published it, keyed by the SOS. */
const sosConcernOf = (ctx: EngineContext, owner: string, sosRef: string) =>
 all(ctx).find(loop => loop.alertRef === null && loop.holder.kind !== 'every-post' && loop.sourceEngine === owner && loop.dedupeKey === sosRef);

/* One SOS is one concern however often the bus delivers it, opened for every door, because the desk needs to know
   somebody pressed even when the door is emergency services and MyThuso sends nobody. The owner, the fallback and the
   time are closed-loop.json's proposals, and the rota is the one in force now, kept on the concern. */
function heardSos(event: BusEvent, ctx: EngineContext) {
 const sosRef = text(event.payload['sosRef']);
 if (!sosRef || sosConcernOf(ctx, event.owner, sosRef)) return;
 const loop: Loop = { ...fresh(ctx, { sourceEngine: event.owner, ownerRole: sosOwnerRole, fallbackRole: sosFallbackRole }, nowOf(ctx), sosSpanMs, rotaNow(ctx)), dedupeKey: sosRef };
 put(ctx, loop);
 audit(ctx, loop, 'sos-opened', String(loop.rota.settingsVersion));
 publish(ctx, loop, 'loop.opened@1', { loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, dueBy: at(loop.dueBy) });
}

/* The person who pressed it stood it down, so the concern closes with the outcome the reason maps to, pointing at the
   SOS, by the role that stood it down — through closeRefusal, so a stand-down closes nothing the Control Tower could
   not. A reason the map does not name is not guessed at: the concern stays open, and the audit says why. */
function heardSosStoodDown(event: BusEvent, ctx: EngineContext) {
 const sosRef = text(event.payload['sosRef']);
 const loop = sosConcernOf(ctx, event.owner, sosRef);
 if (!loop) return;
 const outcomeCode = sosOutcomes.get(text(event.payload['reasonCode'])) ?? '';
 const refused = closeRefusal(loop, outcomeCode, outcomes);
 if (refused) {
  if (loop.closedAt === null) audit(ctx, loop, 'sos-stood-down-not-closed', refused);
  return;
 }
 const closed: Loop = { ...loop, closedAt: nowOf(ctx), outcomeRef: sosRef, outcomeCode, closedByRole: event.actorRole };
 put(ctx, closed);
 audit(ctx, closed, 'closed', outcomeCode);
 publish(ctx, closed, 'loop.closed@1', { loopRef: closed.loopRef, outcomeRef: sosRef, closedByRole: event.actorRole });
}

/* ── A hospital discharge (Wave 5) ────────────────────────────────────────────────────────────────────── */

/* One discharge is one follow-up concern however often the bus delivers it, keyed by its encounter and pointing at it,
   so the nurse who takes it on reads the discharge in the record under her own grant rather than from the concern. A
   person closes it with an outcome through the close route; nothing on the bus closes it for them, because a follow-up
   that closed itself would be one nobody made. */
function heardDischarge(event: BusEvent, ctx: EngineContext) {
 const encounterRef = text(event.payload['encounterRef']);
 if (!encounterRef || all(ctx).some(loop => loop.alertRef === null && loop.sourceEngine === event.owner && loop.dedupeKey === encounterRef)) return;
 const loop: Loop = { ...fresh(ctx, { sourceEngine: event.owner, ownerRole: dischargeOwnerRole, fallbackRole: dischargeFallbackRole }, nowOf(ctx), dischargeSpanMs, rotaNow(ctx)), dedupeKey: encounterRef, recordEntryRef: encounterRef };
 put(ctx, loop);
 audit(ctx, loop, 'discharge-opened', String(loop.rota.settingsVersion));
 publish(ctx, loop, 'loop.opened@1', { loopRef: loop.loopRef, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, dueBy: at(loop.dueBy) });
}

/* ── A Sentinel tier ────────────────────────────────────────────────────────────────────────────────── */

/* A tier a named clinician raised at Safety. Below the rung closed-loop.json names, Core opens nothing: a tier one is
   recorded where Sentinel keeps it and a tier two is the nurse's own queue. From that rung it is one alert for the concern
   however often the bus delivers it, owned by the clinician closed-loop.json names with its fallback behind them, with
   the ladder's time for the rung raised and the record entry it points at — the shape an alert raised on
   POST /v1/core/alerts@2 has, so acknowledging, escalating and closing it are the same acts. Nothing about the reading
   reaches Core but where it is in the record, and nothing Sentinel sends chooses the owner or the time. */
function heardSentinelRung(event: BusEvent, ctx: EngineContext) {
 const rung = event.payload['rung'];
 const concernRef = text(event.payload['concernRef']);
 if (typeof rung !== 'number' || rung < sentinelOpensAtRung || !concernRef) return;
 const spanMs = spanForRung(rung);
 if (spanMs === undefined) throw new Error(`Core heard ${SENTINEL} at a rung the ladder does not hold, and will not guess how long a clinician has to take it on.`);
 if (all(ctx).some(loop => loop.alertRef !== null && loop.sourceEngine === event.owner && loop.dedupeKey === concernRef)) return;
 const recordEntryRef = text(event.payload['recordEntryRef']) || null;
 const loop: Loop = {
  ...fresh(ctx, { sourceEngine: event.owner, ownerRole: sentinelOwnerRole, fallbackRole: sentinelFallbackRole }, nowOf(ctx), spanMs, rotaNow(ctx)),
  alertRef: `alert-${randomUUID()}`, rung, dedupeKey: concernRef, recordEntryRef
 };
 put(ctx, loop);
 audit(ctx, loop, 'sentinel-raised', String(loop.rota.settingsVersion));
 publish(ctx, loop, 'alert.raised@1', {
  alertRef: loop.alertRef, tier: rung, sourceEngine: loop.sourceEngine, ownerRole: loop.ownerRole, acknowledgeBy: at(loop.dueBy),
  ...(recordEntryRef ? { recordEntryRef } : {})
 });
}

/* ── A safeguarding concern ─────────────────────────────────────────────────────────────────────────── */

/* A safeguarding concern recorded at Safety. One report is one concern however often the bus delivers it, owned by the
   role closed-loop.json names and falling back to its fallback, with that rung's time. The event carries the report and
   nothing else, so Core holds no patient, no kind of concern and no reporter. Closing this concern says the desk took the
   report on; the report itself is Safety's and stays open for a safeguarding officer. */
function heardSafeguarding(event: BusEvent, ctx: EngineContext) {
 const reportRef = text(event.payload['reportRef']);
 if (!reportRef || all(ctx).some(loop => loop.alertRef === null && loop.holder.kind !== 'every-post' && loop.sourceEngine === event.owner && loop.dedupeKey === reportRef)) return;
 const loop: Loop = { ...fresh(ctx, { sourceEngine: event.owner, ownerRole: safeguardingOwnerRole, fallbackRole: safeguardingFallbackRole }, nowOf(ctx), safeguardingSpanMs, rotaNow(ctx)), dedupeKey: reportRef };
 put(ctx, loop);
 audit(ctx, loop, 'safeguarding-opened', String(loop.rota.settingsVersion));
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
 const outcomeCode = text(request.fields['outcomeCode']);
 const refused = closeRefusal(loop, outcomeCode, outcomes);
 if (refused) return refuse(refused);
 /* Where the outcome is recorded. A desk closing a concern it answered by phone keeps the outcome nowhere
    but here, so the concern is where it is recorded: the code in loop_audit beside who closed it. The events
    were frozen carrying a reference, and the concern's own is the honest one to give them. */
 const outcomeRef = text(request.fields['outcomeRef']) || loop.loopRef;
 const closed: Loop = { ...loop, closedAt: nowOf(ctx), outcomeRef, outcomeCode, closedByRole: ctx.caller.role };
 put(ctx, closed);
 audit(ctx, closed, 'closed', outcomeCode);
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

/* ── The bus's front door (Wave 6) ────────────────────────────────────────────────────────────────────
 *
 * Every engine already publishes its own events straight onto the bus, inside its own route handlers,
 * through the same publish() this file calls throughout (see announceEscalated, heardSos and the rest):
 * that is how an event reaches a subscriber today, and this route changes none of it. What POST
 * /v1/core/events@1 adds is a literal, callable front door onto the identical mechanism, for a caller
 * who is not the engine bound to a handler — asked for by the frozen contract, and honest to say is
 * largely redundant with how the runtime already carries events between engines. No engine calls it in
 * this codebase today; engine.test.ts calls it directly to prove the five refusals and a successful
 * publish fire exactly as packages/catalog/apis/core.json declares.
 *
 * The request carries one object field, "event" — "the envelope and payload, in the frozen shape" — so
 * a caller sends both together: subjectRef (and, optionally, actorRole, purposeOfUse, causationId and
 * protocolVersion) are the envelope publish() itself takes as options, and everything else in the
 * object is the event's own declared payload. Splitting them here is Core's own reading of a route
 * still on packages/catalog/apis.json's prose-only list (its inside was never declared as fields), not
 * a shape anybody has frozen a second way. */
const ENVELOPE_KEYS = new Set(['subjectRef', 'actorRole', 'purposeOfUse', 'causationId', 'protocolVersion']);
function publishEvent(request: HandlerRequest, ctx: EngineContext) {
 const publisherEngine = callerEngine(ctx);
 if (!publisherEngine) return refuse('not-the-owner');
 if (!ctx.publishFor) throw new Error('Core is bound without publishFor, which the runtime always gives it.');
 const key = `${text(request.fields['eventType'])}@${request.fields['eventVersion']}` as EventKey;
 const envelope = (request.fields['event'] as Record<string, unknown> | undefined) ?? {};
 const payload: Record<string, unknown> = {};
 for (const [field, value] of Object.entries(envelope)) if (!ENVELOPE_KEYS.has(field)) payload[field] = value;
 try {
  const published = ctx.publishFor(publisherEngine, key, payload, {
   subjectRef: envelope['subjectRef'] as string, actorRole: envelope['actorRole'] as string | undefined,
   purposeOfUse: envelope['purposeOfUse'] as string | undefined, causationId: envelope['causationId'] as string | undefined,
   protocolVersion: envelope['protocolVersion'] as string | undefined
  });
  return ok({ eventId: published.eventId, accepted: true });
 } catch (error) {
  if (error instanceof BusRefused) return refuse(error.refusal);
  throw error;
 }
}

/* ── The protocol registry (Wave 6) ───────────────────────────────────────────────────────────────────
 *
 * One row of packages/catalog/protocols.json, read by its id@version. Every protocol in the file is a
 * draft with no content, so every honest read today answers exactly that — never a placeholder value
 * standing in for a threshold or a dose nobody ratified. */
function readProtocol(request: HandlerRequest) {
 const versionId = text(request.fields['protocolVersionId']);
 const sep = versionId.lastIndexOf('@');
 const version = sep > 0 ? Number(versionId.slice(sep + 1)) : NaN;
 const id = sep > 0 ? versionId.slice(0, sep) : '';
 const found = protocolVersions.find(p => p.id === id && p.version === version);
 if (!found) return refuse('unknown-version');
 return ok({ protocolVersionId: `${found.id}@${found.version}`, name: found.name, statusCode: found.status });
}

/* ── Ratifying a protocol (Wave 6) ────────────────────────────────────────────────────────────────────
 *
 * This route's only caller is medical-director, and domain/structural.ts's nobodyHoldsMedicalDirector
 * asserts, at import time, that packages/catalog/vetting.json clears nobody into it: no governance
 * board, no Medical Director, no protocol with content to ratify. A ratification borrows a named
 * role's authority, so with nobody holding it there is nobody whose authority a ratification here
 * could honestly be, and every attempt is refused with the registry's own sentence for that —
 * unsigned-ratification — rather than a stub that throws or a role invented to let one through. If
 * the assertion above ever fails, this module fails to load before this line could run. */
function ratifyProtocol() {
 void nobodyHoldsMedicalDirector;
 return refuse('unsigned-ratification');
}

/* ── A role × scope × purpose check (Wave 6) ─────────────────────────────────────────────────────────
 *
 * Answered from two things already declared, never a third table: whether roleId may act for
 * purposeOfUse at all is asked of every route on every engine (runtime/permission-matrix.ts's
 * roleServesPurpose, over packages/catalog/apis/*.json); whether it holds every capability scope names is asked of
 * packages/catalog/vetting.json's own grants. The only refusal this route declares is unknown-role, so
 * roleId is checked against every role apis.json's scope matrix could ever admit; a false answer for
 * scope or purpose is not a refusal of the call, it is what the call is for, and the shared refusal id
 * it would have been is named back for the caller's own branching without inventing a new one. */
function permissionCheck(request: HandlerRequest) {
 const roleId = text(request.fields['roleId']);
 if (!scopeMatrixRoles.has(roleId)) return refuse('unknown-role');
 const scope = (request.fields['scope'] as readonly string[] | undefined) ?? [];
 const purposeOfUse = text(request.fields['purposeOfUse']);
 if (!roleServesPurpose(roleId, purposeOfUse)) return ok({ allowed: false, refusalId: 'purpose-not-allowed' });
 const held = capabilitiesOf(roleId);
 if (!scope.every(capability => held.has(capability))) return ok({ allowed: false, refusalId: 'caller-not-allowed' });
 return ok({ allowed: true });
}

/* ── An audit export (Wave 6) ────────────────────────────────────────────────────────────────────────
 *
 * The bound a range is refused against is a setting (domain/settings.ts's auditExportMaxDaysOf), never
 * a number typed into the route, following the founder's instruction that an open question like "how
 * wide is too wide" becomes an admin setting with a proposed default. What is exported is the runtime's
 * own hash-chained bus trail (../runtime/trail.ts) — Core's ctx.trail, read-only, the same append-only
 * log apps/api/src/protection/audit.ts's chain is for the identity service — never a second copy of it
 * kept here. DAY_MS is the settings code's own unit, imported rather than typed a second time; nothing
 * under packages/engines/src/core may type a number bigger than one that is not 60_000. */
function auditExports(request: HandlerRequest, ctx: EngineContext) {
 if (!ctx.trail) throw new Error('Core is bound without a trail, which the runtime always gives it.');
 const from = text(request.fields['from']);
 const to = text(request.fields['to']);
 /* Each iso-date parses as that day's UTC midnight; the day's own last moment is the next day's less one
    millisecond, so the range is inclusive of "to" without a clock-face string typed into this file. */
 const fromMs = new Date(from).getTime();
 const toEndMs = new Date(to).getTime() + DAY_MS - 1;
 const spanDays = Math.floor((toEndMs - fromMs) / DAY_MS) + 1;
 const bound = auditExportMaxDaysOf(settingsIn(coreSettings, ctx.store));
 if (!(spanDays >= 1) || spanDays > bound) return refuse('range-too-wide');
 const entries = ctx.trail.entries(instant(new Date(fromMs)), instant(new Date(toEndMs)));
 return ok({ auditExportRef: `audit-export-${randomUUID()}`, entryCount: entries.length, chainIntact: ctx.trail.verify() });
}

export const engine = defineEngine({
 id: 'core',
 store: { schema },
 routes: {
  'POST /v1/core/loops@1': openLoop,
  'GET /v1/core/loops@2': tower,
  'POST /v1/core/loops/{loopRef}/acknowledge@3': acknowledge,
  'POST /v1/core/loops/{loopRef}/escalate@3': escalate,
  'POST /v1/core/loops/{loopRef}/close@2': close,
  'POST /v1/core/alerts@2': raiseAlert,
  'POST /v1/core/events@1': publishEvent,
  'GET /v1/core/protocols/{protocolVersionId}@1': readProtocol,
  'POST /v1/core/protocols/{protocolId}/ratify@1': ratifyProtocol,
  'POST /v1/core/permission-checks@1': permissionCheck,
  'GET /v1/core/audit-exports@1': auditExports,
  ...settingsRoutes(coreSettings, { read: 'GET /v1/core/settings@1', change: 'POST /v1/core/setting-changes@1' })
 },
 subscriptions: { [PANIC]: heardPanic, [PANIC_RESOLVED]: heardPanicResolved, [RESULT_ACKNOWLEDGED]: heardResultAcknowledged, [SOS]: heardSos, [SOS_STOOD_DOWN]: heardSosStoodDown, [DISCHARGE]: heardDischarge, [SENTINEL]: heardSentinelRung, [SAFEGUARDING]: heardSafeguarding },
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
