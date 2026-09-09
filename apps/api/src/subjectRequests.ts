/**
 * Correction, and the queue somebody actually answers.
 *
 * ── The two gaps this closes, named as they were written down ────────────────────────────────
 *
 * docs/PRIVACY-AND-SECURITY.md listed both as **absent**, and both in one sentence each:
 *
 *   · *"There is no correction path in the service, distinct from deletion or otherwise. The web
 *      preview has a request screen."*
 *   · *"The thirty-day clock is a number computed into a response body. Nothing enforces it and
 *      nobody is paged by it."*
 *
 * A clock nobody reads is not a control. `RESPONSE_DAYS` was already correct arithmetic on a
 * response somebody would have had to be looking at; what was missing was a place the request sits
 * until a named person has answered it, and a record that they did.
 *
 * ── Why correction is not deletion ───────────────────────────────────────────────────────────
 *
 * POPIA section 24 gives two different rights in one section, and running them together is how a
 * person who wanted their name spelled properly gets their account emptied. Erasure already exists
 * here, with a grace period and a tombstone. Correction is the other half: the information stays,
 * and it becomes right.
 *
 * ── The four refusals ────────────────────────────────────────────────────────────────────────
 *
 * **One field is correctable, and it is the name.** That is not a limitation being apologised for,
 * it is what the service holds. A mobile number is the account's identity — every session, every
 * one-time code and every audit line is keyed to it — so changing it is not a correction, it is a
 * different account, and offering it here would be offering an account takeover with a friendly
 * label. The refusal says so.
 *
 * **The append-only logs are never corrected.** An entry saying a wrong code was tried at 03:14
 * stays, because a log something can edit is not a log and rewriting one destroys the only thing it
 * was worth having for. POPIA section 24(2)(c) has the answer for exactly this and it is not
 * deletion: where the responsible party will not amend, the data subject may require that a note be
 * attached. So that is what is recorded — a note, attached, kept with the request, and returned to
 * the person beside the refusal rather than instead of it.
 *
 * **A request has to say what is wrong and what it should say.** "Fix my details" cannot be carried
 * out, and — worse — cannot be refused either, so it would sit in a queue being neither.
 *
 * **Nobody answers their own request.** An operator who is also a data subject is an ordinary thing
 * and it is fine; an operator marking their own request answered is the one arrangement where the
 * proof of response proves nothing.
 *
 * ── What the queue is, and what it is not ────────────────────────────────────────────────────
 *
 * It is the outstanding section 24 requests — corrections and erasures together, because they arrive
 * from the same right and share the same thirty-day clock — with the date each was received, the
 * date it is due, the days left, and whether it is already late. **Nothing here pages anybody.**
 * There is no messaging provider on this platform and inventing one in this file would be worse than
 * the gap: a queue that says it alerts and does not is how a request goes unanswered for a year with
 * everybody believing the opposite. What this gives an operator is a list that exists, an overdue
 * count that is arithmetic rather than a claim, and a response that has a named author.
 *
 * The queue holds no name, no number and nothing anybody wrote about themselves. It is ids, dates
 * and a field name — enough to work the queue and not enough to read it as a list of people.
 *
 * Pure of HTTP: this module knows nothing about a request or a cookie. server.ts resolves who is
 * asking; this decides what may be done.
 */
import { randomUUID } from 'node:crypto';
import { RESPONSE_DAYS, daysRemaining, dueBy } from './personalData.ts';

/* Nothing here talks to node:sqlite directly, exactly as the vetting and consent stores do not:
   the handle is passed in and a test can hand this anything answering the same two calls. */
type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS correction_requests (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL, field TEXT NOT NULL,
 should_say TEXT NOT NULL, because TEXT NOT NULL,
 requested_at INTEGER NOT NULL, due_at INTEGER NOT NULL, answered_at INTEGER);
CREATE INDEX IF NOT EXISTS correction_requests_person ON correction_requests (person_id);
CREATE INDEX IF NOT EXISTS correction_requests_due ON correction_requests (answered_at, due_at);
/* Append-only by contract, and for the same reason the audit table is: this is the proof that a
   request was answered, by whom and when, and a proof something can rewrite is not one. The service
   issues no UPDATE and no DELETE against it, and scripts/check-boundaries.mjs fails the build if it
   ever does. */
