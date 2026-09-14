/**
 * The seven gates, held to the contract and to the access gate's own arithmetic.
 *
 * Every refusal here is compared with a sentence read out of packages/catalog/vetting.json rather
 * than typed, so rewording a fail rule fails nothing — and inventing one in gates.ts fails the
 * comparison. The last block runs the vault itself, because a status that is only right in a pure
 * function and wrong on the route a nurse reads is not a status anybody has.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import catalogue from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { standingOf, type ActorVetting, type CheckRecord } from '../src/protection/gate.ts';
import { createProtectionModule, mintBootstrapAuthorisation } from '../src/protection/index.ts';
import { GATES, GATE_RULES, gateProgress, statusFor } from '../src/vetting/gates.ts';
import { VettingVault, openVettingStore, roleChecks, vettingSource, type Actor } from '../src/vetting/index.ts';

const NOW = Date.UTC(2026, 8, 7, 8, 0, 0);
const DAY = 86_400_000;
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
const gate = (id: string) => catalogue.gates.find(candidate => candidate.id === id)!;
const roleOf = (id: string) => catalogue.roles.find(role => role.id === id)!;

/** Every check the role carries, verified and seconded, with exceptions laid over the top. */
function party(roleId: string, exceptions: Record<string, Partial<CheckRecord>> = {}, flags: Partial<ActorVetting> = {}): ActorVetting {
 return {
  actorId: `${roleId}-1`, roleId, ...flags,
  records: roleOf(roleId).checks.map(check => ({
   checkId: check.id, state: 'verified' as const, secondedBy: 'second reviewer', ...exceptions[check.id]
  }))
 };
}

