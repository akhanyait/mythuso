/**
 * The simulated roster, and the four things it will not do.
 *
 * The point of these tests is not that a roster row comes back. It is that the refusals come back —
 * every sentence the capability declares is reachable from a request somebody would actually make,
 * in the contract's own words, and none of them is a sentence this file typed. A simulation that
 * refuses nothing is a fixture with a label on it, and a refusal nothing exercises is a comment.
 *
 * The shape is checked by running what comes out through the real door. `decide` is the ingestion
 * boundary the eleven feeds sit behind: it refuses everything, and *which* refusal it gives is the
 * assertion — `not-connected` is the answer reserved for a payload that was well-formed, carried no
 * forbidden field, no unknown field, nothing missing and nothing of the wrong type. So one call
 * proves the whole schema, against the code a real supplier will meet rather than against a copy of
 * the schema written here.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide, feedById } from '../src/feeds/index.ts';
import { refusalsOf } from '../src/simulation/contract.ts';
import { isRefusal, type SimulatedEvent } from '../src/simulation/index.ts';
import { SIMULATED_NURSES, isoIn, nurseRoster, rosterFor, shiftOn, zoneNamed } from '../src/simulation/care.ts';

const FEED = feedById('nurse-roster')!;
/* One moment, shared by the whole file, so that two assertions cannot land on different days at
   midnight. It is the real clock rather than a frozen one on purpose: every expiry in
   packages/catalog/roster.json is written relative to today so the fixture never goes stale, and a
   test pinned to a date would stop exercising that the day it was written. */
const NOW = new Date();
const answer = (subject: string, detail?: Record<string, unknown>) => nurseRoster.produce({ subject, at: NOW, detail });
const event = (subject: string): SimulatedEvent => {
 const produced = answer(subject);
 assert.ok(!isRefusal(produced), `${subject} was refused: ${isRefusal(produced) ? produced.refused : ''}`);
 return produced as SimulatedEvent;
};

describe('the simulated roster answers the feed it stands in for', () => {
 test('a rostered nurse produces a payload the ingestion boundary finds well-formed', () => {
  const produced = event('N-205');
  const refusal = decide(FEED, produced.payload);
  assert.equal(refusal.kind, 'not-connected');
  assert.equal(refusal.unknownFields, 0);
  assert.deepEqual(refusal.missing, []);
  assert.deepEqual(refusal.wrongType, []);
 });

 test('it carries the five fields the feed accepts and no sixth', () => {
  const declared = FEED.accepts.map(accepted => accepted.field).sort();
  assert.deepEqual(Object.keys(event('N-205').payload).sort(), declared);
 });

 test('nothing it produces names a field the feed would refuse, at any depth', () => {
  for (const nurse of SIMULATED_NURSES) {
   const produced = answer(nurse.id);
   if (isRefusal(produced)) continue;
   assert.equal(decide(FEED, produced.payload).forbidden, null, `${nurse.id} produced a forbidden field`);
  }
 });

 test('the zone is one geography.json declares, by its own id', () => {
  const produced = event('N-205');
  assert.ok(zoneNamed('Rosebank'));
  assert.equal(produced.payload.zone, zoneNamed('Rosebank')!.id);
 });
});

describe('every refusal the capability declares is reachable', () => {
 /* The list is read rather than written, so a sentence added to the contract fails here until
    somebody has made it fire. */
 const declared = refusalsOf('booking');
 const fired = new Set<string>();
 for (const subject of ['N-999', ...SIMULATED_NURSES.map(nurse => nurse.id)]) {
  const produced = answer(subject);
  if (isRefusal(produced)) fired.add(produced.refused);
 }

 test('a party outside the simulated register is refused rather than invented', () => {
  const produced = answer('N-999');
  assert.ok(isRefusal(produced));
  assert.equal(produced.refused, declared.find(sentence => sentence.includes('real person')));
 });

 test('a lapsed clearance withdraws the offer by arithmetic', () => {
  const produced = answer('N-204');
  assert.ok(isRefusal(produced), 'Sister Ayanda Dube has a police clearance that ran out nine days ago');
  assert.ok(produced.refused.includes('lapsed'));
 });

 test('an unfinished application is refused in different words from a lapse', () => {
  const lapsed = answer('N-204');
  const unfinished = answer('N-202');
  assert.ok(isRefusal(lapsed) && isRefusal(unfinished));
  assert.notEqual(lapsed.refused, unfinished.refused);
 });

 test('a zone dispatch cannot reach is refused before anything about the person is looked at', () => {
  const produced = answer('N-203');
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('zone dispatch can reach'));
 });

 test('all four of them fire, and none of them is a sentence this test typed', () => {
  assert.deepEqual([...fired].sort(), [...declared].sort());
 });
});

describe('what a booking screen gets back', () => {
 test('refusals come back beside the offers rather than being filtered away', () => {
  const soweto = rosterFor('soweto', isoIn(NOW), NOW);
  assert.ok(soweto.offered.length > 0);
  assert.ok(soweto.refused.length > 0, 'a silent filter cannot tell a patient why the nurse she asked for is missing');
  assert.ok(soweto.offered.every(offer => offer.payload.zone === 'soweto'));
 });

 test('the shift covers every hour the product offers', () => {
  const { startsAt, endsAt } = shiftOn('2026-03-04', NOW);
  assert.match(startsAt, /^2026-03-04T07:30:00[+-]\d{2}:\d{2}$/);
  assert.match(endsAt, /^2026-03-04T18:30:00[+-]\d{2}:\d{2}$/);
 });

 test('the same party yields the same row twice, because a roster is not random', () => {
  assert.deepEqual(event('N-206').payload, event('N-206').payload);
 });
});
