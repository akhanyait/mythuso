import { allow, consentFor, requireThat } from './guards.ts';
import type { Actor, Command, State, WearableSample } from './types.ts';
export function wearables(state: State, command: Command, actor: Actor, now: string) {
 allow(actor, 'doctor', 'nurse');
 const connection = state.wearableConnections.find(c => c.patientId === command.patientId);
 requireThat(connection, 'No wearable connection exists for this patient.');
 if (command.type === 'wearable.connection') {
  requireThat(typeof command.enabled === 'boolean' && typeof command.consent === 'boolean', 'Connection and consent must be explicit.');
  if (command.enabled) { consentFor(state, command.patientId); requireThat(command.consent, 'Explicit wearable sharing consent is required.'); }
  connection.enabled = command.enabled; connection.consent = command.consent;
  if (!command.consent) { connection.enabled = false; state.samples = state.samples.filter(s => s.patientId !== command.patientId); connection.lastReceivedAt = undefined; }
 } else if (command.type === 'wearable.ingest') {
  consentFor(state, command.patientId);
  requireThat(connection.enabled && connection.consent, 'Wearable sharing is paused or consent has been withdrawn.');
  const sample = command.sample;
  requireThat(sample.patientId === command.patientId, 'The sample belongs to a different patient.');
  requireThat(sample.source === 'simulator', 'The sandbox accepts labelled simulator samples only.');
  requireThat(!!sample.id && !!sample.deviceId, 'Sample and device identifiers are required.');
  const expected = sample.metric === 'heart-rate' ? 'bpm' : sample.metric === 'steps' ? 'count' : null;
  requireThat(expected && sample.unit === expected && Number.isFinite(sample.value) && sample.value >= 0, 'Sample type, unit or numeric value is invalid.');
  requireThat(sample.quality === 'accepted' || sample.quality === 'poor-contact', 'Sample quality is required.');
  const measured = Date.parse(sample.measuredAt);
  requireThat(Number.isFinite(measured) && measured <= Date.parse(now) + 60_000, 'Sample time is invalid or in the future.');
  requireThat(!state.samples.some(s => s.id === sample.id && s.deviceId === sample.deviceId), 'Duplicate sample already received.');
  state.samples.push({ ...sample, receivedAt: now });
  // Bound the sandbox buffer. Latest values use measurement time, not arrival order.
  state.samples = state.samples.slice(-500); connection.lastReceivedAt = now;
 }
}
export function latestSample(samples: WearableSample[], patientId: string, metric: WearableSample['metric']) {
 return samples.filter(s => s.patientId === patientId && s.metric === metric && s.quality === 'accepted').sort((a,b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0] ?? null;
}
export function sampleFreshness(sample: WearableSample | null, now: string): 'missing' | 'recent' | 'stale' {
 return !sample ? 'missing' : Date.parse(now) - Date.parse(sample.measuredAt) > 5 * 60_000 ? 'stale' : 'recent';
}
