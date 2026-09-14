/**
 * Break-glass opens the emergency summary, once, with a reason, under review — and nothing else.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import { HOUR, START, harness, seed, sentence } from './harness.ts';

const JUSTIFICATION = 'Found unresponsive at home, no phone, family not reachable';

describe('break-glass', () => {
 test('needs a justification in words before anything is opened, and the attempt is logged', () => {
  const h = harness();
  const s = seed(h);
  const attempt = h.gateway.breakGlass({ subject: s.subject, justification: 'urgent', requesterRole: 'registered-clinician', requesterRef: 'synthetic-clinician-1' });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-justification'));
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  assert.ok(history.entries.some(entry => entry.outcomeDesc === sentence('breakglass-justification')));
 });

 test('only a registered clinician or the dispatch desk may break the glass', () => {
  const h = harness();
  const s = seed(h);
  const attempt = h.gateway.breakGlass({ subject: s.subject, justification: JUSTIFICATION, requesterRole: 'caregiver', requesterRef: 'synthetic-caregiver' });
  assert.equal(attempt.ok ? '' : attempt.reason, sentence('breakglass-role'));
 });

 test('opens the emergency summary and nothing else — no vital signs, no sealed content', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ subject: s.subject, justification: JUSTIFICATION, requesterRole: 'dispatch-desk', requesterRef: 'synthetic-desk-1' });
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  assert.deepEqual(Object.keys(opened.summary).sort(), [...contract.emergencySummary.categories].sort());
  const everything = JSON.stringify(opened.summary);
  assert.ok(everything.includes('Synthetic allergen A'));
  assert.ok(everything.includes('Synthetic medicine B'));
  for (const never of ['Synthetic pulse', 'Synthetic antenatal reading', 'Synthetic private reading']) assert.equal(everything.includes(never), false, never);
 });

 test('is logged as break-glass and flagged for review within the contract\'s window', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ subject: s.subject, justification: JUSTIFICATION, requesterRole: 'registered-clinician', requesterRef: 'synthetic-clinician-2' });
  assert.ok(opened.ok);
  const due = new Date(START + contract.breakGlass.reviewWithinHours * HOUR).toISOString();
  assert.equal(opened.reviewDueBy, due);
  assert.ok(opened.notice.includes(String(contract.breakGlass.reviewWithinHours)));
  const history = h.gateway.auditMine(s.patientSession);
  assert.ok(history.ok);
  const entry = history.entries.find(e => e.breakGlass === true)!;
  assert.equal(entry.reviewDueBy, due);
  assert.equal(entry.outcomeDesc, JUSTIFICATION);
  assert.deepEqual(h.gateway.audit.breakGlassReviews(h.at()).map(review => review.overdue), [false]);
  h.advance(contract.breakGlass.reviewWithinHours * HOUR + 1);
  assert.deepEqual(h.gateway.audit.breakGlassReviews(h.at()).map(review => review.overdue), [true]);
 });

 test('leaves no access behind it: nothing issued, and the next read is refused like any other', () => {
  const h = harness();
  const s = seed(h);
  const opened = h.gateway.breakGlass({ subject: s.subject, justification: JUSTIFICATION, requesterRole: 'dispatch-desk', requesterRef: 'synthetic-desk-2' });
  assert.deepEqual(Object.keys(opened).sort(), ['notice', 'ok', 'reviewDueBy', 'summary']);
  const next = h.gateway.read({ kind: 'grant', artefact: '', purpose: 'emergency' }, 'AllergyIntolerance', s.ids.allergy);
  assert.equal(next.ok ? '' : next.reason, sentence('bad-grant'));
 });
});
