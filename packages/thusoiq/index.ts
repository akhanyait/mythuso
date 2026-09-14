import { appointments } from './appointments.ts';
import { consultations } from './consultations.ts';
import { diagnosis } from './diagnosis.ts';
import { dispensary } from './dispensary.ts';
import { wearables } from './wearables.ts';
import { patientIn, refuse, requireThat } from './guards.ts';
import { bounds } from './contract.ts';
import type { Actor, Command, State, ThusoIQPort } from './types.ts';
export * from './types.ts';
export { latestSample, sampleFreshness } from './wearables.ts';
export { refusal, label, soapKeys, thusoiq, bounds } from './contract.ts';

/** One in-memory kernel per host session; all five engines commit atomically through this seam.
 * The actor resolver belongs to the host. A real adapter must authenticate and authorise before
 * invoking this kernel. This module contains no credentials, clinical model or provider client. */
export function createThusoIQ(initial: State, actor: () => Actor, clock: () => string = () => new Date().toISOString()): ThusoIQPort {
 let state = structuredClone(initial);
 const listeners = new Set<() => void>();
 const receipts = new Map<string, string>();
 return {
  mode: 'sandbox',
  snapshot: () => structuredClone(state),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  execute(command: Command, options) {
   const who = actor();
   /* Above the role check on purpose: a lapsed doctor is stopped before the kernel has to reason
      about what doctors may do. */
   if (!who.verified) refuse('forbidden', 'verification-required');
   requireThat(!!options.idempotencyKey && options.idempotencyKey.length <= bounds.idempotencyKeyCharacters.max, 'idempotency-key-required');
   const fingerprint = JSON.stringify({ actor: who.id, role: who.role, command });
   const key = `${who.id}:${options.idempotencyKey}`;
   const prior = receipts.get(key);
   if (prior) {
    /* A replay returns what the first attempt returned. A key reused for a different command is a
       collision, and answering it with the earlier result would report something that never ran. */
    if (prior !== fingerprint) refuse('conflict', 'idempotency-key-reused');
    return { state: structuredClone(state), replayed: true };
   }
   if (state.revision !== options.expectedRevision) refuse('conflict', 'stale-revision');
   const next = structuredClone(state), now = clock();
   patientIn(next, command.patientId);
   if (command.type.startsWith('appointment.')) appointments(next, command, who, now);
   else if (command.type.startsWith('consultation.')) consultations(next, command, who, now);
   else if (command.type.startsWith('diagnosis.')) diagnosis(next, command, who);
   else if (command.type.startsWith('dispensary.')) dispensary(next, command, who, now);
   else if (command.type.startsWith('wearable.')) wearables(next, command, who, now);
   else refuse('invalid', 'unknown-command');
   next.revision += 1;
   next.events.push({ sequence: next.revision, revision: next.revision, at: now, actorId: who.id, action: command.type, patientId: command.patientId });
   next.events = next.events.slice(-bounds.auditBuffer.max);
   state = next;
   const receipt = { state: structuredClone(state), replayed: false };
   receipts.set(key, fingerprint);
   // A UI subscriber cannot roll back an accepted command or make it appear to have failed.
   for (const listener of listeners) { try { listener(); } catch { /* host owns its UI errors */ } }
   return receipt;
  }
 };
}
