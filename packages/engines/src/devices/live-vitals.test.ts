/* The live vitals board's arithmetic: the same patient on the same scenario reads the same numbers every
   time; a reading stays within its stream's jitter of the preset's baseline and on the record's step; a
   scenario that has no reading for an instrument sends nothing from it rather than borrowing one; the
   stale preset sends nothing live; every reading is the simulator's; and what cannot be streamed is worked
   out from the record and the instrument list. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
 historyAt, notStreamed, onStep, pace, rangePlace, readingAt, refusals, scenarios, seedOf, streams, streamsLive, unitAt
} from './live-vitals.ts';
import { getPreset } from './simulator.ts';

const index = (id: string) => streams.findIndex(s => s.id === id);

test('a reading is a pure function of scenario, patient, stream and number', () => {
 const seed = seedOf('Lerato Molefe');
 for (let t = 0; t < 20; t++) assert.deepEqual(readingAt('sim.well', seed, 0, t), readingAt('sim.well', seed, 0, t));
 assert.notDeepEqual(
  streams.map((_, i) => readingAt('sim.well', seed, i, 5)?.value),
  streams.map((_, i) => readingAt('sim.well', seedOf('Sipho Dlamini'), i, 5)?.value));
 for (let t = 0; t < 200; t++) { const u = unitAt(seed, t, 3); assert.ok(u >= 0 && u < 1); }
});

test('values move over time, within the jitter of the baseline, on the record’s step', () => {
 const seed = seedOf('MT-10234');
 const sys = index('systolic');
 const values = Array.from({ length: 12 }, (_, t) => readingAt('sim.well', seed, sys, t)!.value);
 assert.ok(new Set(values).size > 3, 'a live stream that never changes is not live');
 for (const v of values) assert.ok(Math.abs(v - 120) <= streams[sys].jitter && Number.isInteger(v));
 const temp = index('temperature');
 for (let t = 0; t < 30; t++) {
  const v = readingAt('sim.well', seed, temp, t)!.value;
  assert.equal(v, onStep(v, 0.1));
  assert.ok(Math.abs(v - 36.8) <= 0.1 + 1e-9);
 }
 const oxygen = index('oxygen');
 for (let t = 0; t < 200; t++) assert.ok(readingAt('sim.well', seed, oxygen, t)!.value <= 100);
});

test('a preset that moves walks its steps, and holds the last', () => {
 const seed = seedOf('x');
 const ox = index('oxygen');
 const at = (t: number) => readingAt('sim.hypox', seed, ox, t)!.value;
 assert.ok(Math.abs(at(0) - 94) <= 1);
 assert.ok(Math.abs(at(pace.ticksPerStep * 2) - 88) <= 1);
 assert.ok(Math.abs(at(pace.ticksPerStep * 40) - 85) <= 1);
 const glucose = index('glucose');
 assert.ok(Math.abs(readingAt('sim.glucose', seed, glucose, pace.ticksPerStep * 3)!.value - 14.8) <= 0.2 + 1e-9);
});

test('an instrument the scenario has no reading for sends nothing', () => {
 assert.equal(readingAt('sim.hypox', 1, index('temperature'), 4), null);
 assert.deepEqual(historyAt('sim.hypox', 1, index('glucose'), 10), []);
});

test('the stale preset sends nothing live, and its own readings keep their offsets', () => {
 assert.equal(streamsLive('sim.stale'), false);
 const h = historyAt('sim.stale', 7, index('pulse'), 50);
 assert.equal(h.length, 1);
 assert.ok(h[0].atOffsetMs < -24 * 3600 * 1000);
 assert.equal(h[0].value, getPreset('sim.stale')!.readings.find(r => r.type === 'heart-rate')!.value);
});

test('every reading is the simulator’s, and the history is the last few only', () => {
 const h = historyAt('sim.well', 3, 0, 100);
 assert.equal(h.length, pace.history);
 assert.equal(h.at(-1)!.tick, 100);
 for (const r of h) { assert.equal(r.source, 'simulator'); assert.equal(r.quality, 'synthetic'); }
});

test('the range is the record’s, said as a place and never a severity', () => {
 const records = JSON.parse(readFileSync(new URL('../../../catalog/records.json', import.meta.url), 'utf8'));
 for (const s of streams) {
  const m = records.observations.measures.find((x: { id: string }) => x.id === s.measure);
  assert.equal(s.low, m.low); assert.equal(s.high, m.high); assert.equal(s.unit, m.unit);
  assert.equal(rangePlace(s, m.low), 'inside');
  assert.equal(rangePlace(s, m.low - s.step), 'below');
  assert.equal(rangePlace(s, m.high + s.step), 'above');
 }
});

test('each stream’s unit is the unit its preset readings carry', () => {
 for (const p of scenarios) for (const r of getPreset(p.id)!.readings) {
  const s = streams.find(x => x.presetType === r.type);
  if (s) assert.equal(r.unit, s.unit, `${p.id} sends ${r.type} in ${r.unit}, the record holds ${s.unit}`);
 }
});

test('what cannot be streamed is worked out, and the refusals stand', () => {
 assert.ok(notStreamed.some(line => line.startsWith('Weighing scale')));
 assert.ok(notStreamed.some(line => line.startsWith('Single-lead ECG')));
 assert.ok(notStreamed.some(line => line.startsWith('Respiratory rate')));
 assert.deepEqual(refusals.map(r => r.id), ['early-warning-score', 'device-triage', 'interpretation', 'threshold-alarms', 'risk-heatmap']);
});
