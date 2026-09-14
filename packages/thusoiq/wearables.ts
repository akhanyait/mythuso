import { allow, consentFor, requireThat } from './guards.ts';
import { bounds, sampleQualities, sampleSources, unitFor } from './contract.ts';
import type { Actor, Command, State, WearableSample } from './types.ts';
export function wearables(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse');
 const connection = state.wearableConnections.find(c => c.patientId === command.patientId);
 requireThat(connection, 'no-connection');
 if (command.type === 'wearable.connection') {
  requireThat(typeof command.enabled === 'boolean' && typeof command.consent === 'boolean', 'connection-not-explicit');
  /* Care consent is not device consent. Agreeing to be treated at home is not agreeing to a
     continuous stream of your heart rate, and POPIA treats the second as its own purpose. */
  if (command.enabled) { consentFor(state, command.patientId); requireThat(command.consent, 'wearable-consent-required'); }
  connection.enabled = command.enabled; connection.consent = command.consent;
  /* Withdrawal deletes what has already arrived. A tap that is merely closed leaves the water in
     the bucket, and the bucket is somebody's heart rate. */
  if (!command.consent) { connection.enabled = false; state.samples = state.samples.filter(s => s.patientId !== command.patientId); connection.lastReceivedAt = undefined; }
 } else if (command.type === 'wearable.ingest') {
  consentFor(state, command.patientId);
  requireThat(connection.enabled && connection.consent, 'sharing-paused');
  const sample = command.sample;
  requireThat(sample.patientId === command.patientId, 'sample-wrong-patient');
  requireThat(sampleSources.includes(sample.source), 'sample-not-simulated');
  requireThat(!!sample.id && !!sample.deviceId, 'sample-unidentified');
  /* The unit map is the contract's. A mismatch is rejected rather than converted, because a kernel
     that quietly converts a unit will one day quietly convert the wrong one. */
  const expected = unitFor(sample.metric);
  requireThat(expected && sample.unit === expected && Number.isFinite(sample.value) && sample.value >= 0, 'sample-value-invalid');
  requireThat(sampleQualities.includes(sample.quality), 'sample-quality-required');
  const measured = Date.parse(sample.measuredAt);
  requireThat(Number.isFinite(measured) && measured <= Date.parse(now) + bounds.futureToleranceMs.max, 'sample-time-invalid');
  requireThat(!state.samples.some(s => s.id === sample.id && s.deviceId === sample.deviceId), 'sample-duplicate');
  state.samples.push({ ...sample, receivedAt: now });
  // Bound the sandbox buffer. Latest values use measurement time, not arrival order.
  state.samples = state.samples.slice(-bounds.sampleBuffer.max); connection.lastReceivedAt = now;
 }
}
export function latestSample(samples: WearableSample[], patientId: string, metric: WearableSample['metric']) {
 return samples.filter(s => s.patientId === patientId && s.metric === metric && s.quality === 'accepted').sort((a,b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0] ?? null;
}
export function sampleFreshness(sample: WearableSample | null, now: string): 'missing' | 'recent' | 'stale' {
 return !sample ? 'missing' : Date.parse(now) - Date.parse(sample.measuredAt) > bounds.sampleStaleAfterMs.max ? 'stale' : 'recent';
}
