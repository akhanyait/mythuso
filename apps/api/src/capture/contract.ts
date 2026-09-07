/**
 * The intake contract: what a device that has been offline may send, and what it is told back.
 *
 * ── What this module is, and what it deliberately is not ─────────────────────────────────────
 *
 * It is not a store of readings. `scripts/check-boundaries.mjs` fails the build if a clinical table
 * appears in this service, and that guard is not a formality: health data is special personal
 * information under POPIA section 26, and most of the controls in docs/PRIVACY-AND-SECURITY.md are
 * still listed there as not built. So nothing here holds a systolic pressure, a glucose reading or a
 * temperature, and nothing here could read one if it were handed one — there is no field, no parser
 * and no column for it anywhere in this directory.
 *
 * What can be built honestly today is the half that is about *order and disagreement* rather than
 * about values: which entry arrived, when the server received it, what the device believed the time
 * was, whether two entries land on the same slot of the same record, whether the record moved on
 * while the entry sat in a queue, and whether the person who captured it was still cleared when it
 * arrived. Every one of those is answerable from the envelope. None of them needs the reading.
 *
 * ── The payload, and why the ledger does not keep it ─────────────────────────────────────────
 *
 * An entry carries an opaque payload. It goes through `Gate.protect()`, which decides, writes the
 * audit entry and seals it against the record it names — and the sealed envelope goes back to the
 * device with the receipt. What this service keeps is a SHA-256 of those sealed bytes and their
 * length: a commitment, not a copy. When there is a clinical record to file into, the device
 * presents the same envelope and the ledger can say it is the one that was decided about.
 *
 * That split is the point. The key ring is here and the ciphertext is not, so "this service cannot
 * read a reading" is a property of what it holds rather than a promise about what it does. The
 * honest cost, said plainly: an accepted entry is not filed anywhere, because there is nowhere to
 * file it. It stays the nurse's, on her device, which is what `queuedIsNotLost` asks for anyway.
 *
 * ── The catalogue is read, never restated ────────────────────────────────────────────────────
 *
 * packages/catalog/capture.json holds the states, the provenances, the four conflicts and the rules,
 * with the resolver named per conflict. The ids below are written out because TypeScript needs a
 * union it can check, and the start-up check underneath them refuses to build a module that has
 * fallen out of step with the contract — a fifth conflict added to the catalogue stops this service
 * rather than being quietly ignored by it.
 */
import capture from '../../../../packages/catalog/capture.json' with { type: 'json' };
import type { Purpose } from '../protection/index.ts';

/* ---- The catalogue ---------------------------------------------------------------------------- */

type CatalogueEntry = { id: string; name: string; detail: string };
type CatalogueConflict = CatalogueEntry & { resolution: string };

/** Who settles a conflict. Only one of the four is the server's, and it is the only one about time. */
export type Resolver = 'clinician' | 'server';

export type ConflictKind = 'duplicate-observation' | 'clock-skew' | 'stale-write' | 'vetting-lapsed';
export const CONFLICT_KINDS: readonly ConflictKind[] = ['duplicate-observation', 'clock-skew', 'stale-write', 'vetting-lapsed'];

/** The three states this service can put an entry in. The other three belong to the device. */
export type CaptureState = 'stored' | 'conflicted' | 'refused';

export type Provenance = 'device' | 'manual' | 'patient-reported' | 'derived';
export const PROVENANCES: readonly Provenance[] = ['device', 'manual', 'patient-reported', 'derived'];

export const RULES = capture.rules;

const conflicts = new Map<string, CatalogueConflict>(
 (capture.conflicts as readonly CatalogueConflict[]).map(conflict => [conflict.id, conflict] as const)
);
const states = new Set((capture.captureStates as readonly CatalogueEntry[]).map(state => state.id));
const provenances = new Set((capture.provenance as readonly CatalogueEntry[]).map(entry => entry.id));

/* Checked while the module loads, the way the gate checks its purpose matrix. A contract that has
   grown a conflict this file does not handle is not a typo to shrug at: the surfaces on web, iOS and
   Android are reading the same catalogue, so they would be showing a state the server never produces
   and never resolves. It refuses to start instead. */
for (const kind of CONFLICT_KINDS) {
 const conflict = conflicts.get(kind);
 if (!conflict) throw new Error(`packages/catalog/capture.json no longer describes the "${kind}" conflict, and this module is built around it.`);
 if (conflict.resolution !== 'clinician' && conflict.resolution !== 'server') {
  throw new Error(`The "${kind}" conflict is resolved by "${conflict.resolution}", which is neither a clinician nor the server. Intake will not guess who settles a disagreement.`);
 }
}
for (const conflict of conflicts.values()) {
 if (!(CONFLICT_KINDS as readonly string[]).includes(conflict.id)) {
  throw new Error(`packages/catalog/capture.json describes a "${conflict.id}" conflict that intake does not detect. A conflict nobody detects is a conflict that resolves itself, which is what conflictsAreNotMerged exists to prevent.`);
 }
}
for (const state of ['stored', 'conflicted', 'refused'] as const) {
 if (!states.has(state)) throw new Error(`packages/catalog/capture.json no longer has a "${state}" state, and intake answers with it.`);
}
for (const provenance of PROVENANCES) {
 if (!provenances.has(provenance)) throw new Error(`packages/catalog/capture.json no longer describes the "${provenance}" provenance.`);
}

