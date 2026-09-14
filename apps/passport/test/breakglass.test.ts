/**
 * Break-glass opens the emergency summary, once, with a reason, under review — and nothing else.
 * Finding 4: who breaks the glass comes from a credential, and the note never reaches the chain.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import { openBytes } from '../src/keys.ts';
import { HOUR, START, harness, seed, sentence } from './harness.ts';

const NOTE = 'Found unresponsive at home with nobody present to consent';
const REASON = contract.breakGlass.reasons[0]!;

describe('break-glass', () => {
 test('refused without an operator credential, whatever the body says about who is asking', () => {
  const h = harness();
  const s = seed(h);
  for (const credential of ['', 'forged.credential', `${h.operator()}.junk`]) {
   const attempt = h.gateway.breakGlass({ credential, subject: s.subject, reasonCode: REASON.id, note: NOTE });
   assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-role'));
  }
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  assert.ok(history.entries.some(entry => entry.outcomeDesc === sentence('breakglass-role')));
 });

 test('an expired credential is no credential, and only the two break-glass roles can be minted', () => {
  const h = harness();
  const s = seed(h);
  const credential = h.operator('registered-clinician');
  h.advance(contract.breakGlass.operatorCredentialHours * HOUR + 1);
  const attempt = h.gateway.breakGlass({ credential, subject: s.subject, reasonCode: REASON.id, note: NOTE });
  assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-role'));
  assert.throws(() => h.operator('caregiver'));
 });

 test('needs a listed reason and a note in words before anything is opened', () => {
  const h = harness();
  const s = seed(h);
  for (const [reasonCode, note] of [['because', NOTE], [REASON.id, 'urgent'], [REASON.id, 'x '.repeat(200)]] as const) {
   const attempt = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode, note });
   assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-justification'));
  }
 });

 test('a note carrying a phone number, an identity number or an email address is refused', () => {
  const h = harness();
  const s = seed(h);
  for (const note of ['Synthetic patient unconscious, phone 082 000 0000, nobody home', 'Unresponsive and carrying card 0000000000000 in a wallet', 'Unresponsive, family reachable at synthetic@example.invalid only']) {
   const attempt = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode: REASON.id, note });
   assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-note-identifying'), note);
  }
 });

 test('opens the emergency summary and nothing else — no vital signs, no sealed or private content', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode: REASON.id, note: NOTE });
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  assert.deepEqual(Object.keys(opened.summary).sort(), [...contract.emergencySummary.categories].sort());
  const everything = JSON.stringify(opened.summary);
  assert.ok(everything.includes('Synthetic allergen A'));
  assert.ok(everything.includes('Synthetic medicine B'));
  for (const never of ['Synthetic pulse', 'Synthetic antenatal reading', 'Synthetic private reading']) assert.equal(everything.includes(never), false, never);
 });

 test('the chain carries the reason\'s sentence and the credential\'s role and reference — never the note, which is sealed beside it', () => {
  const h = harness();
  const s = seed(h);
  const credential = h.operator('registered-clinician');
  const opened = h.gateway.breakGlass({ credential, subject: s.subject, reasonCode: REASON.id, note: NOTE });
  assert.ok(opened.ok);
  const row = h.auditRows().find(r => r.seq === opened.auditSeq)!;
  assert.equal(row.reason, REASON.sentence);
  assert.equal(row.requester_role, 'registered-clinician');
  assert.match(String(row.requester_ref), /^op_[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(h.auditRows()).includes('unresponsive at home'), false);
  const stored = h.store.breakGlassNote(opened.auditSeq)!;
  assert.equal(Buffer.from(stored.sealed_body).toString('latin1').includes('unresponsive'), false);
  const key = h.keys.unwrapDataKey(s.subject, 'general', h.store.dataKey(s.subject, 'general')!);
  assert.equal(openBytes(key, stored.sealed_body, `breakglass-note|${s.subject}|${opened.auditSeq}`).toString('utf8'), NOTE);
 });

 test('is logged as break-glass and flagged for review within the contract\'s window', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode: REASON.id, note: NOTE });
  assert.ok(opened.ok);
  const due = new Date(START + contract.breakGlass.reviewWithinHours * HOUR).toISOString();
  assert.equal(opened.reviewDueBy, due);
  assert.ok(opened.notice.includes(String(contract.breakGlass.reviewWithinHours)));
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  const entry = history.entries.find(e => e.breakGlass === true)!;
  assert.equal(entry.reviewDueBy, due);
  assert.deepEqual(h.gateway.audit.breakGlassReviews(h.at()).map(review => review.overdue), [false]);
  h.advance(contract.breakGlass.reviewWithinHours * HOUR + 1);
  assert.deepEqual(h.gateway.audit.breakGlassReviews(h.at()).map(review => review.overdue), [true]);
 });

 test('leaves no access behind it: nothing issued, and the next read is refused like any other', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ credential: h.operator(), subject: s.subject, reasonCode: REASON.id, note: NOTE });
  assert.deepEqual(Object.keys(opened).sort(), ['auditSeq', 'notice', 'ok', 'reviewDueBy', 'summary']);
  const next = h.gateway.read({ kind: 'grant', artefact: '', purpose: 'emergency' }, 'AllergyIntolerance', s.ids.allergy);
  assert.equal(next.ok ? '' : next.reason, sentence('bad-grant'));
 });
});
