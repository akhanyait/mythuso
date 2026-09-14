/**
 * Trust Score v1, held to packages/catalog/trust.json.
 *
 * Every sentence is read out of the contract. What is asserted is that the score never becomes a
 * number nobody decided, that a patient never receives one, and that the day the weights are filled
 * in the service refuses rather than inventing the formula.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../../packages/catalog/trust.json' with { type: 'json' };
import catalogue from '../../../packages/catalog/vetting.json' with { type: 'json' };
import type { ActorVetting, CheckRecord } from '../src/protection/gate.ts';
import { gateProgress } from '../src/vetting/gates.ts';
import { TRUST, dayOf, eligibility, forPatient, rankForDispatch, refusal, trustScore, type TrustContract, type TrustScore } from '../src/trust/index.ts';

const NOW = Date.UTC(2026, 8, 7, 8, 0, 0);
const DAY = 86_400_000;
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
const sentence = (id: string) => contract.refusals.find(r => r.id === id)!.sentence;

function nurse(exceptions: Record<string, Partial<CheckRecord>> = {}, flags: Partial<ActorVetting> = {}): ActorVetting {
 return {
  actorId: 'N-1', roleId: 'nurse', ...flags,
  records: catalogue.roles.find(r => r.id === 'nurse')!.checks.map(check => ({
   checkId: check.id, state: 'verified' as const, secondedBy: 'second reviewer', ...exceptions[check.id]
  }))
 };
}
const scoreOf = (actor: ActorVetting, at = NOW, with_: TrustContract = TRUST) => trustScore(actor.actorId, gateProgress(actor, at), at, with_);

describe('the contract itself', () => {
 test('every soft input is undecided, and says who decides it', () => {
  assert.equal(contract.softInputs.length, 8);
  for (const input of contract.softInputs) {
   assert.equal(input.weight, null, input.id);
   assert.equal(input.decision, null, input.id);
   assert.ok(input.setBy.length > 0);
  }
 });
});

describe('the score', () => {
 test('an activated nurse with every hard gate passing is Verified, with no number, and is told why the other tiers are unavailable', () => {
  const score = scoreOf(nurse())!;
  assert.equal(score.tier, 'verified');
  assert.equal(score.value, null);
  assert.equal(score.online, true);
  assert.deepEqual(score.reasons, [contract.reasons.hardGatesPass, contract.reasons.weightsUndecided]);
  assert.deepEqual(score.unavailableTiers.map(t => t.sentence), contract.tiers.filter(t => t.needs === 'weights').map(t => t.unavailable));
 });

 test('a lapsed police clearance is a failing hard gate: 0 and offline, in the contract\'s sentence', () => {
  const score = scoreOf(nurse({ 'police-clearance': { expiresOn: iso(NOW - 9 * DAY) } }))!;
  assert.equal(score.value, 0);
  assert.equal(score.online, false);
  assert.equal(score.tier, null);
  assert.deepEqual(score.reasons, [contract.hardGates.find(g => g.id === 'background-status')!.failing]);
 });

 test('a declined identity fails credential validity, even with background still in review', () => {
  const score = scoreOf(nurse({ identity: { state: 'declined' }, 'police-clearance': { state: 'in-review' } }))!;
  assert.equal(score.value, 0);
  assert.ok(score.reasons.includes(contract.hardGates.find(g => g.id === 'credential-validity')!.failing));
 });

 test('somebody halfway through their application has no score at all, rather than a 0 that says something failed', () => {
  assert.equal(scoreOf(nurse({ 'kit-training': { state: 'in-review' } })), null);
 });

 test('a suspended nurse is 0 and offline, whatever her checks say', () => {
  const score = scoreOf(nurse({}, { suspended: true }))!;
  assert.equal(score.value, 0);
  assert.deepEqual(score.reasons, [contract.reasons.suspended]);
 });

 test('half-decided weights are still the hard gates alone', () => {
  const partly = structuredClone(TRUST) as TrustContract & { softInputs: { weight: number | null; decision: unknown }[] };
  partly.softInputs[0]!.weight = 0.2;
  partly.softInputs[0]!.decision = { decidedBy: 'Clinical Governance Lead', decidedOn: '2026-09-01', minute: 'CG-1' };
  assert.equal(scoreOf(nurse(), NOW, partly)!.value, null);
 });

 test('every weight decided is refused loudly until the weighted computation is written and reviewed', () => {
  const decided = structuredClone(TRUST) as TrustContract & { softInputs: { weight: number | null; decision: unknown }[] };
  for (const input of decided.softInputs) {
   input.weight = 0.125;
   input.decision = { decidedBy: 'Clinical Governance Lead', decidedOn: '2026-09-01', minute: 'CG-1' };
  }
  assert.throws(() => scoreOf(nurse(), NOW, decided), { message: sentence('weighted-not-built') });
 });
});

describe('what a patient receives', () => {
 test('the badge by name, and exactly the fields the contract lists', () => {
  const view = forPatient(scoreOf(nurse()));
  assert.deepEqual(Object.keys(view), contract.patientView.fields);
  assert.equal(view.tier, 'Verified');
  for (const never of contract.patientView.never) assert.equal(never in view, false, never);
 });
 test('nothing at all for a person who is offline or unscored — not a 0', () => {
  assert.deepEqual(forPatient(scoreOf(nurse({ identity: { state: 'declined' } }))), { tier: null });
  assert.deepEqual(forPatient(null), { tier: null });
 });
});

describe('no Trust Score, no dispatch', () => {
 const current = scoreOf(nurse())!;
 test('no score, a score from another day, and a 0 are three refusals in three sentences', () => {
  assert.deepEqual(eligibility(null, NOW), { eligible: false, refusalId: 'no-score', refused: sentence('no-score') });
  const yesterday: TrustScore = { ...current, computedOn: dayOf(NOW - DAY) };
  assert.equal(eligibility(yesterday, NOW).eligible, false);
  assert.equal((eligibility(yesterday, NOW) as { refused: string }).refused, sentence('stale-score'));
  const zero = scoreOf(nurse({ identity: { state: 'declined' } }))!;
  assert.equal((eligibility(zero, NOW) as { refused: string }).refused, sentence('offline'));
  assert.equal(refusal('no-score'), sentence('no-score'));
 });

 test('ranking is proximity first, and a person without a current score is withheld beside it rather than ranked last', () => {
  const { ranked, withheld } = rankForDispatch([
   { partyId: 'far', km: 12, score: current },
   { partyId: 'unscored', km: 0.5, score: null },
   { partyId: 'near', km: 2, score: current },
   { partyId: 'unknown-distance', km: null, score: current }
  ], NOW);
  assert.deepEqual(ranked.map(r => r.partyId), ['near', 'far', 'unknown-distance']);
  assert.deepEqual(withheld, [{ partyId: 'unscored', refusalId: 'no-score', refused: sentence('no-score') }]);
 });

 test('a ranked entry carries the badge and the distance, and never the score\'s value or reasons', () => {
  const { ranked } = rankForDispatch([{ partyId: 'near', km: 2, score: current }], NOW);
  assert.deepEqual(Object.keys(ranked[0]!).sort(), ['km', 'partyId', 'tier']);
  assert.equal(ranked[0]!.tier, 'Verified');
 });
});
