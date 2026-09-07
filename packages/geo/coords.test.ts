import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
 SA_BOUNDS, distanceKm, distanceMetres, fromLngLat, inferTupleOrder, isFiniteCoordinate,
 isInsideSouthAfrica, kmToBoxUnits, orderTuple, projectToSquare, toLngLat, type MapWindow
} from './coords.ts';

const RANDBURG = { lat: -26.094, lng: 27.999 };
const ROSEBANK = { lat: -26.146, lng: 28.042 };
const SOWETO = { lat: -26.253, lng: 27.904 };

describe('the tuple order that burns every mapping project', () => {
 test('an object becomes [lng, lat], never [lat, lng]', () => {
  assert.deepEqual(toLngLat(RANDBURG), [27.999, -26.094]);
 });
 test('and comes back the same', () => {
  assert.deepEqual(fromLngLat(toLngLat(ROSEBANK)), ROSEBANK);
 });
 test('reads South African tuples the right way round', () => {
  assert.equal(inferTupleOrder([27.999, -26.094]), 'lng-lat');
  assert.equal(inferTupleOrder([-26.094, 27.999]), 'lat-lng');
 });
 test('says "unknown" rather than guessing at an ambiguous pair', () => {
  assert.equal(inferTupleOrder([10, 20]), 'unknown');
  assert.equal(inferTupleOrder([-10, -20]), 'unknown');
 });
 test('only swaps the tuples it is sure about', () => {
  assert.deepEqual(orderTuple([27.999, -26.094]), [27.999, -26.094]);
  assert.deepEqual(orderTuple([-26.094, 27.999]), [27.999, -26.094]);
  assert.deepEqual(orderTuple([10, 20]), [10, 20]);
 });
});

describe('is this a coordinate at all', () => {
 test('accepts real points anywhere on Earth', () => {
  assert.equal(isFiniteCoordinate(RANDBURG), true);
  assert.equal(isFiniteCoordinate({ lat: 37.3318, lng: -122.0312 }), true, 'Cupertino is a real place; it is just not one of ours');
 });
 test('refuses nothing, NaN and values off the globe', () => {
  assert.equal(isFiniteCoordinate(null), false);
  assert.equal(isFiniteCoordinate(undefined), false);
  assert.equal(isFiniteCoordinate({ lat: NaN, lng: 28 }), false);
  assert.equal(isFiniteCoordinate({ lat: 91, lng: 28 }), false);
  assert.equal(isFiniteCoordinate({ lat: -26, lng: 181 }), false);
 });
});

describe('is this a coordinate in South Africa', () => {
 test('accepts Johannesburg', () => {
  for (const p of [RANDBURG, ROSEBANK, SOWETO]) assert.equal(isInsideSouthAfrica(p), true);
 });
 test('refuses Cupertino, London, Tokyo and null-island', () => {
  for (const p of [{ lat: 37.3318, lng: -122.0312 }, { lat: 51.5074, lng: -0.1278 }, { lat: 35.6762, lng: 139.6503 }, { lat: 0, lng: 0 }])
   assert.equal(isInsideSouthAfrica(p), false, JSON.stringify(p));
 });
 test('the box is generous on purpose, and Harare is still well outside it', () => {
  assert.equal(isInsideSouthAfrica({ lat: -17.8, lng: 31.0 }), false);
  assert.equal(SA_BOUNDS.maxLat, -22);
 });
});

describe('distance, as the crow flies and no further', () => {
 test('Randburg to Rosebank is about six kilometres', () => {
  const km = distanceKm(RANDBURG, ROSEBANK);
  assert.ok(km > 5 && km < 8, `expected about 6 km, got ${km.toFixed(2)}`);
 });
 test('Rosebank to Soweto is about eighteen', () => {
  const km = distanceKm(ROSEBANK, SOWETO);
  assert.ok(km > 16 && km < 20, `expected about 18 km, got ${km.toFixed(2)}`);
 });
 test('a point is no distance from itself', () => {
  assert.ok(distanceMetres(SOWETO, SOWETO) < 0.01);
 });
 test('and the distance is the same in either direction', () => {
  assert.ok(Math.abs(distanceMetres(RANDBURG, SOWETO) - distanceMetres(SOWETO, RANDBURG)) < 0.01);
 });
});

describe('projecting coordinates onto a square, so a drawing cannot drift from its data', () => {
 const window: MapWindow = { centre: { lat: -26.171, lng: 27.975 }, spanKm: 30 };
 test('the centre of the window is the centre of the box', () => {
  const p = projectToSquare(window.centre, window);
  assert.ok(Math.abs(p.x - 50) < 0.001 && Math.abs(p.y - 50) < 0.001);
 });
 test('north is up and east is right', () => {
  const north = projectToSquare({ lat: -26.081, lng: 27.975 }, window);
  const east = projectToSquare({ lat: -26.171, lng: 28.075 }, window);
  assert.ok(north.y < 50, 'a more northerly point must sit higher on the page');
  assert.ok(east.x > 50, 'a more easterly point must sit further right');
  assert.ok(Math.abs(north.x - 50) < 0.001, 'moving north must not move the point sideways');
 });
 test('the scale is the same on both axes — ten kilometres is ten kilometres either way', () => {
  const tenKmNorth = projectToSquare({ lat: window.centre.lat + 10 / 111.195, lng: window.centre.lng }, window);
  const tenKmEast = projectToSquare({ lat: window.centre.lat, lng: window.centre.lng + 10 / (111.195 * Math.cos(window.centre.lat * Math.PI / 180)) }, window);
  assert.ok(Math.abs((50 - tenKmNorth.y) - (tenKmEast.x - 50)) < 0.1, 'the square would be lying about proportions otherwise');
 });
 test('a radius in kilometres becomes a radius in box units at the same scale', () => {
  assert.ok(Math.abs(kmToBoxUnits(15, window) - 50) < 0.001, 'half the span is half the box');
  assert.equal(kmToBoxUnits(0, window), 0);
 });
 test('the real dispatch positions all land inside the box they are drawn in', () => {
  for (const p of [RANDBURG, ROSEBANK, SOWETO]) {
   const { x, y } = projectToSquare(p, window);
   assert.ok(x > 0 && x < 100 && y > 0 && y < 100, `${JSON.stringify(p)} projected to ${x}, ${y}`);
  }
 });
});
