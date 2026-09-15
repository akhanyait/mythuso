/**
 * Intake: what a device that has been offline syncs to.
 *
 * ── One door, and it is the gate's ───────────────────────────────────────────────────────────
 *
 * Nothing in this file can seal a value or open one. It holds a `Gate` and an `AuditChain`, exactly
 * as the vetting module does, and for the same reason: a module that can seal can choose its own
 * binding, and a module that can open can decide for itself who may read a record. Every entry that
 * is accepted goes in through `gate.protect()`, which decides against the capturer's own current
 * standing, builds the binding from the request rather than accepting one, and writes the audit
 * entry before any ciphertext exists.
 *
 * ── Per entry, never per batch ───────────────────────────────────────────────────────────────
 *
 * A batch of ten from a nurse who was out of signal all morning is ten decisions. One entry naming a
 * record type the catalogue has never heard of must not cost the other nine, because those nine are
 * her work and `queuedIsNotLost` says so. So there is no transaction around the batch, no early
 * return, and no "the batch failed" answer — there are ten answers, in the order they were sent.
 *
 * ── Idempotent, because connections drop ─────────────────────────────────────────────────────
 *
 * A device that does not hear the receipt retries the whole batch. The device's own entry id is the
 * idempotency key and the insert is the control, exactly as it is for a bootstrap authorisation and
 * a renewal notice: the second arrival is told what the first was told, is recorded in the chain as
 * a repeat, and changes nothing.
 *
 * ── Where the honest limits are ──────────────────────────────────────────────────────────────
 *
 * Two of them, and both are named rather than smoothed over.
 *
 *  · **Nothing is filed.** There is no clinical record in this service and there must not be one
 *    until the controls in docs/PRIVACY-AND-SECURITY.md exist. An accepted entry is decided,
 *    ordered, committed to and receipted; the reading itself stays on the device. That is less than
 *    a sync engine and it is the most that can honestly be built today.
 *  · **Standing at capture is reconstructed, not remembered.** The vetting vault holds a check's
 *    current state and its expiry date and overwrites the row on every decision, so resolving a
 *    party's standing at a past moment re-resolves *today's* evidence against that date. It is right
 *    where the only thing that has changed is the calendar — which is precisely the lapsed-clearance
 *    case — and wrong wherever a document was resubmitted or a decision retaken since. Closing that
 *    needs an as-at history of vetting state, which vetting/store.ts does not keep, and it is a
 *    change to somebody else's module rather than something this one can fix by trying harder.
 */
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { encodeSealedValue, standingOf, type AccessRequest, type AuditChain, type Gate, type VettingSource } from '../protection/index.ts';
import { clockConflict, duplicateConflict, lapsedCapturerConflict, staleWriteConflict, type CapturerStanding } from './conflict.ts';
import { describeOrdering, skewOf, type Skew } from './ordering.ts';
import { conflictId, type CaptureRow, type CaptureStore, type ConflictRow } from './store.ts';
import {
 RULES, SETTLEMENTS, conflictDetail, conflictName, isProvenance,
 type Actor, type Batch, type BatchReceipt, type CaptureState, type DetectedConflict,
 type EntryAnswer, type QueuedEntry, type RecordRegister, type Settlement
} from './contract.ts';

export * from './contract.ts';
export { DEVICE_CLOCK_TOLERANCE_MS, describeDuration, describeOrdering, skewOf } from './ordering.ts';
export { openCaptureStore } from './store.ts';
export type { CaptureRow, CaptureStore, ConflictRow } from './store.ts';

const DAY = 86_400_000;

/**
 * How long a held entry may wait before it is somebody's problem out loud.
 *
 * Fourteen days, and it is MyThuso's own setting rather than anything an Act or a guideline states.
 * A conflicted entry is a nurse's clinical work sitting in limbo: it has not been filed, it has not
 * been discarded, and the only thing that moves it is a person. An entry that has been conflicted
 * for a year is not a record, it is a question nobody answered — so the escalation exists to make
 * that visible, and the disposal sweep will not touch it, because sweeping it away would answer the
 * question by deletion.
 */
