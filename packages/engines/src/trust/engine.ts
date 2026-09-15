/* Verify in service on the engine runtime: the gates and the badge a reviewer and a patient read, the shift a
 * nurse starts, the code she shows at a door and the patient's answer to it, and a complaint from arriving to
 * decided. Each handler is a thin binding of ./domain to this engine's own store.
 *
 * THE SCORE STAYS HERE. No handler answers with a number about a person. The gates route answers gate states;
 * the badge route and the door check answer a tier id and nothing it was worked out from. The runtime holds every
 * answer to the route's declared shape, so a score cannot leave through a route that does not declare one.
 *
 * NOTHING OF A FACE. No table below has a column for a photograph, a template, an embedding or a capture, and no
 * handler logs anything: a shift start that sends a field beside the start is refused unread, and the face-match
 * door answers not-integrated.
 *
 * THE DOOR CODE IS SIGNED AND NOT KEPT. The digits are random and are answered to the nurse once; what is kept is an
 * HMAC over the visit, the nurse, the expiry and the digits under a key this process holds, with a nonce, so the
 * store cannot give a code back and a code for one visit cannot be replayed at another. The key is made when the
 * engine module loads and is never written down: a code outlives nothing longer than a door visit, and a runtime
 * restarted mid-visit refuses the old code as not matching, which the nurse answers by showing a new one.
 *
 * A MISMATCH TELLS THE DESK TWICE, ON PURPOSE. trust.door.mismatched@1 goes to Safety, Care and Core on the bus, and
 * the incident register is written through POST /v1/safety/incidents@3, which Verify may call because it
 * publishes that event and Safety hears it. The report's words are the contract's sentence and nothing a patient
 * typed. The version is proposed, so on this runtime the contract mock answers it; if it does not answer with a
 * report, the handler fails and nothing is kept, rather than telling a patient the desk has been told when it
 * has not.
 *
 * WHO. Every party is the caller the runtime identified. In development that reference arrives in a header and is
 * believed (apis.json, engineRuntime): it is not proof of identity, and a production door has to establish it.
 * Nobody starts a shift, shows a code, complains or reads notices as somebody else, and a reviewer is refused a
 * complaint about themselves.
 *
 * Nothing here is a real service: no face is matched, no code reaches a door and no desk or reviewer is told.
 */
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { defineEngine, ok, refuse, type EngineContext, type EventKey } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, historyOf, settingsRoutes } from '../settings/routes.ts';
import { complaintQueue, decideComplaint, noticesFor, openComplaint, receiveComplaint, type Complaint } from './domain/complaints.ts';
import { dayOf, doorDigits, instant, verifyInService, type EmittedEvent } from './domain/contract.ts';
import { answerAtTheDoor, issueCode, tryCode, type DoorCheck, type HeldCode } from './domain/door.ts';
import { badgeOf, standingOf } from './domain/register.ts';
import { trustInForce, trustSettings } from './domain/settings.ts';
import { startShift, type ShiftStart } from './domain/shift-starts.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS trust_shift_starts (',
 ' shift_start_ref TEXT PRIMARY KEY,',
 ' party_ref TEXT NOT NULL,',
 ' match_outcome TEXT NOT NULL,',
 ' online INTEGER NOT NULL,',
 ' dispatch_rule TEXT NOT NULL,',
 ' settings_version INTEGER NOT NULL,',
 ' started_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS trust_door_checks (',
 ' appointment_ref TEXT PRIMARY KEY,',
 ' doc TEXT NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS trust_complaints (',
 ' complaint_ref TEXT PRIMARY KEY,',
 ' party_ref TEXT NOT NULL,',
 ' received_at INTEGER NOT NULL,',
 ' doc TEXT NOT NULL',
 ');',
 SETTINGS_SCHEMA
].join('\n');

const INCIDENTS = 'POST /v1/safety/incidents@3';
const KEY = randomBytes(32);
const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/* ── The store ────────────────────────────────────────────────────────────────────────────────────── */

