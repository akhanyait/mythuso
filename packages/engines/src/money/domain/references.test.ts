import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney } from './ledger.ts';
import { hearing, hearingFrom, isRecordReference, refusal } from './contract.ts';

/* Money holds only the references on its allow-list, each with the reason it needs it. These tests
   ask the rule itself, not only the ledger around it: the ledger also refuses fields an event does not
   declare, and that second refusal is exactly what hid the rule being switched off when the list it
   read was renamed. */
const clock = () => new Date('2026-09-14T08:00:00+02:00');

test('a reference into the record is refused by the rule itself, and every allowed one passes', () => {
 for (const field of ['encounterRef', 'readingEntryRef', 'assessmentRef', 'observationRef', 'patientId', 'resultEntryRefs']) {
  assert.equal(isRecordReference(field), true, `${field} would reach Money`);
 }
 for (const { field } of hearing.mayReference) assert.equal(isRecordReference(field), false, `${field} is on the allow-list and was refused`);
 /* A field that is not a reference at all is not this rule's to refuse. */
 for (const field of ['amountCents', 'reasonCode', 'scheduledFor', 'partnerKind']) assert.equal(isRecordReference(field), false, field);
});

test('a listed event carrying encounterRef, readingEntryRef or assessmentRef is refused whole', () => {
 const money = createMoney({ clock, simulation: true });
 const visit = { appointmentRef: 'APT-1', serviceId: 'vitals', clinicianRef: 'N-205' };
 for (const field of ['encounterRef', 'readingEntryRef', 'assessmentRef']) {
  assert.deepEqual(money.hear({ type: 'visit.billable', version: 1, payload: { ...visit, [field]: 'R-1' } }), refusal('hears-only-its-list'), field);
 }
 assert.equal(money.earnedLinesFor('N-205').length, 0);
});

test('a hearing list without its allow-list, or with an empty one, stops Money from loading', () => {
 const events = [{ type: 'visit.billable', why: 'A completed visit.' }];
 const mayReference = [{ field: 'appointmentRef', why: 'The visit.' }];
 assert.throws(() => hearingFrom({ engine: 'money', events }), /mayReference/);
 assert.throws(() => hearingFrom({ engine: 'money', events, mayReference: [] }), /mayReference/);
 assert.throws(() => hearingFrom({ engine: 'money', events, mayReference: [{ field: 'appointmentRef' }] }), /why/);
 assert.throws(() => hearingFrom({ engine: 'money', mayReference }), /events/);
 assert.throws(() => hearingFrom(undefined), /moneyHears/);
 assert.equal(hearingFrom({ engine: 'money', events, mayReference }).mayReference.length, 1);
});