export const CONFLICT_ESCALATION_DAYS = 14;

/** An answer, shaped the way the vetting module shapes one. */
export type Refusal = { ok: false; reason: string };
export type Answer<T> = ({ ok: true } & T) | Refusal;

export type Deps = {
 gate: Gate;
 audit: AuditChain;
 store: CaptureStore;
 /**
  * Where the record stands. Injected, and its absence refuses rather than assumes: with nothing
  * wired in, every entry is refused, which is the truthful answer for a service that has no clinical
  * record to file against. A default that accepted would be a service that files into nothing and
  * reports success.
  */
 records: RecordRegister;
 /**
  * The same register the gate resolves standing from. It is here for the one question the gate never
  * asks, because the gate only ever asks about now: was this capturer cleared at the moment the
  * device says the reading was taken.
  */
 vetting: VettingSource;
 now?: () => number;
};

/** One conflict as a queue shows it: the disagreement, the entry it is about, and how long it has waited. */
export type HeldConflict = { conflict: ConflictRow; entry: CaptureRow; waitingDays: number };

/** One entry in the server's own order, with the two times said the one way they may be said. */
export type OrderedEntry = { entry: CaptureRow; sentence: string; conflicts: ConflictRow[] };

const digestOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/* The skew as it was at the moment an entry arrived, rebuilt from the row. A sentence about a
   device's clock has to describe the sync it was measured at rather than the one somebody happens to
   be reading it in, so this reconstructs the device's own `now` from what was stored instead of
   comparing anything with today. */
const skewAt = (row: { receivedAt: number; skewMs: number | null }): Skew =>
 skewOf(row.skewMs === null ? null : row.receivedAt + row.skewMs, row.receivedAt);

const orderingOf = (row: CaptureRow) => ({
 seq: row.seq, receivedAt: row.receivedAt, believedCapturedAt: row.believedCapturedAt,
 queuedForMs: row.receivedAt - row.believedCapturedAt
});

export class CaptureIntake {
 readonly #gate: Gate;
 readonly #audit: AuditChain;
 readonly #store: CaptureStore;
 readonly #records: RecordRegister;
 readonly #vetting: VettingSource;
 readonly #now: () => number;
 constructor(deps: Deps) {
  this.#gate = deps.gate;
  this.#audit = deps.audit;
  this.#store = deps.store;
  this.#records = deps.records;
  this.#vetting = deps.vetting;
  this.#now = deps.now ?? (() => Date.now());
 }

