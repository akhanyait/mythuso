/**
 * The simulated dispatch path, with the Trust Score in it.
 *
 * The roster simulator already refuses a lapsed nurse, an unfinished application and a zone nobody
 * covers. These prove that the ranking a visit is offered from sits behind a fourth refusal — no
 * current Trust Score — and that it does so without disturbing the three before it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../../packages/catalog/trust.json' with { type: 'json' };
import { SIMULATED_NURSES, dispatchFor, trustScoreFor, zoneNamed } from '../src/simulation/roster.ts';
import { dayOf } from '../src/trust/index.ts';

const NOW = new Date();
const sentence = (id: string) => contract.refusals.find(r => r.id === id)!.sentence;
const soweto = zoneNamed('Soweto')!.id;

describe('dispatch ranks only people with a current Trust Score', () => {
 test('every nurse the roster clears is scored Verified today, and none of them carries a number', () => {
  const { ranked, withheld } = dispatchFor(soweto, NOW);
  assert.ok(ranked.length > 0);
  assert.deepEqual(withheld, []);
  for (const entry of ranked) {
   assert.equal(entry.tier, 'Verified');
   assert.equal(trustScoreFor(SIMULATED_NURSES.find(n => n.id === entry.partyId)!, NOW)!.value, null);
  }
 });

 test('proximity first: the nurses in the zone come before anybody further away', () => {
  const { ranked } = dispatchFor(soweto, NOW);
  const distances = ranked.map(entry => entry.km ?? Infinity);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  assert.equal(ranked[0]!.km, 0);
 });

 test('the roster\'s own refusals are untouched: a lapsed clearance is refused by the roster, not ranked', () => {
  const { ranked, refused } = dispatchFor(soweto, NOW);
  assert.ok(!ranked.some(entry => entry.partyId === 'N-204'));
  assert.ok(refused.some(answer => answer.refused.includes('lapsed')));
 });

 test('a cleared nurse with no current score is withheld, in the contract\'s sentence', () => {
  const { ranked, withheld } = dispatchFor(soweto, NOW, nurse => nurse.id === 'N-206' ? null : trustScoreFor(nurse, NOW));
  assert.ok(!ranked.some(entry => entry.partyId === 'N-206'));
  assert.deepEqual(withheld, [{ partyId: 'N-206', refusalId: 'no-score', refused: sentence('no-score') }]);
 });

 test('a score from yesterday is not current, and is refused in its own words', () => {
  const { withheld } = dispatchFor(soweto, NOW, nurse => {
   const score = trustScoreFor(nurse, NOW);
   return nurse.id === 'N-201' && score ? { ...score, computedOn: dayOf(NOW.getTime() - 86_400_000) } : score;
  });
  assert.deepEqual(withheld, [{ partyId: 'N-201', refusalId: 'stale-score', refused: sentence('stale-score') }]);
 });
});
