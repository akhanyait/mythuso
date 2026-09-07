import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REALISTIC_DISPATCH_KM, normalizeSouthAfricaLngLat, setCoordinateWarningSink, toLngLatOrThrow, asLatLng, type CoordinateWarning } from './normalize.ts';

/* The layer is only worth what its tests are worth: every one of these is a coordinate that has
   reached production somewhere and drawn something absurd. Warnings are captured rather than
   printed, so a run is quiet and a missing warning fails a test instead of going unnoticed. */
const warnings: CoordinateWarning[] = [];
const capture = () => { warnings.length = 0; setCoordinateWarningSink(w => { warnings.push(w); }); };
afterEach(() => setCoordinateWarningSink(null));

const JUKSKEI_PARK = { lat: -26.045, lng: 27.979 };
const SOWETO = { lat: -26.253, lng: 27.904 };

describe('coordinates that are real', () => {
 test('accepts a Johannesburg position unchanged', () => {
  capture();
  const n = normalizeSouthAfricaLngLat(JUKSKEI_PARK, 'test');
  assert.equal(n.valid, true);
  assert.equal(n.lat, -26.045);
  assert.equal(n.lng, 27.979);
  assert.equal(n.autoCorrected, false);
  assert.equal(n.reason, null);
  assert.deepEqual(warnings, [], 'a good coordinate must not warn about anything');
 });
 test('accepts the corners of the country — Cape Town, Polokwane, Durban', () => {
  for (const p of [{ lat: -33.92, lng: 18.42 }, { lat: -23.90, lng: 29.45 }, { lat: -29.86, lng: 31.02 }])
   assert.equal(normalizeSouthAfricaLngLat(p, 'test').valid, true, JSON.stringify(p));
 });
 test('coerces strings, because a database column and a form field both arrive as text', () => {
  const n = normalizeSouthAfricaLngLat({ lat: '-26.045', lng: '27.979' }, 'test');
  assert.equal(n.valid, true);
  assert.equal(n.lat, -26.045);
  assert.equal(n.lng, 27.979);
 });
 test('asLatLng hands back a plain point, and nothing for a refused one', () => {
  assert.deepEqual(asLatLng(normalizeSouthAfricaLngLat(SOWETO, 'test')), SOWETO);
  assert.equal(asLatLng(normalizeSouthAfricaLngLat({ lat: 0, lng: 0 }, 'test')), null);
 });
});

describe('lat and lng the wrong way round', () => {
 test('swaps them back and says so, out loud, with the source named', () => {
  capture();
  const n = normalizeSouthAfricaLngLat({ lat: 27.979, lng: -26.045 }, 'nurse-device:N-114');
  assert.equal(n.valid, true);
  assert.equal(n.autoCorrected, true);
  assert.equal(n.lng, 27.979);
  assert.equal(n.lat, -26.045);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /Corrected reversed lat\/lng/);
  assert.match(warnings[0].message, /nurse-device:N-114/, 'the warning must name who handed the coordinate over, or the bug is never found');
 });
 test('does not swap a pair that was already right', () => {
  const n = normalizeSouthAfricaLngLat(JUKSKEI_PARK, 'test');
  assert.equal(n.autoCorrected, false);
 });
});

describe('coordinates that are not', () => {
 test('refuses nothing at all', () => {
  assert.equal(normalizeSouthAfricaLngLat(null, 'test').valid, false);
  assert.equal(normalizeSouthAfricaLngLat(undefined, 'test').valid, false);
  assert.equal(normalizeSouthAfricaLngLat({ lat: null, lng: null }, 'test').valid, false);
 });
 test('names null-island rather than calling it out of bounds', () => {
  const n = normalizeSouthAfricaLngLat({ lat: 0, lng: 0 }, 'test');
  assert.equal(n.valid, false);
  assert.match(n.reason ?? '', /null-island/i);
 });
 test('names the iOS Simulator default, which is the whole reason this file exists', () => {
  const n = normalizeSouthAfricaLngLat({ lat: 37.3318, lng: -122.0312 }, 'test');
  assert.equal(n.valid, false);
  assert.match(n.reason ?? '', /iOS Simulator|Cupertino/i);
 });
 test('refuses a tester in London or Tokyo', () => {
  assert.equal(normalizeSouthAfricaLngLat({ lat: 51.5074, lng: -0.1278 }, 'test').valid, false);
  assert.equal(normalizeSouthAfricaLngLat({ lat: 35.6762, lng: 139.6503 }, 'test').valid, false);
 });
 test('refuses NaN and text that is not a number', () => {
  assert.equal(normalizeSouthAfricaLngLat({ lat: NaN, lng: 28 }, 'test').valid, false);
  assert.equal(normalizeSouthAfricaLngLat({ lat: -26, lng: 'somewhere' }, 'test').valid, false);
  assert.match(normalizeSouthAfricaLngLat({ lat: -26, lng: 'somewhere' }, 'test').reason ?? '', /not a number/i);
 });
 test('refuses a value that is not even on the globe', () => {
  const n = normalizeSouthAfricaLngLat({ lat: 200, lng: -26 }, 'test');
  assert.equal(n.valid, false);
  assert.match(n.reason ?? '', /global/i);
 });
 test('warns on a refusal too, naming the source', () => {
  capture();
  normalizeSouthAfricaLngLat({ lat: 51.5074, lng: -0.1278 }, 'job_locations:read');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /job_locations:read/);
 });
});

describe('what a refusal carries', () => {
 test('keeps the source label on the way through, either way', () => {
  capture();
  assert.equal(normalizeSouthAfricaLngLat(JUKSKEI_PARK, 'patient:address').sourceLabel, 'patient:address');
  assert.equal(normalizeSouthAfricaLngLat({ lat: 37.33, lng: -122.03 }, 'navigator.geolocation').sourceLabel, 'navigator.geolocation');
 });
 test('keeps the raw input, so a screenshot of a diagnostic tells the whole story', () => {
  capture();
  const n = normalizeSouthAfricaLngLat({ lat: '37.33', lng: -122.03 }, 'test');
  assert.deepEqual(n.raw, { lat: '37.33', lng: -122.03 });
 });
 test('toLngLatOrThrow gives a vendor tuple for a good coordinate', () => {
  assert.deepEqual(toLngLatOrThrow(normalizeSouthAfricaLngLat(JUKSKEI_PARK, 'test')), [27.979, -26.045]);
 });
 test('toLngLatOrThrow refuses to hand a bad one on, and says who sent it', () => {
  capture();
  const bad = normalizeSouthAfricaLngLat({ lat: 37.3318, lng: -122.0312 }, 'job_locations:read');
  assert.throws(() => toLngLatOrThrow(bad), /job_locations:read/);
 });
});

test('the realism cap is the one the sibling project settled on', () => {
 assert.equal(MAX_REALISTIC_DISPATCH_KM, 300);
});

test('the 16,939 km regression: both endpoints are checked, so the call never happens', () => {
 capture();
 /* Exactly what leaked: a simulator's default position published as a live device location, and a
    real address to route it to. The straight-line distance between them is arithmetically correct
    and completely wrong, and no screen should ever be in a position to print it. */
 const simulator = normalizeSouthAfricaLngLat({ lat: 37.3318, lng: -122.0312 }, 'nurse-device:live');
 const patient = normalizeSouthAfricaLngLat(SOWETO, 'visit:address');
 assert.equal(simulator.valid, false);
 assert.equal(patient.valid, true);
 assert.equal(simulator.valid && patient.valid, false, 'nothing may be routed, drawn or timed unless both ends passed');
});