 /**
  * Take a batch.
  *
  * The receipt time is taken once, at the top, and every entry in the batch shares it. A batch is
  * one moment of contact — giving each entry its own `Date.now()` would order the entries of a
  * single sync by how long the loop took, which is a fact about the server's processor rather than
  * about anything clinical. What separates them inside that moment is the sequence, and the sequence
  * follows the order the device sent them in.
  */
 receive(batch: Batch): BatchReceipt {
  const receivedAt = this.#now();
  const batchId = randomUUID();
  const skew = skewOf(batch.believedSentAt, receivedAt);
  /* Read once, before anything in this batch is recorded. The moment the first entry lands, this
     device's last contact is *now*, and the window every later entry's capture claim is corroborated
     against would collapse to nothing. */
  const lastContact = this.#store.lastContact(batch.deviceId);
  const answers = batch.entries.map(entry => this.#take(batch, entry, batchId, receivedAt, skew, lastContact));
  return { batchId, deviceId: batch.deviceId, receivedAt, skewMs: skew.ms, skewSentence: skew.sentence, answers };
 }

 /** Everything still waiting for a clinician, oldest first. */
 held(at: number = this.#now()): HeldConflict[] {
  const held: HeldConflict[] = [];
  for (const conflict of this.#store.openConflicts()) {
   const entry = this.#store.find(conflict.deviceId, conflict.entryId);
   if (!entry) continue;
   held.push({ conflict, entry, waitingDays: Math.floor((at - conflict.detectedAt) / DAY) });
  }
  return held;
 }

 /** The half of that queue that has waited too long. Not a refusal and not a disposal — a question. */
 overdue(at: number = this.#now()): HeldConflict[] {
  return this.held(at).filter(entry => entry.waitingDays >= CONFLICT_ESCALATION_DAYS);
 }

 /**
  * A clinician settles a held entry.
  *
  * Three outcomes and no merge. `stands` and `superseded` both leave the entry in the record and
  * visible — the superseded one is not deleted, because "what did the first reading say" is a
  * question asked after something has gone wrong. `not-filed` leaves the entry, its order and this
  * decision on the ledger too; what it does not do is put it in the record.
  *
  * The gate decides first, as it does about every other write: a clinician whose own standing has
  * lapsed does not settle a conflict about somebody else's.
  */
 settle(actor: Actor, reference: { deviceId: string; entryId: string }, decision: { as: Settlement; reason: string }): Answer<{ entry: CaptureRow; conflicts: ConflictRow[] }> {
  const entry = this.#store.find(reference.deviceId, reference.entryId);
  if (!entry) return { ok: false, reason: 'There is no such entry on the intake ledger.' };
  if (!SETTLEMENTS.includes(decision.as)) {
   return { ok: false, reason: `"${decision.as}" is not one of the three outcomes. An entry stands, is superseded, or is not filed — and nothing is merged into anything, which is what a fourth outcome would quietly become.` };
  }
  if (!decision.reason?.trim()) {
   return { ok: false, reason: 'A decision about somebody\'s clinical work has to say why, in words the capturer will read. A settlement with no reason cannot be questioned, and being able to question it is the only protection anybody has against a mistake here.' };
  }
  const open = this.#store.conflictsFor(entry.deviceId, entry.entryId).filter(conflict => conflict.settledAt === null);
  if (!open.length) {
   return { ok: false, reason: 'Nothing on this entry is waiting for a decision. It was either never held or somebody has already settled it, and a second decision would overwrite the first one\'s name.' };
  }
  /* The one self-decision that is refused. A nurse deciding which of her own two readings stands is
     ordinary clinical judgement, and she is the person best placed to make it. A nurse deciding that
     her own lapsed clearance was good enough is the very thing the conflict was raised about, and
     nobody rules on their own standing. */
  if (actor.id === entry.actorId && open.some(conflict => conflict.kind === 'vetting-lapsed')) {
   return { ok: false, reason: 'This entry is held because the capturer\'s own standing had lapsed by the time it arrived, and you are the capturer. Somebody else decides whether it stands: nobody rules on their own clearance.' };
  }
  const outcome = this.#gate.access(this.#request(actor, entry));
  if (!outcome.allowed) return { ok: false, reason: outcome.reason };

  const at = this.#now();
  /* The catalogue has six states and none of them is "a clinician decided not to file this". The
     nearest true one is `refused` — not in the record, not lost, still on the device — so that is
     what it becomes, with the settlement recorded beside it so a reader can always tell a server's
     refusal from a person's decision. Inventing a seventh state here would have meant three app
     surfaces rendering a state the contract does not describe. */
  const state: CaptureState = decision.as === 'not-filed' ? 'refused' : 'stored';
  if (!this.#store.settle(entry.deviceId, entry.entryId, { at, by: actor.id, as: decision.as, reason: decision.reason, state })) {
   return { ok: false, reason: 'Somebody settled this entry while you were deciding. Their decision stands and yours has not been recorded; open it again to see what they said.' };
  }
  this.#log(`capture.settled.${decision.as}`, actor, entry, true,
   `Entry ${entry.entryId} from device ${entry.deviceId}, held on ${open.map(conflict => conflict.kind).join(' and ')}, settled as ${decision.as} by ${actor.id}. ${decision.reason}`);
  return { ok: true, entry: this.#store.find(entry.deviceId, entry.entryId)!, conflicts: this.#store.conflictsFor(entry.deviceId, entry.entryId) };
 }

 /**
  * Every entry against one record, in the server's own order.
  *
  * The order is the server's receipt time and its own sequence, never the device's clock — which is
  * the whole of `deviceClockIsNotTruth`. What the device believed travels with each entry in the
  * sentence beside it, attributed to the device in the same breath.
  */
 ordered(recordType: string, recordId: string): OrderedEntry[] {
  return this.#store.forRecord(recordType, recordId).map(entry => ({
   entry,
   sentence: describeOrdering(orderingOf(entry), skewAt(entry)),
   conflicts: this.#store.conflictsFor(entry.deviceId, entry.entryId)
  }));
 }

 /**
  * What an erasure request runs into here, in the words the person reads.
  *
  * It says what is held before it says why it is kept, because "we hold entries about your care" and
  * "we hold what was found" are different sentences and only the first one is true here.
  */
 retainedFor(subjectId: string): { what: string; because: string }[] {
  if (!this.#store.forSubject(subjectId).length) return [];
  return [{
   what: 'The record of entries your nurse\'s phone sent to MyThuso after being offline',
   because: 'It says that an entry was sent, by whom, against which of your visits, when the phone believed it was taken and when MyThuso actually received it. It does not hold the reading itself: MyThuso never kept that and could not read it if it had. It is kept so that the order in which things happened can still be established if a question is asked about your care, and so that anything a clinician had to decide about can be shown to have been decided rather than quietly dropped.'
  }];
 }

 /** How many receipts are past their disposal date and settled. Counted before anything goes. */
 disposable(before: number): number {
  return this.#store.disposable(before);
 }

 /**
  * Dispose of what is past its date, and never of what is still waiting.
  *
  * The conflict rows go with their entry and never on their own, and an entry with an open conflict
  * is not reached at all, whatever its age. See CONFLICT_ESCALATION_DAYS.
  */
 dispose(before: number): number {
  const disposed = this.#store.dispose(before);
  if (disposed) {
   this.#audit.append({
    event: 'capture.disposed', capability: 'view-billing', purpose: 'audit',
    recordType: 'audit', recordId: 'capture-ledger', field: 'disposal', allowed: true,
    reason: `${disposed} intake receipts past their disposal date were disposed of. Entries still waiting for a clinician were not reached, whatever their age.`
   });
  }
  return disposed;
 }

 /* ---- Internals -------------------------------------------------------------------------------- */

 /**
  * One entry, decided on its own.
  *
  * The order below is the order the answers are most useful in. The envelope is checked first,
  * because a refusal about a missing provenance is one the nurse can act on and costs nothing to
  * produce. The record register is next, because there is no point deciding about a write to a record
  * nobody can describe. The gate is third, and it is the only thing that seals. Conflicts come last,
  * because a disagreement is only interesting about an entry the gate would have taken.
  */
 #take(batch: Batch, entry: QueuedEntry, batchId: string, receivedAt: number, skew: Skew, lastContact: number | null): EntryAnswer {
  if (!batch.deviceId?.trim() || !entry.entryId?.trim()) {
   /* Refused without a ledger row, deliberately. An entry with no device and no id of its own has
      nothing to be idempotent on: recording it would key it on a pair of empty strings, and the next
      malformed entry in the same batch would be read as a retry of this one. The refusal is still in
      the chain, which is where a device sending rubbish is actually noticed. */
   const reason = 'An entry has to say which device it came from and carry that device\'s own id for it. Without both there is no way to recognise a retry, and a retry nobody recognises is the same reading recorded twice.';
   this.#audit.append({
    event: 'capture.refused', actorId: batch.actor.id, actorRole: batch.actor.role,
    capability: entry.capability || 'unstated', purpose: batch.actor.purpose,
    recordType: entry.recordType || 'unstated', recordId: entry.recordId || 'unstated',
    subjectId: entry.subjectId || 'unstated', field: entry.field || 'unstated',
    allowed: false, reason, blockedBy: ['intake', 'envelope']
   });
   return {
    entryId: entry.entryId ?? '', state: 'refused', repeated: false, receivedAt, seq: 0,
    sentence: 'It has no place in the server\'s order, because it was not taken into it.',
    conflicts: [], reason
   };
  }

  const seen = this.#store.find(batch.deviceId, entry.entryId);
  if (seen) {
   /* A repeat is recorded as a repeat and changes nothing — the same answer the identity provider's
      callback gives a retry. Here a dropped connection is the ordinary case rather than the
      exception, which is exactly why it must not be the case that produces a second record. */
   this.#log('capture.replayed', batch.actor, seen, true,
    `Entry ${seen.entryId} from device ${seen.deviceId} had already been recorded as ${seen.state} at ${new Date(seen.receivedAt).toISOString()}. The repeat was acknowledged and changed nothing.`);
   return this.#answer(seen, this.#store.conflictsFor(seen.deviceId, seen.entryId), true);
  }

  const refuse = (reason: string, named: string[]): EntryAnswer =>
   this.#write(batch, entry, batchId, receivedAt, skew, 'refused', reason, [], null, named);

  if (!entry.field?.trim()) {
   return refuse('An entry has to name which part of the record it is against. Without it there is no binding, and a value with no binding is one that can be moved into somebody else\'s record.', ['envelope']);
  }
  if (!isProvenance(entry.provenance)) {
   return refuse(`${RULES.provenanceIsRequired} "${entry.provenance || 'nothing'}" is not one of the four.`, ['provenance']);
  }
  if (!entry.payload?.byteLength) {
   return refuse('An empty payload is not a reading, and nothing was recorded against the record.', ['envelope']);
  }
  if (!Number.isFinite(entry.believedCapturedAt)) {
   return refuse('An entry has to say when the device believed it was taken. That time never orders anything, but it is what a skew is measured against, and a claim nobody made cannot be questioned.', ['envelope']);
  }
  if (!Number.isInteger(entry.sawRecordVersion) || entry.sawRecordVersion < 0) {
   return refuse('An entry has to say which version of the record the device was working from. Without it there is no way to tell whether the record moved on while the entry sat in a queue, and an entry applied over work nobody saw is what a stale write is.', ['envelope']);
  }

  const standing = this.#records.find({ recordType: entry.recordType, recordId: entry.recordId, subjectId: entry.subjectId });
  if (!standing) {
   return refuse('This server cannot say what this record is or where it stands, so it will not decide about a write to it. That is the honest answer today: no clinical record exists in this service, and one will not come into being because an entry arrived.', ['record-register']);
  }

  /* A view over the bytes the caller handed in rather than a copy of them, the way vetting/index.ts
     takes a certificate scan. Nothing here reads them; they are passed to the gate and forgotten. */
  const payload = Buffer.from(entry.payload.buffer, entry.payload.byteOffset, entry.payload.byteLength);
  const sealed = this.#gate.protect(this.#request(batch.actor, entry), payload);
  if (!sealed.ok) {
   /* The gate has refused and has written its own entry, and nothing here overrides that: no
      plaintext was sealed and none will be. What is added is the one distinction the gate does not
      draw, because the gate only ever asks about now — a refusal for a standing that lapsed *since*
      the reading was taken is a question rather than an ending, and the answer to it belongs to a
      clinician. The entry is still not filed. */
   const capturer = this.#capturer(batch.actor.id, entry.believedCapturedAt, receivedAt, lastContact);
   const lapsed = capturer ? lapsedCapturerConflict(capturer) : null;
   if (!lapsed) return refuse(sealed.reason, ['gate']);
   return this.#write(batch, entry, batchId, receivedAt, skew, 'conflicted', sealed.reason, [lapsed], null, []);
  }

  const envelope = encodeSealedValue(sealed.sealed);
  const commitment = { digest: digestOf(envelope), bytes: envelope.byteLength, version: sealed.sealed.version, envelope };

  const detected: DetectedConflict[] = [];
  const clock = clockConflict(skew, entry.believedCapturedAt, receivedAt);
  if (clock) {
   /* The only one of the four the server settles, and it settles it by doing what it was always
      going to do: order by its own receipt time and keep the device's claim beside it as a claim.
      Nothing about the reading is touched, which is precisely why this one is not a clinician's. */
   clock.settledAt = receivedAt;
   clock.settledBy = 'server';
   clock.settledAs = 'stands';
   detected.push(clock);
  }
  const duplicate = duplicateConflict(this.#store.slot({
   recordType: entry.recordType, recordId: entry.recordId, subjectId: entry.subjectId, field: entry.field
  }).map(row => ({ entryId: row.entryId, seq: row.seq, receivedAt: row.receivedAt, settledAs: row.settledAs })));
  if (duplicate) detected.push(duplicate);
  const stale = staleWriteConflict(entry.sawRecordVersion, standing);
  if (stale) detected.push(stale);

  const held = detected.some(conflict => conflict.settledAt === null);
  return this.#write(batch, entry, batchId, receivedAt, skew, held ? 'conflicted' : 'stored', null, detected, commitment, []);
 }

 /**
  * Where a capturer stood at two moments, or null where nobody has ever vetted them.
  *
  * A suspension and a decline are deliberately not lapses. Both are a person's decision taken now
  * rather than a date that has passed, so re-resolving them at a past moment would say the party was
  * fine that morning — true of the calendar and false of the decision. They stay refusals.
  */
 #capturer(actorId: string, believedCapturedAt: number, receivedAt: number, lastContact: number | null): CapturerStanding | null {
  const actor = this.#vetting.find(actorId);
  if (!actor) return null;
  if (actor.suspended || actor.declined) return null;
  const now = standingOf(actor, receivedAt);
  const then = standingOf(actor, believedCapturedAt);
  return {
   lapsedNow: now.lapsed,
   clearedNow: now.cleared,
   clearedAtBelief: then.cleared,
   believedCapturedAt,
   corroborated: lastContact !== null && believedCapturedAt >= lastContact && believedCapturedAt <= receivedAt,
   window: { from: lastContact, to: receivedAt }
  };
 }

 /* One writer for every answer, so there is no branch that decides something without recording it,
    and none that records an entry without an entry in the chain. */
 #write(
  batch: Batch, entry: QueuedEntry, batchId: string, receivedAt: number, skew: Skew,
  state: CaptureState, reason: string | null, detected: DetectedConflict[],
  commitment: { digest: string; bytes: number; version: number; envelope: Uint8Array } | null,
  named: string[]
 ): EntryAnswer {
  const row: CaptureRow = {
   deviceId: batch.deviceId, entryId: entry.entryId, batchId, seq: this.#store.nextSeq(),
   actorId: batch.actor.id, actorRole: batch.actor.role, purpose: batch.actor.purpose,
   capability: entry.capability || 'unstated',
   recordType: entry.recordType || 'unstated', recordId: entry.recordId || 'unstated',
   subjectId: entry.subjectId || 'unstated',
   field: entry.field || 'unstated', provenance: entry.provenance || 'unstated',
   /* A refused entry still gets a row, and a row has columns that cannot be null. What a malformed
      envelope left out is written as "unstated" rather than as a plausible-looking blank, and a
      capture time nobody supplied is the epoch rather than a NaN the database would silently keep as
      nothing at all. */
   believedCapturedAt: Number.isFinite(entry.believedCapturedAt) ? entry.believedCapturedAt : 0,
   receivedAt, skewMs: skew.ms,
   state, reason,
   payloadDigest: commitment?.digest ?? null, payloadBytes: commitment?.bytes ?? null,
   keyVersion: commitment?.version ?? null,
   settledAt: null, settledBy: null, settledAs: null, settledReason: null
  };
  this.#store.record(row);
  const rows: ConflictRow[] = detected.map(conflict => ({
   id: conflictId(), deviceId: row.deviceId, entryId: row.entryId,
   kind: conflict.kind, resolution: conflict.resolution, finding: conflict.finding,
   recordType: row.recordType, recordId: row.recordId, subjectId: row.subjectId,
   detectedAt: receivedAt,
   settledAt: conflict.settledAt, settledBy: conflict.settledBy, settledAs: conflict.settledAs,
   settledReason: conflict.settledAt === null ? null : 'The server ordered it by its own receipt time and kept the device\'s time beside it as a claim. Nothing about the reading was touched.'
  }));
  for (const conflict of rows) this.#store.addConflict(conflict);

  this.#log(
   state === 'stored' ? 'capture.accepted' : state === 'conflicted' ? 'capture.conflicted' : 'capture.refused',
   batch.actor, row, state === 'stored',
   state === 'refused'
    ? `Entry ${row.entryId} from device ${row.deviceId} refused. ${reason ?? ''}`
    : `Entry ${row.entryId} from device ${row.deviceId}, ${row.provenance} provenance, ${state}. Received ${new Date(receivedAt).toISOString()}, ${row.seq} in the server's order; the device believed ${new Date(row.believedCapturedAt).toISOString()}.`
      + (commitment ? ` Sealed under key version ${commitment.version}; the ledger keeps a digest of the envelope and not the envelope.` : ' Nothing was sealed.'),
   state === 'stored' ? [] : ['intake', ...named, ...rows.map(conflict => conflict.kind)]
  );
  /* An entry per conflict as well as the entry-level one, so "how often does a device clock go
     wrong" and "how many duplicates did that clinic raise last month" are a grep rather than a
     reconstruction — the same reason the bootstrap and the verification layer have their own kinds. */
  for (const conflict of rows) {
   this.#log(`capture.conflict.${conflict.kind}`, batch.actor, row, conflict.settledAt !== null,
    `${conflict.kind}: ${conflict.finding}`
     + (conflict.settledAt === null ? ` It is a ${conflict.resolution}'s to settle; nothing is merged and nothing is discarded in the meantime.` : ' Settled by the server on receipt.'),
    conflict.settledAt === null ? ['conflict', conflict.kind, conflict.resolution] : []);
  }
  const answer = this.#answer(row, rows, false);
  /* The envelope goes back to the device and is not kept here. The device already holds the reading,
     so what this adds is the server's own sealed, bound copy of it and a receipt for it: when there
     is a record to file into, the same bytes come back and the digest on the ledger can say they are
     the ones that were decided about. */
  return commitment ? { ...answer, sealed: commitment.envelope } : answer;
 }

 #answer(row: CaptureRow, conflicts: readonly ConflictRow[], repeated: boolean): EntryAnswer {
  return {
   entryId: row.entryId,
   state: row.state,
   repeated,
   receivedAt: row.receivedAt,
   seq: row.seq,
   sentence: describeOrdering(orderingOf(row), skewAt(row)),
   conflicts: conflicts.map(conflict => ({
    kind: conflict.kind,
    name: conflictName(conflict.kind),
    detail: conflictDetail(conflict.kind),
    resolution: conflict.resolution,
    finding: conflict.finding,
    settledAt: conflict.settledAt,
    settledBy: conflict.settledBy,
    settledAs: conflict.settledAs
   })),
   ...(row.reason ? { reason: row.reason } : {})
  };
 }

 #request(actor: Actor, entry: { recordType: string; recordId: string; subjectId: string; field: string; capability: string }): AccessRequest {
  /* Built from the entry rather than accepted as one, and the capability is the entry's own claim
     about which grant is being exercised. That hands nothing over: the gate checks the claim against
     records.json's own account of what opens the record and against the role's grants, so a wrong
     one is a refusal rather than a way in. */
  return {
   actorId: actor.id, actorRole: actor.role, capability: entry.capability,
   purpose: actor.purpose, recordType: entry.recordType, recordId: entry.recordId,
   subjectId: entry.subjectId, field: entry.field,
   /* A clinician filing or settling a reading changes a record: never a subject's shortcut. */
   operation: 'administrative'
  };
 }

 /* The intake log, and it is the same hash chain the gate writes to rather than a second log beside
    it. Never the payload: the chain's own allowlist throws on a field it does not know, so that is a
    guard rather than a habit. */
 #log(event: string, actor: Actor, row: CaptureRow, allowed: boolean, reason: string, blockedBy: string[] = []): void {
  this.#audit.append({
   event, actorId: actor.id, actorRole: actor.role,
   capability: row.capability, purpose: actor.purpose,
   recordType: row.recordType, recordId: row.recordId, subjectId: row.subjectId, field: row.field,
   allowed, reason,
   ...(blockedBy.length ? { blockedBy } : {})
  });
 }
}
