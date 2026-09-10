/**
 * A simulated instrument — and the one simulator here with no feed to answer.
 *
 * ── Why there is no route, and why this file does not add one ────────────────────────────────
 *
 * `packages/catalog/feeds.json` has a `noSeam` entry for `devices` and it is a decision rather than
 * an omission: the seam already exists and it is `apps/api/src/capture/**`. Device identity, the
 * device's claimed time, the measured skew and a SHA-256 commitment to a reading the service never
 * keeps are all built and tested there, with four named conflicts. What is missing is not a schema —
 * it is device binding, a key per device minted in a ceremony this repository cannot perform. A
 * second ingestion boundary beside the first would be two places to get the same thing wrong.
 *
 * So this produces a `QueuedEntry` for the intake this product already has, and does not go through
 * `register()` at all. `register()` demands a feed id, checks it against the eleven, and refuses a
 * simulator standing in front of no seam — which is exactly the right check for the ten simulators
 * that answer a feed, and exactly the wrong shape for the one that answers a batch. The registry
 * would need a feed-less path to hold this, and adding one is a change to a file this work was told
 * not to touch. It is written up in the report rather than worked around here.
 *
 * The cost, said plainly: `coverage()` will not list this, and `emit('devices', …)` throws. Nothing
 * hides that. The devices capability's simulation notice renders on the kit screens exactly as the
 * other four do, because the notice comes from the contract and not from the registry.
 *
 * ── The three refusals ───────────────────────────────────────────────────────────────────────
 *
 *  1. **It may not open a Bluetooth or eSIM session.** There is no transport in this file and there
 *     is no library that could be one — the whole service has no dependencies. What a caller *can*
 *     do is ask for a live session, and asking is refused rather than ignored, because an ignored
 *     request is a request somebody believes was honoured. `scripts/check-boundaries.mjs` holds the
 *     other half: no source under `apps/api/src/simulation` may name a radio at all.
 *  2. **It may not declare a device permission on either native app.** Not this file's to declare,
 *     and that is the point — the build already refuses a permission no capability names under
 *     `requiresPermissions`, and the added check says that a capability whose simulation refuses to
 *     declare one may not name one. Working around that check would be the defect, not the fix.
 *  3. **It may not produce a reading without its provenance mark.** Two marks, and they are
 *     different things. `provenance` is the capture contract's own required field — exactly one of
 *     four, no default and no unknown — and it is `device`, because the shape being stood in for is
 *     an instrument's. The *simulation* mark is separate and is on the device id and inside the
 *     sealed bytes, so that what the ledger keeps for ever says a fixture produced it. A reading
 *     missing either is refused here rather than filed.
 *
 * ── The provenance decision, because it is a judgement and should be argued with ─────────────
 *
 * `packages/catalog/capture.json` declares four provenances and none of them is "simulated". Adding
 * a fifth would change a clinical contract on three platforms and in two generated files to describe
 * a fixture, which is the tail wagging the dog. Marking a simulated reading `manual` would be worse:
 * it would attribute it to a clinician who typed nothing. So the provenance stays `device` — the
 * honest description of the *shape* — and the simulation is marked on the envelope and in the bytes,
 * where a reader of the ledger cannot miss it and where no clinical contract had to be bent.
 */
import capture from '../../../../packages/catalog/capture.json' with { type: 'json' };
import { isProvenance, type Batch, type QueuedEntry } from '../capture/contract.ts';
import { noticeOf, refusalSaying, supplierOf } from './contract.ts';
import { seeded, type SimulationRequest } from './index.ts';

const CAPABILITY = 'devices';

type Instrument = { id: string; name: string; measures: string[]; transport: string; calibrateEveryMonths: number; note: string };
export const INSTRUMENTS = capture.devices as readonly Instrument[];

/**
 * The mark, on the envelope and in the bytes.
 *
 * Deliberately not subtle and deliberately not configurable. A reading whose only sign of being
 * simulated is a flag somebody can turn off is a reading that will be read as real the first time
 * somebody turns it off.
 */
export const SIMULATED_MARK = 'SIMULATED';
const markedDeviceId = (instrumentId: string, run: string): string => `${SIMULATED_MARK}-${instrumentId}-${run}`;

/** The provenance a simulated reading carries. See the note at the top of this file — it is a judgement. */
export const PROVENANCE = 'device';
/* Asked of the capture contract at module load rather than trusted, because the whole of the third
   refusal rests on this field being one the catalogue recognises. A provenance nothing declares is
   the "no default and no unknown" rule broken by the file that was meant to honour it. */
if (!isProvenance(PROVENANCE)) throw new Error(`packages/catalog/capture.json no longer declares a "${PROVENANCE}" provenance, and a simulated reading has nothing to carry.`);

/** What a caller gets back: a batch the real intake will take, and the sentence a screen must show with it. */
export type SimulatedInstrumentReading = {
 /** The capability's simulation notice, word for word, so a surface cannot render the reading more quietly. */
 notice: string;
 /** What this stands in for, in the contract's own words. */
 supplier: string;
 instrument: Instrument;
 batch: Batch;
};

