import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_STALE_AFTER_SECONDS, ageRoute, isRouteMeasured, noRoutingProvider, routeUnavailable, type RouteMeasured } from './routing.ts';

const MEASURED_AT = '2026-09-06T09:00:00.000Z';
const at = (secondsLater: number) => Date.parse(MEASURED_AT) + secondsLater * 1000;
const measured = (over: Partial<RouteMeasured> = {}): RouteMeasured => ({
 status: 'ok', geometry: { type: 'LineString', coordinates: [[28.042, -26.146], [28.036, -26.185]] },
 distanceMetres: 5400, durationSeconds: 780, measuredAt: MEASURED_AT, ageSeconds: 0, provider: 'test', ...over
});

describe('what a route is', () => {
 test('a measurement carries geometry, a distance, a duration and who measured it', () => {
  const route = measured();
  assert.equal(route.geometry.type, 'LineString');
  assert.equal(route.geometry.coordinates[0].length, 2);
  assert.equal(typeof route.distanceMetres, 'number');
  assert.equal(typeof route.durationSeconds, 'number');
  assert.equal(route.provider, 'test');
 });
 test('an unavailable route carries a reason and nothing else', () => {
  const route = routeUnavailable('The provider timed out.', 'someone');
  assert.equal(route.status, 'unavailable');
  assert.equal(route.reason, 'The provider timed out.');
  assert.equal(isRouteMeasured(route), false);
  assert.equal('geometry' in route, false, 'there is nowhere to put invented geometry');
  assert.equal('durationSeconds' in route, false);
 });
});

describe('stale is not unavailable', () => {
 test('a fresh measurement stays fresh', () => {
  const aged = ageRoute(measured(), at(30));
  assert.equal(aged.status, 'ok');
  assert.equal(isRouteMeasured(aged) && aged.ageSeconds, 30);
 });
 test('an old one goes stale and keeps everything it measured', () => {
  const aged = ageRoute(measured(), at(ROUTE_STALE_AFTER_SECONDS + 1));
  assert.equal(aged.status, 'stale');
  assert.equal(isRouteMeasured(aged) && aged.durationSeconds, 780, 'a measurement taken two minutes ago is still a measurement');
 });
 test('the threshold is a boundary, not a gradient', () => {
  assert.equal(ageRoute(measured(), at(ROUTE_STALE_AFTER_SECONDS)).status, 'ok');
  assert.equal(ageRoute(measured(), at(ROUTE_STALE_AFTER_SECONDS + 0.1)).status, 'stale');
 });
 test('a clock that has gone backwards does not produce a negative age', () => {
  const aged = ageRoute(measured(), at(-500));
  assert.equal(isRouteMeasured(aged) && aged.ageSeconds, 0);
 });
 test('a route with no usable measurement time becomes unavailable rather than eternally fresh', () => {
  const aged = ageRoute(measured({ measuredAt: 'not a time' }), at(10));
  assert.equal(aged.status, 'unavailable');
 });
 test('ageing an unavailable route leaves it exactly as it was', () => {
  const route = routeUnavailable('No provider.');
  assert.deepEqual(ageRoute(route, at(9000)), route);
 });
});

describe('the provider MyThuso actually runs on', () => {
 test('answers every request with an honest refusal', async () => {
  const result = await noRoutingProvider.route({ from: { lat: -26.146, lng: 28.042 }, to: { lat: -26.185, lng: 28.036 } });
  assert.equal(result.status, 'unavailable');
  assert.equal(isRouteMeasured(result), false);
  assert.match(result.status === 'unavailable' ? result.reason : '', /no routing provider/i);
 });
 test('and gives the screens the same answer a real provider gives when it is down', async () => {
  /* Which is the point of shipping it: nothing has to be written twice, and the unavailable path
     is the path that has been exercised since the first day. */
  const result = await noRoutingProvider.route({ from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0 } });
  assert.equal(result.status, 'unavailable');
 });
});
