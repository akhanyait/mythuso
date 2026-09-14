import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney } from './ledger.ts';
import { PUBLISHES, hearing, isRefusal, refusal } from './contract.ts';
import eventsContract from '../../../../catalog/events.json' with { type: 'json' };

/* Money hears the billable state changes on its list, and nothing that points into the record. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');
type Declared = { type: string; version: number; owner: string; subscribers: string[]; withdrawn?: unknown; payload: { field: string }[] };
const declared = eventsContract.events as Declared[];

const sampleFor = (event: Declared) => Object.fromEntries(event.payload.map(f => [f.field,
 f.field === 'serviceId' ? 'vitals' : f.field === 'feeCode' ? 'review-per-case' : f.field.endsWith('Cents') ? 100 : `${f.field}-1`]));

test('every live event on Money’s list is heard, in the shape events.json gives it', () => {
 const money = createMoney({ clock, simulation: true });
 for (const { type } of hearing.events) {
  for (const event of declared.filter(e => e.type === type && !e.withdrawn && e.subscribers.includes('money'))) {
   const answer = money.hear({ type, version: event.version, payload: sampleFor(event) });
   assert.ok(!isRefusal(answer), `${type}@${event.version} was refused: ${JSON.stringify(answer)}`);
  }
 }
});

test('an event that is not on the list is refused, however harmless it looks', () => {
 const money = createMoney({ clock, simulation: true });
 const notHeard = declared.filter(e => !e.withdrawn && !hearing.events.some(h => h.type === e.type));
 assert.ok(notHeard.length > 10);
 for (const event of notHeard) assert.deepEqual(money.hear({ type: event.type, version: event.version, payload: sampleFor(event) }), refusal('hears-only-its-list'), event.type);
 /* Including the one a suspension would arrive on, if anybody tried to make Money listen for it. */
 assert.deepEqual(money.hear({ type: 'vetting.suspended', version: 1, payload: { subjectRef: 'N-205' } }), refusal('hears-only-its-list'));
});

test('a listed event carrying a reference into the record, or a field it does not declare, is refused whole', () => {
 const money = createMoney({ clock, simulation: true });
 const visit = { appointmentRef: 'APT-1', serviceId: 'vitals', clinicianRef: 'N-205' };
 assert.deepEqual(money.hear({ type: 'visit.billable', version: 1, payload: { ...visit, encounterRef: 'ENC-1' } }), refusal('hears-only-its-list'));
 assert.deepEqual(money.hear({ type: 'visit.billable', version: 1, payload: { ...visit, readingEntryRef: 'R-1' } }), refusal('hears-only-its-list'));
 assert.deepEqual(money.hear({ type: 'visit.billable', version: 1, payload: { ...visit, findings: 'x' } }), refusal('hears-only-its-list'));
 assert.deepEqual(money.hear({ type: 'review.billable', version: 1, payload: { reviewRef: 'RV-1', reviewedByRef: 'D-401', feeCode: 'review-per-case', assessment: 'x' } }), refusal('hears-only-its-list'));
 assert.equal(money.earnedLinesFor('N-205').length, 0);
});

test('what Money publishes is live, owned by Money, and carries no card, account or record reference', () => {
 for (const key of PUBLISHES) {
  const [type, version] = key.split('@');
  const event = declared.find(e => e.type === type && e.version === Number(version))!;
  assert.equal(event.owner, 'money');
  assert.ok(!event.withdrawn);
  for (const field of event.payload.map(f => f.field)) assert.ok(!/card|account|encounter|EntryRef$/i.test(field), `${key} carries ${field}`);
 }
});