export type SimulatedInstrumentRefusal = {
 /** Not a feed. The seam this answers is the capture intake, and saying so is the honest form of the wall. */
 seam: 'apps/api/src/capture/**';
 capability: string;
 reference: string;
 at: string;
 /** One of the sentences in this capability's `simulation.refuses`, word for word. */
 refused: string;
};

export const isInstrumentRefusal = (answer: SimulatedInstrumentReading | SimulatedInstrumentRefusal): answer is SimulatedInstrumentRefusal =>
 Object.prototype.hasOwnProperty.call(answer, 'refused');

export type InstrumentDetail = {
 /** Which instrument out of packages/catalog/capture.json. Defaults to one chosen off the subject. */
 instrumentId?: string;
 /** The record this reading is against, and the slot of it. */
 recordType?: string;
 recordId?: string;
 field?: string;
 capability?: string;
 sawRecordVersion?: number;
 /** Asking for a live radio session. Refused, loudly, rather than ignored. */
 openSession?: boolean;
 /** Dropping the mark. Refused, because a reading without it is indistinguishable from a real one. */
 withoutTheMark?: boolean;
};

const refusal = (request: SimulationRequest, sentence: string): SimulatedInstrumentRefusal => {
 const rand = seeded(`instrument:${request.subject}`);
 return {
  seam: 'apps/api/src/capture/**',
  capability: CAPABILITY,
  /* Ours, never a device's. The capture ledger writes an entry id down, and a device id read off a
     request body is a claim — which is the whole reason device binding is what blocks this. */
  reference: `SIM-INST-${Math.floor(rand() * 900000 + 100000)}`,
  at: (request.at ?? new Date()).toISOString(),
  refused: sentence
 };
};

/**
 * One reading, as an instrument that has been offline would sync it.
 *
 * The payload is the mark and nothing else. There is no systolic pressure in these bytes and there
 * could not be: the capture module holds a commitment to sealed bytes rather than the bytes, so a
 * value put in here would be sealed, handed back to the device and forgotten — and a simulator that
 * fabricated a clinical value in order to have something to seal would be inventing a reading about
 * a person who does not exist, in a service whose boundary check fails the build on a clinical table.
 */
export function reading(request: SimulationRequest): SimulatedInstrumentReading | SimulatedInstrumentRefusal {
 const detail = (request.detail ?? {}) as InstrumentDetail;

 /* Asked first. A caller that wanted a radio and got a fixture without being told is a caller that
    will report the pairing works. */
 if (detail.openSession) return refusal(request, refusalSaying(CAPABILITY, /Bluetooth or eSIM/i));
 if (detail.withoutTheMark) return refusal(request, refusalSaying(CAPABILITY, /provenance mark/i));

 const rand = seeded(`instrument:${request.subject}`);
 const instrument = INSTRUMENTS.find(entry => entry.id === detail.instrumentId) ?? INSTRUMENTS[Math.floor(rand() * INSTRUMENTS.length)]!;
 const at = request.at ?? new Date();
 const deviceId = markedDeviceId(instrument.id, String(Math.floor(rand() * 900000 + 100000)));

 const entry: QueuedEntry = {
  entryId: `${SIMULATED_MARK}-${instrument.id}-${request.subject}`,
  recordType: detail.recordType ?? 'visit',
  recordId: detail.recordId ?? request.subject,
  subjectId: request.subject,
  field: detail.field ?? instrument.measures[0]!,
  capability: detail.capability ?? 'take-visit',
  provenance: PROVENANCE,
  believedCapturedAt: at.getTime(),
  sawRecordVersion: detail.sawRecordVersion ?? 1,
  payload: new TextEncoder().encode(`${SIMULATED_MARK}:${instrument.id}:${request.subject}`)
 };

 /* The guard rather than the comment. Both marks are asserted on the way out, so a refactor that
    renames one of them fails here instead of producing a reading nothing distinguishes from real. */
 const marked = deviceId.startsWith(SIMULATED_MARK)
  && entry.entryId.startsWith(SIMULATED_MARK)
  && new TextDecoder().decode(entry.payload).startsWith(SIMULATED_MARK);
 if (!marked || !entry.provenance) return refusal(request, refusalSaying(CAPABILITY, /provenance mark/i));

 return {
  notice: noticeOf(CAPABILITY),
  supplier: supplierOf(CAPABILITY),
  instrument,
  batch: {
   deviceId,
   actor: { id: request.subject, role: 'nurse', purpose: 'treatment' },
   /* The device's own clock, which the capture contract records as what the device believed rather
      than as when anything happened. A simulated instrument's clock is right, which is the least
      interesting of the four conflicts and the only honest thing to claim about a fixture. */
   believedSentAt: at.getTime(),
   entries: [entry]
  }
 };
}