CREATE TABLE IF NOT EXISTS subject_request_responses (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, request_id TEXT NOT NULL, person_id TEXT NOT NULL,
 outcome TEXT NOT NULL, response TEXT NOT NULL, note_attached INTEGER NOT NULL,
 answered_by TEXT NOT NULL, answered_at INTEGER NOT NULL, audit_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS subject_request_responses_request ON subject_request_responses (kind, request_id);
`;

/** The two rights that arrive under POPIA section 24 and share its thirty-day clock. */
export const REQUEST_KINDS = ['correction', 'erasure'] as const;
export type RequestKind = typeof REQUEST_KINDS[number];

/**
 * What an answer can be, and what each one means to the person who asked.
 *
 * `noted` is the one that matters and the one a system like this usually leaves out. It is POPIA
 * section 24(2)(c): the record was not changed, and the person's own account of it is attached to
 * it, so anybody reading the record afterwards reads the disagreement too.
 */
export const OUTCOMES = ['corrected', 'refused', 'noted'] as const;
export type Outcome = typeof OUTCOMES[number];

/**
 * The fields a correction can actually reach.
 *
 * One, today, and the register in personalData.ts is where you can see why: everything else this
 * service holds is either the account's identity, a hash of something, a decision somebody took, or
 * an append-only line. A list of one is an honest list.
 */
export const CORRECTABLE_FIELDS = ['name'] as const;
export type CorrectableField = typeof CORRECTABLE_FIELDS[number];

export const REFUSALS = {
 phoneIsIdentity:
  'Your mobile number cannot be corrected here. It is not a detail on your account — it is the account: every sign-in, every one-time code and every line in the security log is keyed to it, so replacing it would not correct a record, it would move you into somebody else\'s. If the number MyThuso has is not yours, that is a different request and it is answered by a person: ask to be erased, and sign up again on the number that is.',
 logsAreNotCorrected:
  'The sign-in log and the log of who opened your record are never corrected. Each line is chained to the one before it, so an edited line shows up — which is the only reason either log is worth anything as evidence about your account. POPIA section 24(2)(c) has the answer for this and it is not deletion: where MyThuso will not amend a record, you may require that your own account of it is attached to it. That is recorded as a note and goes with the record from then on.',
 sayWhatItShouldSay:
  'A correction has to say which detail is wrong and what it should say instead. Without both, there is nothing MyThuso can carry out and nothing it can honestly refuse either, so the request would sit in a queue being neither answered nor turned down.',
 notYourOwn:
  'Nobody answers their own request. You may be both an operator and a data subject and there is nothing wrong with that — but a response you recorded about yourself is the one arrangement in which the proof that a request was answered proves nothing.',
 alreadyAnswered:
  'That request has already been answered. An answer is a line of its own and is never edited: if something more needs saying, it is said in a new request rather than by rewriting the first one.'
} as const;

export type CorrectionRequest = {
 id: string;
 personId: string;
 field: string;
 shouldSay: string;
 because: string;
 requestedAt: number;
 dueAt: number;
 answeredAt: number | null;
};

export type ResponseRecord = {
 id: string;
 kind: RequestKind;
 requestId: string;
 personId: string;
 outcome: Outcome;
 response: string;
 noteAttached: boolean;
 answeredBy: string;
 answeredAt: number;
 auditId: string;
};

/** One line of the queue. Ids and dates: enough to work it, not enough to read it as a list of people. */
export type QueueEntry = {
 kind: RequestKind;
 requestId: string;
 personId: string;
 /** For a correction, which detail. For an erasure, the word erasure — there is no field to name. */
 about: string;
 receivedAt: number;
 dueAt: number;
 daysLeft: number;
 overdue: boolean;
};

export type SubjectRequestStore = {
 open(request: CorrectionRequest): void;
 mine(personId: string): CorrectionRequest[];
 find(id: string): CorrectionRequest | null;
 outstandingCorrections(): CorrectionRequest[];
 markAnswered(id: string, at: number): void;
 recordResponse(record: ResponseRecord): void;
 responsesFor(kind: RequestKind, requestId: string): ResponseRecord[];
 responsesTo(personId: string): ResponseRecord[];
};

const asBool = (value: unknown): boolean => value === 1 || value === true || value === 1n;

export function openSubjectRequestStore(db: Database): SubjectRequestStore {
 db.exec(SCHEMA);
 const rows = <T>(result: unknown[]): T[] => result as T[];
 return {
  open(request) {
   db.prepare('INSERT INTO correction_requests (id, person_id, field, should_say, because, requested_at, due_at, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
    .run(request.id, request.personId, request.field, request.shouldSay, request.because, request.requestedAt, request.dueAt);
  },
  mine(personId) {
   return rows<CorrectionRequest>(db.prepare('SELECT id, person_id AS personId, field, should_say AS shouldSay, because, requested_at AS requestedAt, due_at AS dueAt, answered_at AS answeredAt FROM correction_requests WHERE person_id = ? ORDER BY requested_at DESC').all(personId));
  },
  find(id) {
   return rows<CorrectionRequest>(db.prepare('SELECT id, person_id AS personId, field, should_say AS shouldSay, because, requested_at AS requestedAt, due_at AS dueAt, answered_at AS answeredAt FROM correction_requests WHERE id = ?').all(id))[0] ?? null;
  },
  outstandingCorrections() {
   return rows<CorrectionRequest>(db.prepare('SELECT id, person_id AS personId, field, should_say AS shouldSay, because, requested_at AS requestedAt, due_at AS dueAt, answered_at AS answeredAt FROM correction_requests WHERE answered_at IS NULL ORDER BY due_at').all());
  },
  /* The only UPDATE this module issues, and it is against the request rather than the response: a
     request moves from open to answered, and the answer beside it is never touched. */
  markAnswered(id, at) {
   db.prepare('UPDATE correction_requests SET answered_at = ? WHERE id = ? AND answered_at IS NULL').run(at, id);
  },
  recordResponse(record) {
   db.prepare('INSERT INTO subject_request_responses (id, kind, request_id, person_id, outcome, response, note_attached, answered_by, answered_at, audit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(record.id, record.kind, record.requestId, record.personId, record.outcome, record.response, record.noteAttached ? 1 : 0, record.answeredBy, record.answeredAt, record.auditId);
  },
  responsesFor(kind, requestId) {
   return rows<ResponseRecord & { noteAttached: unknown }>(db.prepare('SELECT id, kind, request_id AS requestId, person_id AS personId, outcome, response, note_attached AS noteAttached, answered_by AS answeredBy, answered_at AS answeredAt, audit_id AS auditId FROM subject_request_responses WHERE kind = ? AND request_id = ? ORDER BY answered_at').all(kind, requestId))
    .map(row => ({ ...row, noteAttached: asBool(row.noteAttached) }));
  },
  responsesTo(personId) {
   return rows<ResponseRecord & { noteAttached: unknown }>(db.prepare('SELECT id, kind, request_id AS requestId, person_id AS personId, outcome, response, note_attached AS noteAttached, answered_by AS answeredBy, answered_at AS answeredAt, audit_id AS auditId FROM subject_request_responses WHERE person_id = ? ORDER BY answered_at DESC').all(personId))
    .map(row => ({ ...row, noteAttached: asBool(row.noteAttached) }));
  }
 };
}

export type Refused = { ok: false; reason: string; noteOffered?: boolean };
export type Opened = { ok: true; request: CorrectionRequest };

/**
 * Ask for something to be corrected.
 *
 * The refusals are the whole of the value. Two of the three arrive before anything is stored, and
 * the one about the logs offers the note in the same breath rather than leaving the person with a
 * refusal and nothing to do about it.
 */
export function openCorrection(
 store: SubjectRequestStore,
 input: { personId: string; field: string; shouldSay: string; because: string },
 at: number
): Opened | Refused {
 const field = input.field.trim().toLowerCase();
 if (field === 'phone' || field === 'number' || field === 'mobile') {
  return { ok: false, reason: REFUSALS.phoneIsIdentity };
 }
 if (field === 'audit' || field === 'access-log' || field === 'log') {
  return { ok: false, reason: REFUSALS.logsAreNotCorrected, noteOffered: true };
 }
 if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field) || !input.shouldSay.trim() || !input.because.trim()) {
  return { ok: false, reason: REFUSALS.sayWhatItShouldSay };
 }
 const request: CorrectionRequest = {
  id: randomUUID(),
  personId: input.personId,
  field,
  shouldSay: input.shouldSay.trim(),
  because: input.because.trim(),
  requestedAt: at,
  dueAt: dueBy(at),
  answeredAt: null
 };
 store.open(request);
 return { ok: true, request };
}

/**
 * The outstanding queue, both kinds together, oldest deadline first.
 *
 * An erasure is in here even though it carries itself out after seven days, because carrying out a
 * request and answering it are different acts and POPIA requires the second one too — the person is
 * owed a sentence saying what was and was not deleted, and personalData.ts already writes it.
 */
export function queue(
 corrections: readonly CorrectionRequest[],
 erasures: readonly { personId: string; requestedAt: number }[],
 at: number
): QueueEntry[] {
 const entries: QueueEntry[] = [
  ...corrections.map(request => ({
   kind: 'correction' as RequestKind, requestId: request.id, personId: request.personId,
   about: request.field, receivedAt: request.requestedAt, dueAt: request.dueAt
  })),
  ...erasures.map(request => ({
   kind: 'erasure' as RequestKind, requestId: request.personId, personId: request.personId,
   about: 'erasure', receivedAt: request.requestedAt, dueAt: dueBy(request.requestedAt)
  }))
 ].map(entry => {
  const daysLeft = daysRemaining(entry.dueAt, at);
  return { ...entry, daysLeft, overdue: daysLeft < 0 };
 });
 return entries.sort((left, right) => left.dueAt - right.dueAt);
}

/** How many are late. Arithmetic on the queue rather than a number anybody maintains. */
export const overdueCount = (entries: readonly QueueEntry[]): number => entries.filter(entry => entry.overdue).length;

export { RESPONSE_DAYS };
