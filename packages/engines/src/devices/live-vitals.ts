/* The live vitals board's arithmetic: what each stream reads at reading number `tick`, and what it says
 * about the record's reference range.
 *
 * WHY A PURE FUNCTION OF THE READING'S NUMBER. The Lovable export's board ran a random walk on a module
 * timer, so no two screens agreed and no test could say what the next value would be. Here a reading is
 * worked out from the scenario, the patient, the stream and the reading's number alone — the preset's
 * baseline at that step plus a jitter from Park and Miller's generator — so the doctor's Triage page, the
 * consultation beside it and the generated copy on both phones show the same numbers, and the sparkline is
 * just the last twelve readings worked out again. Nothing here holds state, reads a clock or calls
 * Math.random; the screen holds the reading's number and when the scenario started, and nothing else.
 *
 * WHAT IT REFUSES TO KNOW. Whether a reading is concerning. It says whether a value is inside, below or
 * above the record's indicative range, in the record's own numbers, because records.json#observations
 * holds them; it never ranks, scores, colours or adds readings together, because no triage protocol is
 * ratified (packages/catalog/clinical.json#triage.triageProtocols). Every reading it produces carries
 * source "simulator" and quality "synthetic", the simulator's own marks.
 *
 * The baselines are packages/catalog/devices/simulator-presets.json's, through simulator.ts. */
import board from '../../../catalog/live-vitals.json' with { type: 'json' };
import records from '../../../catalog/records.json' with { type: 'json' };
import capture from '../../../catalog/capture.json' with { type: 'json' };
import devices from '../../../catalog/devices.json' with { type: 'json' };
import { getPreset, listPresets } from './simulator.ts';

export type RangePlace = 'inside' | 'below' | 'above';

export interface LiveStream {
 readonly id: string;
 readonly measure: string;
 readonly label: string;
 readonly unit: string;
 readonly low: number;
 readonly high: number;
 readonly step: number;
 /** The instrument this stream stands for: capture.json's name, or devices.json's own-device source. */
 readonly instrument: string;
 readonly standsFor: 'kit-instrument' | 'own-device';
 readonly presetType: string;
 readonly jitter: number;
 readonly ceiling: number | null;
}

export interface LiveReading {
 readonly stream: string;
 readonly tick: number;
 readonly value: number;
 /** Milliseconds after the scenario started; negative for a reading the preset placed in the past. */
 readonly atOffsetMs: number;
 readonly source: 'simulator';
 readonly quality: 'synthetic';
}

const measures = records.observations.measures;
const instruments = capture.devices;
const ownDevice = devices.sources.find(s => s.id === 'own-device')!;

export const pace = board.pace;
export const words = board.board;
export const refusals = board.refusals;
export const simulatedClass = devices.deviceClasses.find(c => c.id === 'simulator')!;
export const simulatedMark = devices.marks.find(m => m.id === 'simulated')!;
export const deviceProvenance = capture.provenance.find(p => p.id === 'device')!;
export const rangeNote = records.consultation.sections.find(s => s.id === 'observations')!.note!;

export const streams: readonly LiveStream[] = board.streams.map(s => {
 const m = measures.find(x => x.id === s.measure);
 if (!m) throw new Error(`live-vitals.json streams ${s.measure}, which records.json#observations does not hold`);
 const instrument = s.instrument ? instruments.find(d => d.id === s.instrument) : null;
 if (s.instrument && !instrument) throw new Error(`live-vitals.json names the instrument ${s.instrument}, which capture.json does not hold`);
 return {
  id: s.id, measure: m.id, label: m.label, unit: m.unit, low: m.low, high: m.high, step: m.step,
  instrument: instrument ? instrument.name : ownDevice.label,
  standsFor: s.standsFor as LiveStream['standsFor'],
  presetType: s.presetType, jitter: s.jitter, ceiling: (s as { ceiling?: number }).ceiling ?? null
 };
});

/* What the board cannot stream, worked out from the two contracts rather than typed: an instrument whose
   measures the record does not hold, and a measure the record holds that no instrument measures. */
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
export const notStreamed: readonly string[] = [
 ...instruments.filter(d => d.measures.some(id => !measures.some(m => m.id === id)))
  .map(d => fill(board.notStreamed.noMeasure, { instrument: d.name, measures: d.measures.filter(id => !measures.some(m => m.id === id)).map(id => `“${id}”`).join(' or ') })),
 ...measures.filter(m => !instruments.some(d => d.measures.includes(m.id)))
  .map(m => fill(board.notStreamed.noInstrument, { measure: m.label }))
];

export const scenarios = listPresets();

