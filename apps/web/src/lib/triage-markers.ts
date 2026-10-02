import contract from '../../../../packages/catalog/triage-markers.json' with { type: 'json' };
import { measureSpec, observations, type Measure, type ObsId } from './observations';

/* The safety markers on the doctor's Triage screen: green, amber, red, read from two contracts.
 *
 * WHERE THE NUMBERS ARE. The green band is the indicative adult range in records.json, read through
 * lib/observations.ts exactly as the nurse's assessment and the Passport read it, so "in range" cannot
 * mean one thing on Triage and another on the patient's file. The red lines are triage-markers.json's,
 * and that file is the officer's: the founder asked on 2 October 2026 for standard demo readings that
 * the Clinical Governance Lead changes and reviews later. Not one number is typed here.
 *
 * WHAT A MARKER IS NOT. It is per reading and never summed, so there is no total to rank a person by
 * and nothing that looks like a validated early-warning instrument. The board orders patients by their
 * single most urgent marker, which is a reading aid and says so; nothing escalates, notifies or decides
 * from a marker, and a patient who has not consented shows the refusal, never an empty green. */

export type MarkerId = 'in-range' | 'watch' | 'act' | 'none';
export type Line = { id: string; actAtOrBelow: number | null; actAtOrAbove: number | null };
export type Marker = (typeof contract.markers)[number];

export const words = contract.screen;
export const governance = contract.governance;
export const markers = contract.markers as readonly Marker[];
export const markerOf = (id: MarkerId) => markers.find(m => m.id === id)!;
export const lines = contract.lines as readonly Line[];
export const lineFor = (id: ObsId): Line => lines.find(l => l.id === id) ?? { id, actAtOrBelow: null, actAtOrAbove: null };
export const reviewed = governance.status === 'reviewed' && !!governance.reviewedBy && !!governance.reviewedOn;
/** The sentence over every marker: the demo warning until a review is written into the contract, then who and when. */
export const governanceLine = (): string => reviewed
 ? governance.reviewedBanner.replace('{reviewer}', String(governance.reviewedBy)).replace('{day}', String(governance.reviewedOn))
 : governance.banner;

/** Which marker a value earns. The alert line is asked first: where it touches the range's edge it is the more cautious. */
export function markerFor(id: ObsId, value: number | undefined): MarkerId {
 if (value === undefined || Number.isNaN(value)) return 'none';
 const { low, high } = measureSpec(id);
 const line = lineFor(id);
 if ((line.actAtOrBelow !== null && value <= line.actAtOrBelow) || (line.actAtOrAbove !== null && value >= line.actAtOrAbove)) return 'act';
 if (value < low || value > high) return 'watch';
 return 'in-range';
}

const urgency: Record<MarkerId, number> = { act: 3, watch: 2, 'in-range': 1, none: 0 };
export const moreUrgent = (a: MarkerId, b: MarkerId) => urgency[b] - urgency[a];
export const worstOf = (ids: readonly MarkerId[]): MarkerId => [...ids].sort(moreUrgent)[0] ?? 'none';

/* ---- The gauge -----------------------------------------------------------------------------------
   One horizontal scale per measure: red beyond each alert line, amber between the line and the range,
   green inside. The ends of the scale are derived — a margin past the outermost number the two
   contracts give — so a line moved by the officer moves the drawing with it. */
export type Gauge = { min: number; max: number; zones: { from: number; to: number; marker: MarkerId }[]; at: number | null };
export function gaugeFor(spec: Measure, value: number | undefined): Gauge {
 const line = lineFor(spec.id);
 const lo = line.actAtOrBelow ?? spec.low, hi = line.actAtOrAbove ?? spec.high;
 const pad = Math.max((hi - lo) * 0.18, spec.step * 4);
 const min = Math.min(lo - pad, value ?? Infinity), max = Math.max(hi + (line.actAtOrAbove === null ? 0 : pad), value ?? -Infinity);
 const zones: Gauge['zones'] = [];
 if (line.actAtOrBelow !== null) zones.push({ from: min, to: line.actAtOrBelow, marker: 'act' });
 zones.push({ from: line.actAtOrBelow ?? min, to: spec.low, marker: 'watch' });
 zones.push({ from: spec.low, to: spec.high, marker: 'in-range' });
 zones.push({ from: spec.high, to: line.actAtOrAbove ?? max, marker: 'watch' });
 if (line.actAtOrAbove !== null) zones.push({ from: line.actAtOrAbove, to: max, marker: 'act' });
 const pct = (v: number) => ((v - min) / (max - min)) * 100;
 return {
  min, max,
  zones: zones.filter(z => z.to > z.from).map(z => ({ ...z, from: pct(z.from), to: pct(z.to) })),
  at: value === undefined ? null : Math.min(100, Math.max(0, pct(value)))
 };
}

/** The sentence a screen reader is given for a gauge, and the caption under it: the numbers, not the picture. */
export function bandsText(id: ObsId): string {
 const spec = measureSpec(id), line = lineFor(id);
 const act = [line.actAtOrBelow !== null && `≤ ${line.actAtOrBelow}`, line.actAtOrAbove !== null && `≥ ${line.actAtOrAbove}`].filter(Boolean).join(' or ');
 return `In range ${spec.low}–${spec.high} ${spec.unit}${act ? ` · act at ${act}` : ''}`;
}

/* ---- The preview's readings ------------------------------------------------------------------------ */
export type PreviewReading = { patientId: string; minutesAgo: number; by: string; values: Partial<Record<ObsId, number>> };
export const previewReadings = contract.preview.readings as readonly PreviewReading[];
export const readingsFor = (patientId: string) => previewReadings.find(r => r.patientId === patientId);

export type Marked = { spec: Measure; value: number | undefined; marker: MarkerId };
/** Every measure, in the assessment's order, with the value and the marker it earns. */
export const markedFor = (patientId: string): Marked[] => {
 const set = readingsFor(patientId);
 return observations.map(spec => { const value = set?.values[spec.id]; return { spec, value, marker: markerFor(spec.id, value) }; });
};
export const formatReading = (spec: Measure, value: number) => (spec.step < 1 ? value.toFixed(1) : String(value));