describe('the contract holds seven gates, in order, and every check sits at one of them', () => {
 test('seven gates numbered 1 to 7 with no gap', () => {
  assert.deepEqual(GATES.map(g => g.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(statusFor(GATES[2]!), `Gate 3 of 7 — ${gate('credentials').name}`);
 });
 test('every role reaches gate 7 through gates 1 to 6, or says in words why a gate has no check', () => {
  for (const role of catalogue.roles) {
   for (const g of GATES.filter(g => !g.evidencedBy)) {
    const here = role.checks.filter(check => check.gate === g.id);
    const note = (role.gateNotes as Record<string, { sentence: string }>)[g.id];
    assert.ok(here.length > 0 || (note && note.sentence.length > 40), `${role.id} has nothing at ${g.id} and does not say why`);
   }
  }
 });
});

describe('where a party stands', () => {
 test('a fully cleared nurse is activated at gate 7, and is cleared by the access gate too', () => {
  const nurse = party('nurse');
  const progress = gateProgress(nurse, NOW);
  assert.equal(progress.outcome, 'activated');
  assert.equal(progress.status, `Gate 7 of 7 — ${gate('activate').name}`);
  assert.equal(progress.sentence, null);
  assert.equal(standingOf(nurse, NOW).cleared, true);
 });

 test('an application in progress sits at the first gate that has not passed', () => {
  const progress = gateProgress(party('nurse', { 'kit-training': { state: 'in-review' } }), NOW);
  assert.equal(progress.outcome, 'in-progress');
  assert.equal(progress.at.id, 'train');
  assert.equal(progress.activated, false);
 });

 test('a high-risk check verified by one reviewer does not pass its gate', () => {
  const progress = gateProgress(party('nurse', { identity: { secondedBy: undefined } }), NOW);
  assert.equal(progress.at.id, 'identity');
  assert.deepEqual(progress.gates.find(g => g.id === 'identity')!.outstanding, ['Identity']);
 });

 test('an identity that does not match stops the party at gate 2, in the contract\'s words', () => {
  const progress = gateProgress(party('nurse', { identity: { state: 'declined' } }), NOW);
  assert.equal(progress.outcome, 'stopped');
  assert.equal(progress.status, `Gate 2 of 7 — ${gate('identity').name}`);
  assert.equal(progress.sentence, gate('identity').failRule);
 });

 test('nothing after a failed hard stop is reached, however green it is', () => {
  const progress = gateProgress(party('nurse', { 'police-clearance': { state: 'declined' } }), NOW);
  assert.equal(progress.outcome, 'stopped');
  assert.equal(progress.sentence, gate('background').failRule);
  for (const later of progress.gates.filter(g => g.order > 4)) assert.equal(later.state, 'not-reached', later.id);
  assert.equal(progress.activated, false);
 });

 test('a background bar is not hidden behind an identity check nobody has finished', () => {
  const progress = gateProgress(party('nurse', { identity: { state: 'in-review' }, 'police-clearance': { state: 'declined' } }), NOW);
  assert.equal(progress.at.id, 'background');
  assert.equal(progress.outcome, 'stopped');
 });

 test('a declined check at a gate that is not a hard stop fails with that gate\'s own rule', () => {
  const progress = gateProgress(party('corner', { 'privacy-layout': { state: 'declined' } }), NOW);
  assert.equal(progress.outcome, 'failed');
  assert.equal(progress.at.id, 'assess');
  assert.equal(progress.sentence, gate('assess').failRule);
 });

 test('a lapse holds the party at its gate with the lapse sentence, never with a bar', () => {
  const progress = gateProgress(party('nurse', { 'police-clearance': { expiresOn: iso(NOW - 9 * DAY) } }), NOW);
  assert.equal(progress.outcome, 'held');
  assert.equal(progress.at.id, 'background');
  assert.equal(progress.sentence, GATE_RULES.lapse);
  assert.notEqual(progress.sentence, gate('background').failRule);
 });

 test('a suspended party with every gate passed is not activated, and is told why', () => {
  const progress = gateProgress(party('nurse', {}, { suspended: true }), NOW);
  assert.equal(progress.outcome, 'suspended');
  assert.equal(progress.sentence, GATE_RULES.suspended);
  assert.equal(progress.activated, false);
 });

 test('for every role, a declined check at every hard-stop gate refuses activation', () => {
  for (const role of catalogue.roles) {
   for (const check of role.checks.filter(check => gate(check.gate).hardStop)) {
    const progress = gateProgress(party(role.id, { [check.id]: { state: 'declined' } }), NOW);
    assert.equal(progress.activated, false, `${role.id}/${check.id}`);
    assert.equal(progress.at.id, check.gate, `${role.id}/${check.id}`);
    assert.equal(progress.sentence, gate(check.gate).failRule);
   }
  }
 });

 test('activated and cleared are the same answer for every single-check exception on every role', () => {
  for (const role of catalogue.roles) {
   for (const check of role.checks) {
    for (const exception of [{ state: 'in-review' as const }, { state: 'declined' as const }, { expiresOn: iso(NOW - DAY) }, { secondedBy: undefined }]) {
     const actor = party(role.id, { [check.id]: exception });
     assert.equal(gateProgress(actor, NOW).activated, standingOf(actor, NOW).cleared, `${role.id}/${check.id}/${JSON.stringify(exception)}`);
    }
   }
  }
 });
});

describe('the vault answers with the gates, and refuses activation until 1 to 6 pass', () => {
 test('over a real store: in progress, then activated once every check is decided and seconded', () => {
  let clock = NOW;
  const now = () => clock;
  const db = new DatabaseSync(':memory:');
  const store = openVettingStore(db);
  const config = { environment: 'development' as const, protectionKeys: `1:${randomBytes(32).toString('hex')}`, protectionIndexVersion: '1' };
  const protection = createProtectionModule(config, db, { vetting: vettingSource(store), releases: { find: () => null }, now })!;
  const vault = new VettingVault({ gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store, now });
  const pair = [{ id: 'admin-1', roleId: 'admin' }, { id: 'admin-2', roleId: 'admin' }];
  const authorise = () => mintBootstrapAuthorisation(config, { parties: pair, decidedBy: 'founder', secondedBy: 'director' }, now).token;
  const seeding = vault.openBootstrap(authorise());
  for (const seeded of pair) seeding.seed(seeded);
  seeding.close();

  const self: Actor = { id: 'admin-1', role: 'admin', purpose: 'subject-access' };
  const before = vault.standing('admin-1')!;
  assert.equal(before.gates.at.id, 'identity');
  const refused = vault.activation('admin-1');
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? '' : refused.reason, GATE_RULES.notActivated);
  assert.equal(vault.activation('nobody').ok, false);

  for (const check of roleChecks('admin')) {
   const submitted = vault.submit({ actor: self, partyId: 'admin-1', checkId: check.id, filename: `${check.id}.pdf`, document: Buffer.from('%PDF fictional'), issuedOn: iso(NOW - DAY) });
   assert.ok(submitted.ok, submitted.ok ? '' : submitted.reason);
  }
  const deciding = vault.openBootstrap(authorise());
  for (const check of roleChecks('admin')) deciding.decide('admin-1', check.id, { issuedOn: iso(NOW - DAY) });
  deciding.close();
  clock += 1000;
  const after = vault.activation('admin-1');
  assert.ok(after.ok, after.ok ? '' : after.reason);
  assert.equal(after.gates.status, `Gate 7 of 7 — ${gate('activate').name}`);
 });
});