export const conflictName = (kind: ConflictKind): string => conflicts.get(kind)!.name;
export const conflictDetail = (kind: ConflictKind): string => conflicts.get(kind)!.detail;
export const resolverOf = (kind: ConflictKind): Resolver => conflicts.get(kind)!.resolution as Resolver;
export const isProvenance = (value: string): value is Provenance => provenances.has(value);

/* ---- What arrives ----------------------------------------------------------------------------- */

/** Whoever the device is syncing on behalf of. The same shape the vetting module takes. */
export type Actor = { id: string; role: string; purpose: Purpose };

/**
 * One queued entry, as it leaves a device that has been offline.
 *
 * Everything except `payload` is envelope: the server reads all of it. `payload` is bytes, and no
 * line in this module looks inside them.
 */
export type QueuedEntry = {
 /** The device's own id for this entry, and the idempotency key. A retry carries the same one. */
 entryId: string;
 /** From packages/catalog/records.json. The gate refuses one it has never heard of. */
 recordType: string;
 /** The entry this is against — the visit, for an entry taken during one. */
 recordId: string;
 subjectId: string;
 /** Which slot of the record. Two entries with the same field on the same record are one slot. */
 field: string;
 /** From packages/catalog/vetting.json. The gate decides whether it opens the record. */
 capability: string;
 /** Exactly one, and never absent — see rules.provenanceIsRequired. */
 provenance: string;
 /** What the device believed the time was when this was taken. Never presented as when it happened. */
 believedCapturedAt: number;
 /** The record's version as the device last saw it. Without it, a stale write cannot be detected. */
 sawRecordVersion: number;
 /** Opaque. Sealed by the gate, never inspected, never stored. */
 payload: Uint8Array;
};

/**
 * A batch, as a device sends it after a spell offline.
 *
 * `believedSentAt` is the device's clock at the moment of contact, and it is the only honest way to
 * measure skew. An entry that is six hours old is a device that was offline for six hours, which is
 * not a fault; a device whose *now* is six hours out is a clock that is wrong. Measuring the second
 * on the first is how a nurse in a valley with no signal gets flagged for a broken clock.
 */
export type Batch = {
 deviceId: string;
 actor: Actor;
 believedSentAt: number;
 entries: readonly QueuedEntry[];
};

/* ---- What the record register has to be able to say -------------------------------------------- */

/**
 * Where the record stands now, asked of whoever owns it.
 *
 * Injected, exactly as the gate's vetting source and release register are, and for the same reason:
 * this service holds no clinical record, so it must not pretend to know one. With nothing wired in,
 * every entry is refused — which is the truthful state of the platform today rather than a gap.
 */
export type RecordStanding = {
 /** Monotonic. An entry that saw an older version is an entry written against a record that moved. */
 version: number;
 /** `signed` and `cancelled` are both closed: an entry is never applied silently after either. */
 state: 'open' | 'signed' | 'cancelled';
 changedAt: number;
};
export interface RecordRegister {
 find(query: { recordType: string; recordId: string; subjectId: string }): RecordStanding | null;
}

/* ---- What goes back --------------------------------------------------------------------------- */

/** One conflict, as this entry actually raised it. The catalogue's words, plus what was found. */
export type DetectedConflict = {
 kind: ConflictKind;
 name: string;
 /** The catalogue's own description of the kind. */
 detail: string;
 resolution: Resolver;
 /** What was found in this entry, in this record, on this day. The half the catalogue cannot know. */
 finding: string;
 settledAt: number | null;
 settledBy: string | null;
 settledAs: Settlement | null;
};

/**
 * What a clinician decides about a held entry.
 *
 * Three outcomes and no fourth, because the fourth would be a merge. Nothing is combined, nothing is
 * deleted, and `not-filed` still leaves the entry, its order and the decision on the ledger.
 */
export type Settlement = 'stands' | 'superseded' | 'not-filed';
export const SETTLEMENTS: readonly Settlement[] = ['stands', 'superseded', 'not-filed'];

export type EntryAnswer = {
 entryId: string;
 state: CaptureState;
 /** True where this entry had already been recorded and this arrival changed nothing. */
 repeated: boolean;
 /** The server's own receipt time, which is what orders it. */
 receivedAt: number;
 /** The server's order. Monotonic across every device, so two entries never tie. */
 seq: number;
 /** How the two times are to be shown, composed here so no surface has to compose it. */
 sentence: string;
 conflicts: DetectedConflict[];
 /** Present for a refusal, and it is the sentence the person reads. */
 reason?: string;
 /** The sealed envelope, for the device to keep. See the note at the top of this file. */
 sealed?: Uint8Array;
};

export type BatchReceipt = {
 batchId: string;
 deviceId: string;
 receivedAt: number;
 /** Measured once, on the batch, and reported whether or not it is beyond tolerance. Null where the
     device did not say what time it thought it was, which is not the same fact as agreement. */
 skewMs: number | null;
 skewSentence: string;
 /** One answer per entry, in the order they were sent. One refusal never costs the other nine. */
 answers: EntryAnswer[];
};
