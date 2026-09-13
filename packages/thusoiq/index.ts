import { appointments } from './appointments.ts';
import { consultations } from './consultations.ts';
import { diagnosis } from './diagnosis.ts';
import { dispensary } from './dispensary.ts';
import { wearables } from './wearables.ts';
import { patientIn, requireThat } from './guards.ts';
import { EngineError, type Actor, type Command, type State, type ThusoIQPort } from './types.ts';
export * from './types.ts';
export { latestSample, sampleFreshness } from './wearables.ts';

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
   if (!who.verified) throw new EngineError('forbidden', 'Professional verification is required.');
   requireThat(!!options.idempotencyKey && options.idempotencyKey.length <= 200, 'An idempotency key is required.');
   const fingerprint = JSON.stringify({ actor: who.id, role: who.role, command });
   const key = `${who.id}:${options.idempotencyKey}`;
   const prior = receipts.get(key);
   if (prior) {
    if (prior !== fingerprint) throw new EngineError('conflict', 'This idempotency key was used for a different command.');
    return { state: structuredClone(state), replayed: true };
   }
   if (state.revision !== options.expectedRevision) throw new EngineError('conflict', 'The workspace changed. Refresh before trying again.');
   const next = structuredClone(state), now = clock();
   patientIn(next, command.patientId);
   if (command.type.startsWith('appointment.')) appointments(next, command, who, now);
   else if (command.type.startsWith('consultation.')) consultations(next, command, who, now);
   else if (command.type.startsWith('diagnosis.')) diagnosis(next, command, who);
   else if (command.type.startsWith('dispensary.')) dispensary(next, command, who, now);
   else if (command.type.startsWith('wearable.')) wearables(next, command, who, now);
   else throw new EngineError('invalid', 'Unknown engine command.');
   next.revision += 1;
   next.events.push({ sequence: next.revision, revision: next.revision, at: now, actorId: who.id, action: command.type, patientId: command.patientId });
   next.events = next.events.slice(-1000);
   state = next;
   const receipt = { state: structuredClone(state), replayed: false };
   receipts.set(key, fingerprint);
   // A UI subscriber cannot roll back an accepted command or make it appear to have failed.
   for (const listener of listeners) { try { listener(); } catch { /* host owns its UI errors */ } }
   return receipt;
  }
 };
}
