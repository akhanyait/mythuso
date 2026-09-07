import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { provinceByKey, provinceFor, provinces, provincesContaining } from './provinces.ts';

describe('the province table', () => {
 test('has all nine, each with a centroid inside its own rectangle', () => {
  assert.equal(provinces.length, 9);
  for (const p of provinces) {
   assert.ok(p.centre.lng >= p.bounds.minLng && p.centre.lng <= p.bounds.maxLng, `${p.name} centroid is outside its own box`);
   assert.ok(p.centre.lat >= p.bounds.minLat && p.centre.lat <= p.bounds.maxLat, `${p.name} centroid is outside its own box`);
  }
 });
 test('is addressable by key', () => {
  assert.equal(provinceByKey('GP')?.name, 'Gauteng');
  assert.equal(provinceByKey('ZZ'), undefined);
 });
});

describe('naming where a coordinate is', () => {
 test('Johannesburg is in Gauteng', () => {
  assert.equal(provinceFor({ lat: -26.171, lng: 27.975 })?.name, 'Gauteng');
 });
 test('Cape Town is in the Western Cape and Durban in KwaZulu-Natal', () => {
  assert.equal(provinceFor({ lat: -33.92, lng: 18.42 })?.name, 'Western Cape');
  assert.equal(provinceFor({ lat: -29.86, lng: 31.02 })?.name, 'KwaZulu-Natal');
 });
 test('a point near a border can be in more than one rectangle, and says so', () => {
  const both = provincesContaining({ lat: -26.0, lng: 28.05 });
  assert.ok(both.length >= 1);
  assert.equal(both[0].name, 'Gauteng', 'nearest centroid first');
 });
 test('a coordinate outside South Africa is named nothing at all', () => {
  /* The reason this function is not "nearest centroid": that answer would confidently call the
     middle of the Atlantic the Western Cape, and nobody would ever see the bug. */
  assert.equal(provinceFor({ lat: 37.3318, lng: -122.0312 }), null);
  assert.equal(provinceFor({ lat: 0, lng: 0 }), null);
  assert.equal(provinceFor({ lat: -17.8, lng: 31.0 }), null);
  assert.deepEqual(provincesContaining(null), []);
  assert.deepEqual(provincesContaining({ lat: NaN, lng: 28 }), []);
 });
});
