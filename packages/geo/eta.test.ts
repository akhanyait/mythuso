import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { URBAN_SPEED_KMH, etaFromRoute, noEta, straightLineEta } from './eta.ts';
import { setCoordinateWarningSink } from './normalize.ts';
import { routeUnavailable, type RouteMeasured } from './routing.ts';

/* The refusals below all warn through the coordinate layer; silence them so a passing run is quiet. */
setCoordinateWarningSink(() => {});
afterEach(() => setCoordinateWarningSink(() => {}));

const ROSEBANK = { lat: -26.146, lng: 28.042 };
const PARKTOWN = { lat: -26.185, lng: 28.036 };
const SOWETO = { lat: -26.253, lng: 27.904 };
const measured = (over: Partial<RouteMeasured> = {}): RouteMeasured => ({
 status: 'ok', geometry: { type: 'LineString', coordinates: [[28.042, -26.146], [28.036, -26.185]] },
 distanceMetres: 5400, durationSeconds: 780, measuredAt: '2026-09-06T09:00:00.000Z', ageSeconds: 12, provider: 'test', ...over
});

describe('a straight line, said to be one', () => {
 test('derives the minutes from a distance and a speed, and shows its working', () => {
  const eta = straightLineEta(ROSEBANK, PARKTOWN);
  assert.equal(eta.basis, 'straight-line');
  assert.equal(eta.speedKmh, URBAN_SPEED_KMH);
  assert.ok(eta.distanceKm !== null && eta.distanceKm > 4 && eta.distanceKm < 5);
  assert.equal(eta.minutes, Math.round(eta.distanceKm! / URBAN_SPEED_KMH * 60), 'the number on screen must be the distance divided by the speed, and nothing else');
  assert.equal(eta.reason, null);
 });
 test('a longer trip takes longer', () => {
  assert.ok(straightLineEta(SOWETO, PARKTOWN).minutes! > straightLineEta(ROSEBANK, PARKTOWN).minutes!);
 });
 test('honours a speed the caller can point at', () => {
  const slow = straightLineEta(SOWETO, PARKTOWN, { speedKmh: 15 });
  const quick = straightLineEta(SOWETO, PARKTOWN, { speedKmh: 60 });
  assert.equal(slow.speedKmh, 15);
  assert.ok(slow.minutes! > quick.minutes! * 3.5, 'a quarter of the speed is roughly four times the time');
 });
 test('never returns zero minutes — somebody at the gate still has to reach the door', () => {
  const eta = straightLineEta(SOWETO, SOWETO);
  assert.equal(eta.distanceKm, 0);
  assert.equal(eta.minutes, 1);
 });
});

describe('nothing to go on', () => {
 test('no position to measure from', () => {
  const eta = straightLineEta(null, PARKTOWN);
  assert.equal(eta.minutes, null);
  assert.equal(eta.basis, 'none');
  assert.ok(eta.reason && eta.reason.length > 0, 'a null must always arrive with something a screen can print');
 });
 test('no position to measure to', () => {
  assert.equal(straightLineEta(ROSEBANK, { lat: null, lng: null }).minutes, null);
 });
 test('a simulator default is refused rather than estimated', () => {
  const eta = straightLineEta({ lat: 37.3318, lng: -122.0312 }, PARKTOWN);
  assert.equal(eta.minutes, null);
  assert.match(eta.reason ?? '', /Cupertino/i);
 });
 test('two valid South African positions most of a country apart are a data fault, not a long trip', () => {
  const eta = straightLineEta({ lat: -33.92, lng: 18.42 }, PARKTOWN);
  assert.equal(eta.minutes, null);
  assert.match(eta.reason ?? '', /coordinate fault/i);
  assert.ok(eta.distanceKm !== null, 'the distance is still reported, because it is the evidence');
 });
 test('no speed to divide by', () => {
  assert.equal(straightLineEta(ROSEBANK, PARKTOWN, { speedKmh: 0 }).minutes, null);
  assert.equal(straightLineEta(ROSEBANK, PARKTOWN, { speedKmh: -30 }).minutes, null);
 });
 test('noEta is always null, never zero, and always says why', () => {
  const eta = noEta('On a visit, and nothing here knows when it ends.');
  assert.equal(eta.minutes, null);
  assert.notEqual(eta.minutes, 0);
  assert.equal(eta.basis, 'none');
  assert.equal(eta.reason, 'On a visit, and nothing here knows when it ends.');
 });
});

describe('an arrival time from a measured route', () => {
 test('uses the provider’s own duration, and claims no speed of its own', () => {
  const eta = etaFromRoute(measured());
  assert.equal(eta.minutes, 13);
  assert.equal(eta.basis, 'route');
  assert.equal(eta.speedKmh, null, 'a measured duration was not derived from an assumed speed');
  assert.equal(eta.distanceKm, 5.4);
 });
 test('a stale route keeps its number and says it is the last one known', () => {
  const eta = etaFromRoute(measured({ status: 'stale', ageSeconds: 240 }));
  assert.equal(eta.minutes, 13);
  assert.equal(eta.basis, 'last-known-route');
  assert.equal(eta.ageSeconds, 240);
 });
 test('an unavailable route produces no number, and passes the reason through untouched', () => {
  const eta = etaFromRoute(routeUnavailable('No routing provider is connected.', 'none'));
  assert.equal(eta.minutes, null);
  assert.equal(eta.basis, 'none');
  assert.equal(eta.reason, 'No routing provider is connected.');
  assert.equal(eta.distanceKm, null, 'an unavailable route has no distance either — nothing is invented here');
 });
 test('a route with a nonsense duration is refused rather than rounded', () => {
  assert.equal(etaFromRoute(measured({ durationSeconds: Number.NaN })).minutes, null);
  assert.equal(etaFromRoute(measured({ durationSeconds: -60 })).minutes, null);
 });
 test('never zero minutes, however short the route', () => {
  assert.equal(etaFromRoute(measured({ durationSeconds: 4 })).minutes, 1);
 });
});

test('the rule: an unavailable route never becomes a straight line by itself', () => {
 /* The contract this whole layer exists to hold. etaFromRoute cannot see the two endpoints, so it
    could not substitute a straight line even if somebody wanted it to. A screen that wants one has
    to call straightLineEta by name, at its own call site, and label what it is showing. */
 const eta = etaFromRoute(routeUnavailable('The routing provider did not answer.'));
 assert.equal(eta.minutes, null);
 assert.notEqual(eta.basis, 'straight-line');
 assert.equal(etaFromRoute.length, 1, 'etaFromRoute takes a route and nothing else — it has no endpoints to fall back on');
});