/* ---- The generator ---------------------------------------------------------------------------------- */

const { modulus: MOD, multiplier: MUL, tickStride, streamStride } = board.jitter;

/** A patient's seed: their reference folded over UTF-16 code units, never nought. */
export function seedOf(subject: string): number {
 let h = 0;
 for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) % MOD;
 return h === 0 ? 1 : h;
}

/** A number in [0, 1) for this patient, reading and stream; the same on every platform. */
export function unitAt(seed: number, tick: number, streamIndex: number): number {
 let x = (seed + tick * tickStride + streamIndex * streamStride) % MOD;
 if (x === 0) x = 1;
 x = (x * MUL) % MOD;
 x = (x * MUL) % MOD;
 return x / MOD;
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;
/** A value on the measure's own step, written to as many places as the step has. */
export function onStep(value: number, step: number): number {
 return Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
}

/** A reading, to as many places as its step has: 37.0 °C, never 37. */
export const formatValue = (stream: LiveStream, value: number) => value.toFixed(decimalsOf(stream.step));

/** The preset's offsets at or after the scenario's start, in order. A preset with none sends nothing live. */
function liveOffsets(presetId: string): number[] {
 const preset = getPreset(presetId);
 return preset ? [...new Set(preset.readings.map(r => r.timestamp_offset_ms))].filter(o => o >= 0).sort((a, b) => a - b) : [];
}

/** The preset's value for a type at the step reading `tick` falls in, or null when the preset has none. */
function baselineAt(presetId: string, presetType: string, tick: number): number | null {
 const preset = getPreset(presetId);
 const offsets = liveOffsets(presetId);
 if (!preset || !offsets.length) return null;
 const at = offsets[Math.min(Math.floor(tick / pace.ticksPerStep), offsets.length - 1)];
 const held = preset.readings.filter(r => r.type === presetType && r.timestamp_offset_ms >= 0 && r.timestamp_offset_ms <= at)
  .sort((a, b) => b.timestamp_offset_ms - a.timestamp_offset_ms);
 return held.length ? held[0].value : null;
}

/** Reading number `tick` of one stream, or null when the scenario sends nothing from its instrument. */
export function readingAt(presetId: string, seed: number, streamIndex: number, tick: number): LiveReading | null {
 const s = streams[streamIndex];
 const base = baselineAt(presetId, s.presetType, tick);
 if (base === null) return null;
 let value = onStep(base + (unitAt(seed, tick, streamIndex) * 2 - 1) * s.jitter, s.step);
 if (s.ceiling !== null) value = Math.min(value, s.ceiling);
 return { stream: s.id, tick, value, atOffsetMs: tick * pace.tickMs, source: 'simulator', quality: 'synthetic' };
}

/** The last `pace.history` readings of a stream up to and including `tick`, oldest first. A preset that
    places every reading in the past (the stale one) sends nothing live: its own readings are returned as
    they are, at their own offsets, and nothing is added to them. */
export function historyAt(presetId: string, seed: number, streamIndex: number, tick: number): LiveReading[] {
 const s = streams[streamIndex];
 if (!liveOffsets(presetId).length) {
  const preset = getPreset(presetId);
  return (preset?.readings ?? []).filter(r => r.type === s.presetType).sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms)
   .map((r, i) => ({ stream: s.id, tick: i, value: onStep(r.value, s.step), atOffsetMs: r.timestamp_offset_ms, source: 'simulator' as const, quality: 'synthetic' as const }))
   .slice(-pace.history);
 }
 const out: LiveReading[] = [];
 for (let t = Math.max(0, tick - pace.history + 1); t <= tick; t++) {
  const r = readingAt(presetId, seed, streamIndex, t);
  if (r) out.push(r);
 }
 return out;
}

/** Whether the scenario streams at all: false for a preset whose every reading is in the past. */
export const streamsLive = (presetId: string) => liveOffsets(presetId).length > 0;

/** Where a value stands against the record's indicative range. Words, never a severity. */
export function rangePlace(stream: LiveStream, value: number): RangePlace {
 return value < stream.low ? 'below' : value > stream.high ? 'above' : 'inside';
}

/** How long ago, in the board's words. */
export function agoWords(ms: number): string {
 const s = Math.max(0, Math.floor(ms / 1000));
 if (s < 2) return words.justNow;
 if (s < 60) return fill(words.secondsAgo, { n: String(s) });
 if (s < 3600) return fill(words.minutesAgo, { n: String(Math.floor(s / 60)) });
 return fill(words.hoursAgo, { n: String(Math.floor(s / 3600)) });
}

export { fill };
