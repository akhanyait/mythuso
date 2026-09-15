/* The offline queue, arriving.
 *
 * A nurse in a house with no signal keeps working, and what she captured arrives later as a batch in
 * the order she took it. Four things can have changed while it waited, and they are
 * packages/catalog/capture.json's four conflicts — this module invents none and resolves them exactly
 * as that file says:
 *
 *   duplicate-observation  The same observation twice in one visit. Clinician decides; neither is applied.
 *   stale-write            The visit moved on — completed — while the reading waited. Clinician decides.
 *   vetting-lapsed         The capturer's standing lapsed between capture and arrival. Clinician decides.
 *   clock-skew             The phone's clock is ahead of the server's. The server's receipt time orders
 *                          it; the device's time is kept beside it as what the device believed. Applied.
 *
 * NOTHING IS MERGED. A conflict is shown back to the nurse by its operation reference and the
 * reading is not attached — not the newer one, not the device-stamped one, not the one from the
 * nurse in better standing. A timestamp does not win a clinical disagreement; a clinician does.
 *
 * A batch is idempotent by its reference: a phone that loses the answer and sends the batch again
 * gets the first answer back, and nothing is attached twice.
 *
 * Only captures travel this way. A start, a handover or a completion each asks something of somebody
 * at the moment it happens, and packages/catalog/care.json says why none is replayed from a queue. */
import { answer, type Answer } from './outcome.ts';
import { refuse, ROUTES, type CareContract } from './contract.ts';
import type { TrustReader } from './trust.ts';
import type { Caller } from './offers.ts';
import type { VisitDesk } from './visits.ts';

export type QueuedCapture = {
 readonly operationRef: string;
 readonly kind: 'capture';
 readonly appointmentRef: string;
 /** The observation in packages/catalog/records.json this reading is of. */
 readonly observationId: string;
 /** The Passport entry the gateway already wrote. */
 readonly observationRef: string;
 readonly capturedBy: string;
 readonly deviceAt: string;
};

export type ConflictShown = { readonly operationRef: string; readonly conflictId: string; readonly name: string; readonly detail: string };
export type Applied = { readonly operationRef: string; readonly receivedAt: string; readonly deviceBelieved: string; readonly clockSkew: boolean };
export type Received = {
 readonly acceptedCount: number;
 readonly conflictRefs: readonly string[];
 readonly conflicts: readonly ConflictShown[];
 readonly applied: readonly Applied[];
 /** Operations the visit would not take at all — a capture against a visit that has not started. */
 readonly refused: readonly { operationRef: string; statement: string }[];
 /** The route's own sentence, present whenever a conflict is shown. */
 readonly notMerged: string | null;
};

export class SyncIntake {
 #contract: CareContract;
 #visits: VisitDesk;
 #trust: TrustReader;
 #batches = new Map<string, Answer<Received>>();
 /** appointmentRef → observation ids already attached, which is what a duplicate is a duplicate of. */
 #observed = new Map<string, Set<string>>();

 constructor(options: { contract: CareContract; visits: VisitDesk; trust: TrustReader }) {
  this.#contract = options.contract;
  this.#visits = options.visits;
  this.#trust = options.trust;
 }

 receive(batch: { batchRef: string; operations: readonly QueuedCapture[] }, caller: Caller, now: Date): Answer<Received> {
  const seen = this.#batches.get(batch.batchRef);
  if (seen) return seen.ok ? answer(seen.value) : seen;
  const conflict = (id: string) => {
   const row = this.#contract.conflicts.find(c => c.id === id);
   if (!row) throw new Error(`packages/catalog/capture.json has lost the conflict "${id}".`);
   return row;
  };
  const conflicts: ConflictShown[] = [], applied: Applied[] = [], refused: { operationRef: string; statement: string }[] = [];
  const receivedAt = now.toISOString();
  for (const op of batch.operations) {
   const show = (id: string) => { const row = conflict(id); conflicts.push({ operationRef: op.operationRef, conflictId: row.id, name: row.name, detail: row.detail }); };
   if (op.capturedBy !== caller.clinicianRef) { refused.push({ operationRef: op.operationRef, statement: refuse(this.#contract, ROUTES.sync, 'caller-not-allowed').statement }); continue; }
   const visit = this.#visits.visit(op.appointmentRef);
   if (visit?.state === 'completed') { show('stale-write'); continue; }
   if (!this.#trust.standing(op.capturedBy).current) { show('vetting-lapsed'); continue; }
   const observed = this.#observed.get(op.appointmentRef) ?? new Set<string>();
   if (observed.has(op.observationId)) { show('duplicate-observation'); continue; }
   const attached = this.#visits.capture({ appointmentRef: op.appointmentRef, observationRefs: [op.observationRef] }, caller);
   if (!attached.ok) { refused.push({ operationRef: op.operationRef, statement: attached.statement }); continue; }
   observed.add(op.observationId);
   this.#observed.set(op.appointmentRef, observed);
   /* The server's clock is authoritative for order. A device clock ahead of it is recorded as what the
      device believed, and the reading is applied: conflict('clock-skew') is resolved by the server. */
   const skewed = Date.parse(op.deviceAt) > now.getTime();
   if (skewed) conflict('clock-skew');
   applied.push({ operationRef: op.operationRef, receivedAt, deviceBelieved: op.deviceAt, clockSkew: skewed });
  }
  const result = answer<Received>({
   acceptedCount: applied.length,
   conflictRefs: conflicts.map(c => c.operationRef),
   conflicts, applied, refused,
   notMerged: conflicts.length ? refuse(this.#contract, ROUTES.sync, 'conflict-not-merged').statement : null
  });
  this.#batches.set(batch.batchRef, result);
  return result;
 }
}
