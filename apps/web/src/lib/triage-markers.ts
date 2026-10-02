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

/** The sentence a screen reader is given for a gauge, and the caption under it: the numbers, not the picture. */
export function bandsText(id: ObsId): string {
 const spec = measureSpec(id), line = lineFor(id);
 const act = [line.actAtOrBelow !== null && `≤ ${line.actAtOrBelow}`, line.actAtOrAbove !== null && `≥ ${line.actAtOrAbove}`].filter(Boolean).join(' or ');
 return `In range ${spec.low}–${spec.high} ${spec.unit}${act ? ` · act at ${act}` : ''}`;
}

/* ---- The preview's readings ------------------------------------------------------------------------
   A series per measure, oldest first; the latest is the last value. Taken at the door and never live. */
export type PreviewReading = { patientId: string; minutesAgo: number; intervalMinutes: number; by: string; series: Partial<Record<ObsId, number[]>> };
export const previewReadings = contract.preview.readings as readonly PreviewReading[];
export const readingsFor = (patientId: string) => previewReadings.find(r => r.patientId === patientId);

export type Marked = { spec: Measure; value: number | undefined; marker: MarkerId; series: readonly number[] };
/** Every measure, in the assessment's order, with its latest value, the marker it earns and the series behind it. */
export const markedFor = (patientId: string): Marked[] => {
 const set = readingsFor(patientId);
 return observations.map(spec => {
  const series = set?.series[spec.id] ?? [];
  const value = series.length ? series[series.length - 1] : undefined;
  return { spec, value, marker: markerFor(spec.id, value), series };
 });
};
export const formatReading = (spec: Measure, value: number) => (spec.step < 1 ? value.toFixed(1) : String(value));
/** The alert line a value has reached, in words — "≥ 39.1" — for the banner that names it. */
export const lineReached = (id: ObsId, value: number): string => {
 const line = lineFor(id);
 return line.actAtOrBelow !== null && value <= line.actAtOrBelow ? `≤ ${line.actAtOrBelow}` : `≥ ${line.actAtOrAbove}`;
};
/* ---- The sparkline --------------------------------------------------------------------------------
   The series on a scale that always includes the indicative range, so a flat line inside the band and a
   flat line above it never look alike. Coordinates are percentages of the box; the screen draws them. */
export type Spark = { points: string; band: { top: number; bottom: number }; last: { x: number; y: number } | null };
export function sparkFor(spec: Measure, series: readonly number[]): Spark {
 const lo = Math.min(spec.low, ...series), hi = Math.max(spec.high, ...series);
 const pad = Math.max((hi - lo) * 0.15, spec.step * 2);
 const min = lo - pad, max = hi + pad;
 const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
 const x = (i: number) => (series.length < 2 ? 100 : (i / (series.length - 1)) * 100);
 return {
  points: series.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' '),
  band: { top: y(spec.high), bottom: y(spec.low) },
  last: series.length ? { x: x(series.length - 1), y: y(series[series.length - 1]) } : null
 };
}