type ShiftRow = { shift_start_ref: string; party_ref: string; match_outcome: string; online: number; dispatch_rule: string; settings_version: number; started_at: number };
const shiftFrom = (row: ShiftRow): ShiftStart => ({
 shiftStartRef: row.shift_start_ref, partyRef: row.party_ref, matchOutcome: row.match_outcome as ShiftStart['matchOutcome'],
 online: row.online === 1, dispatchRule: row.dispatch_rule as ShiftStart['dispatchRule'], settingsVersion: row.settings_version, startedAt: row.started_at
});
const checkOf = (ctx: EngineContext, appointmentRef: string): DoorCheck | undefined => {
 const row = ctx.store.prepare('SELECT doc FROM trust_door_checks WHERE appointment_ref = ?').get(appointmentRef) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as DoorCheck : undefined;
};
const putCheck = (ctx: EngineContext, check: DoorCheck) => {
 ctx.store.prepare('INSERT INTO trust_door_checks (appointment_ref, doc) VALUES (?, ?) ON CONFLICT(appointment_ref) DO UPDATE SET doc = excluded.doc').run(check.appointmentRef, JSON.stringify(check));
};
const complaintOf = (ctx: EngineContext, complaintRef: unknown): Complaint | undefined => {
 const row = ctx.store.prepare('SELECT doc FROM trust_complaints WHERE complaint_ref = ?').get(String(complaintRef)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as Complaint : undefined;
};
const allComplaints = (ctx: EngineContext): Complaint[] =>
 (ctx.store.prepare('SELECT doc FROM trust_complaints ORDER BY received_at').all() as { doc: string }[]).map(row => JSON.parse(row.doc) as Complaint);
const putComplaint = (ctx: EngineContext, c: Complaint) => {
 ctx.store.prepare('INSERT INTO trust_complaints (complaint_ref, party_ref, received_at, doc) VALUES (?, ?, ?, ?) ON CONFLICT(complaint_ref) DO UPDATE SET doc = excluded.doc').run(c.complaintRef, c.partyRef, c.receivedAt, JSON.stringify(c));
};
const publishAll = (ctx: EngineContext, emits: readonly EmittedEvent[], subjectRef: string) => {
 for (const event of emits) ctx.publish(`${event.type}@${event.version}` as EventKey, event.payload, { subjectRef });
};

/* ── The door code ────────────────────────────────────────────────────────────────────────────────── */

const signed = (code: Pick<HeldCode, 'partyRef' | 'expiresAt' | 'nonce'>, appointmentRef: string, digits: string) =>
 createHmac('sha256', KEY).update([code.nonce, appointmentRef, code.partyRef, String(code.expiresAt), digits].join(':')).digest('hex');
const sameDigest = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/* The desk is told through the incident register in the contract's own words. A report that is not recorded is a
   fault, so the mismatch it belongs to is rolled back and the patient is not told the desk knows. */
function raiseIncident(ctx: EngineContext) {
 const { kind, whatHappened, informationReached } = verifyInService.door.incident;
 const answer = ctx.call(INCIDENTS, { kind, whatHappened, informationReached }, { purpose: 'audit' });
 if (answer.status !== 200) throw new Error(`Verify could not raise the door mismatch through ${INCIDENTS}: it answered ${answer.status}.`);
}

export const engine = defineEngine({
 id: 'trust',
 store: { schema },
 routes: {
  /* Worked out on read from the register's checks and today; nothing below keeps a gate. */
  'GET /v1/trust/parties/{partyId}/gates@1': request => {
   const standing = standingOf(text(request.fields.partyId));
   if (!standing) return refuse('no-such-party');
   return ok({ gates: standing.gates.map(g => ({ gate: g.gate, order: g.order, name: g.name, state: g.state, hardStop: g.hardStop })), currentGate: standing.currentGate });
  },

  /* The outward view. Somebody unknown and somebody without a current verification get the same answer, so the
     route says nothing about who is on the register. */
  'GET /v1/trust/parties/{partyId}/badge@1': request => {
   const badge = badgeOf(standingOf(text(request.fields.partyId)));
   if (!badge) return refuse('no-current-verification');
   return ok({ badgeTier: badge.badgeTier, verified: badge.verified });
  },

  'POST /v1/trust/shift-starts@2': (request, ctx) => {
   const now = nowOf(ctx);
   const partyRef = ctx.caller.ref;
   const started = startShift({ shiftStartRef: 'shift-' + randomUUID(), partyRef, undeclared: request.undeclared },
    partyRef ? standingOf(partyRef) : null, trustInForce(historyOf(ctx.store)), now);
   if (!started.ok) return refuse(started.refusal.id);
   const s = started.value;
   ctx.store.prepare('INSERT INTO trust_shift_starts (shift_start_ref, party_ref, match_outcome, online, dispatch_rule, settings_version, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(s.shiftStartRef, s.partyRef, s.matchOutcome, s.online ? 1 : 0, s.dispatchRule, s.settingsVersion, s.startedAt);
   publishAll(ctx, started.emits, s.partyRef);
   return ok({ shiftStartRef: s.shiftStartRef, matchOutcome: s.matchOutcome, online: s.online, dispatchRule: s.dispatchRule, settingsVersion: s.settingsVersion, startedAt: instant(s.startedAt) });
  },

  /* Today's board, read whole: a filter by suburb or by who is visiting whom is a way to look somebody up. */
  'GET /v1/trust/shift-starts@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('shift-start-board-takes-no-filter');
   const today = dayOf(nowOf(ctx));
   const items = (ctx.store.prepare('SELECT shift_start_ref, party_ref, match_outcome, online, dispatch_rule, settings_version, started_at FROM trust_shift_starts ORDER BY started_at DESC, rowid DESC').all() as ShiftRow[])
    .map(shiftFrom).filter(s => dayOf(s.startedAt) === today)
    .map(s => ({ shiftStartRef: s.shiftStartRef, partyRef: s.partyRef, matchOutcome: s.matchOutcome, online: s.online, dispatchRule: s.dispatchRule, settingsVersion: s.settingsVersion, startedAt: instant(s.startedAt) }));
   return ok({ items });
  },

  'POST /v1/trust/door-codes@1': (request, ctx) => {
   const now = nowOf(ctx);
   const appointmentRef = text(request.fields.appointmentRef);
   const partyRef = ctx.caller.ref;
   const settings = trustInForce(historyOf(ctx.store));
   const digits = String(randomInt(0, 10 ** doorDigits)).padStart(doorDigits, '0');
   const nonce = randomUUID();
   const expiresAt = now + settings.doorCodeMinutes * 60_000;
   const digest = partyRef ? signed({ partyRef, expiresAt, nonce }, appointmentRef, digits) : '';
   const issued = issueCode(checkOf(ctx, appointmentRef), { appointmentRef, partyRef, digest, nonce }, partyRef ? standingOf(partyRef) : null, settings, now);
   if (!issued.ok) return refuse(issued.refusal.id);
   putCheck(ctx, issued.value);
   const code = issued.value.code!;
   return ok({ doorCode: digits, expiresAt: instant(code.expiresAt), attemptsAllowed: code.attemptsAllowed, settingsVersion: code.settingsVersion });
  },

  'POST /v1/trust/door-verifications@2': (request, ctx) => {
   const now = nowOf(ctx);
   const appointmentRef = text(request.fields.appointmentRef);
   const check = checkOf(ctx, appointmentRef);
   const typed = text(request.fields.doorCode).replace(/\s+/g, '');
   const matches = Boolean(check?.code) && sameDigest(signed(check!.code!, appointmentRef, typed), check!.code!.digest);
   const tried = tryCode(check, matches, check?.code ? standingOf(check.code.partyRef) : null, now);
   if (!tried.ok) return refuse(tried.refusal.id);
   putCheck(ctx, tried.value.check);
   publishAll(ctx, tried.emits, tried.value.check.code?.partyRef ?? appointmentRef);
   if (tried.emits.some(e => e.type === 'trust.door.mismatched')) raiseIncident(ctx);
   const { codeMatched, attemptsLeft, nurseName, badgeTier, incidentRaised } = tried.value;
   return ok({ codeMatched, attemptsLeft, incidentRaised, ...(nurseName ? { nurseName } : {}), ...(badgeTier ? { badgeTier } : {}) });
  },

  'POST /v1/trust/door-verifications/{appointmentRef}/answer@1': (request, ctx) => {
   const appointmentRef = text(request.fields.appointmentRef);
   const answered = answerAtTheDoor(checkOf(ctx, appointmentRef), { appointmentRef, answer: request.fields.answer }, nowOf(ctx));
   if (!answered.ok) return refuse(answered.refusal.id);
   putCheck(ctx, answered.value.check);
   publishAll(ctx, answered.emits, answered.value.check.code?.partyRef ?? appointmentRef);
   if (answered.emits.some(e => e.type === 'trust.door.mismatched')) raiseIncident(ctx);
   return ok({ verified: answered.value.verified, incidentRaised: answered.value.incidentRaised });
  },

  'POST /v1/trust/complaints@2': (request, ctx) => {
   const partyRef = text(request.fields.partyRef);
   const received = receiveComplaint({
    complaintRef: 'complaint-' + randomUUID(), partyRef, appointmentRef: text(request.fields.appointmentRef),
    categoryCode: request.fields.categoryCode, whatHappened: request.fields.whatHappened, undeclared: request.undeclared,
    complainantRole: ctx.caller.role, complainantRef: ctx.caller.ref
   }, standingOf(partyRef), trustInForce(historyOf(ctx.store)), nowOf(ctx));
   if (!received.ok) return refuse(received.refusal.id);
   const c = received.value;
   putComplaint(ctx, c);
   publishAll(ctx, received.emits, c.partyRef);
   return ok({ complaintRef: c.complaintRef, reviewBy: instant(c.reviewBy), reviewWithinHours: c.reviewWithinHours, settingsVersion: c.settingsVersion });
  },

  /* The queue, oldest first, carrying the header and nothing a complainant wrote. */
  'GET /v1/trust/complaints@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('complaint-queue-takes-no-filter');
   return ok({ items: complaintQueue(allComplaints(ctx), nowOf(ctx)) });
  },

  'GET /v1/trust/complaints/{complaintRef}@1': (request, ctx) => {
   if (request.undeclared.length) return refuse('complaint-read-takes-nothing-else');
   const opened = openComplaint(complaintOf(ctx, request.fields.complaintRef), ctx.caller.ref);
   if (!opened.ok) return refuse(opened.refusal.id);
   const c = opened.value;
   return ok({
    complaintRef: c.complaintRef, partyRef: c.partyRef, appointmentRef: c.appointmentRef, categoryCode: c.categoryCode, whatHappened: c.whatHappened,
    state: c.decision ? 'decided' : 'awaiting-review', reviewBy: instant(c.reviewBy), ...(c.decision ? { outcomeCode: c.decision.outcomeCode } : {})
   });
  },

  /* A decision publishes nothing and touches no score: suspension is its own decision on the register. */
  'POST /v1/trust/complaints/{complaintRef}/decide@1': (request, ctx) => {
   const decided = decideComplaint(complaintOf(ctx, request.fields.complaintRef), {
    outcomeCode: request.fields.outcomeCode, reason: request.fields.reason, byRef: ctx.caller.ref, undeclared: request.undeclared
   }, nowOf(ctx));
   if (!decided.ok) return refuse(decided.refusal.id);
   putComplaint(ctx, decided.value);
   return ok({ outcomeCode: decided.value.decision!.outcomeCode, decidedAt: instant(decided.value.decision!.at) });
  },

  'GET /v1/trust/complaint-notices@1': (_request, ctx) => {
   if (!ctx.caller.ref) return refuse('complaint-notices-need-who-you-are');
   return ok({ items: noticesFor(allComplaints(ctx), ctx.caller.ref) });
  },

  ...settingsRoutes(trustSettings, { read: 'GET /v1/trust/settings@1', change: 'POST /v1/trust/setting-changes@1' })
 },
 subscriptions: {}
});
