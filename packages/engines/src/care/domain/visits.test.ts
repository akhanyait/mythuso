/* The visit: the code at both ends, the checklist that will not run under a draft, handover, the two
   completion events, and where a nurse's position stops being shared. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import care from '../../../../catalog/care.json' with { type: 'json' };
import { careContract } from './contract.ts';
import { checklistFor } from './checklist.ts';
import { locationShare } from './position.ts';
import { VisitDesk, type RecordPort } from './visits.ts';

const DAY = new Date('2026-09-14T15:40:00+02:00');
const NEXT_DAY = new Date('2026-09-15T09:00:00+02:00');
const CODE = care.preview.visitCode;
const me = { clinicianRef: 'N-205' };

function desk(record: Partial<RecordPort> = {}) {
 const visits = new VisitDesk({ contract: careContract, record: { encounterComplete: () => true, encounterSigned: () => true, ...record } });
 visits.hold({ appointmentRef: 'TH-3107', subjectRef: 'sub', serviceId: 'wound', clinicianRef: 'N-205', scheduledFor: '2026-09-14T16:00:00+02:00' }, CODE);
 return visits;
}

test('a visit starts only with the code, and a wrong code changes nothing and emits nothing', () => {
 const visits = desk();
 const wrong = visits.start({ appointmentRef: 'TH-3107', visitCode: '000000' }, me, DAY);
 assert.equal(wrong.ok ? null : wrong.id, 'visit-code-wrong');
 assert.equal(wrong.ok ? null : wrong.status, 403);
 assert.equal(visits.visit('TH-3107')!.state, 'booked');
 const right = visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 assert.ok(right.ok);
 if (!right.ok) return;
 assert.deepEqual(right.events.map(e => [e.type, e.payload]), [['appointment.in_progress', { appointmentRef: 'TH-3107', visitCodeMatched: true }]]);
 assert.equal(JSON.stringify(right.events).includes(CODE), false, 'the code never leaves the visit');
});

test('the day is asked before the code, so a wrong-day attempt learns nothing about its code', () => {
 const visits = desk();
 const wrongDayRightCode = visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, NEXT_DAY);
 const wrongDayWrongCode = visits.start({ appointmentRef: 'TH-3107', visitCode: '111111' }, me, NEXT_DAY);
 assert.deepEqual([wrongDayRightCode, wrongDayWrongCode].map(a => a.ok ? null : a.id), ['not-today', 'not-today']);
});

test('only the nurse holding the visit may act on it, and an unknown visit gives the same answer', () => {
 const visits = desk();
 const other = visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, { clinicianRef: 'N-201' }, DAY);
 const unknown = visits.start({ appointmentRef: 'TH-0000', visitCode: CODE }, me, DAY);
 assert.deepEqual([other, unknown].map(a => a.ok ? null : a.id), ['caller-not-allowed', 'caller-not-allowed']);
});

test('the checklist shows the not-ratified refusal instead of steps while its protocols are drafts, and refuses to record one', () => {
 const view = checklistFor(careContract, 'wound');
 assert.deepEqual(view.protocols.map(p => [p.reference, p.status]), [['wound-care@1', 'draft'], ['infection-control-and-sharps@1', 'draft']]);
 assert.equal(view.runnable, false);
 assert.equal(view.refusal, 'A checklist runs only under a ratified protocol.');
 assert.equal(view.why, careContract.sentences.draftCarriesNothing);
 assert.equal('steps' in view, false, 'a checklist view has nowhere to put a step');
 assert.equal(checklistFor(careContract, 'planning').refusal, careContract.sentences.noProtocol);

 const visits = desk();
 const before = visits.checklist({ appointmentRef: 'TH-3107', protocolVersionId: 'wound-care@1', completedItems: [] }, me, DAY);
 assert.equal(before.ok ? null : before.id, 'checklist-without-visit');
 visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 for (const id of ['wound-care@1', 'wound-care@2', 'phlebotomy@1', 'nonsense']) {
  const answer = visits.checklist({ appointmentRef: 'TH-3107', protocolVersionId: id, completedItems: ['anything'] }, me, DAY);
  assert.equal(answer.ok ? null : answer.id, 'protocol-not-ratified', id);
 }
});

test('capture attaches references only to a visit under way, and never the same one twice', () => {
 const visits = desk();
 const early = visits.capture({ appointmentRef: 'TH-3107', observationRefs: ['obs-1'] }, me);
 assert.equal(early.ok ? null : early.id, 'capture-without-visit');
 visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 const first = visits.capture({ appointmentRef: 'TH-3107', observationRefs: ['obs-1', 'obs-2', 'obs-1'] }, me);
 const again = visits.capture({ appointmentRef: 'TH-3107', observationRefs: ['obs-2', 'obs-3'] }, me);
 assert.deepEqual([first.ok && first.value.attachedCount, again.ok && again.value.attachedCount], [2, 1]);
});

test('handover needs a started visit and a complete encounter, and queues it once', () => {
 let complete = false;
 const visits = desk({ encounterComplete: () => complete });
 const early = visits.handover({ appointmentRef: 'TH-3107', encounterRef: 'enc' }, me, DAY);
 assert.equal(early.ok ? null : early.id, 'handover-without-visit');
 visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 const incomplete = visits.handover({ appointmentRef: 'TH-3107', encounterRef: 'enc' }, me, DAY);
 assert.equal(incomplete.ok ? null : incomplete.status, 422);
 complete = true;
 const queued = visits.handover({ appointmentRef: 'TH-3107', encounterRef: 'enc' }, me, DAY);
 assert.ok(queued.ok);
 if (queued.ok) assert.deepEqual(queued.events.map(e => [e.type, e.payload]), [['visit.handover.submitted', { appointmentRef: 'TH-3107', encounterRef: 'enc' }]]);
 const twice = visits.handover({ appointmentRef: 'TH-3107', encounterRef: 'enc' }, me, DAY);
 assert.ok(twice.ok && twice.events.length === 0);
});

test('completion needs the code again and a signed encounter, and tells Money it is billable without the encounter', () => {
 let signed = false;
 const visits = desk({ encounterSigned: () => signed });
 const notStarted = visits.complete({ appointmentRef: 'TH-3107', visitCode: CODE, encounterRef: 'enc' }, me, DAY);
 assert.equal(notStarted.ok ? null : notStarted.id, 'complete-without-start');
 visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 const wrong = visits.complete({ appointmentRef: 'TH-3107', visitCode: '482191', encounterRef: 'enc' }, me, DAY);
 assert.equal(wrong.ok ? null : wrong.statement, 'The visit code did not match, so the visit is not complete.');
 const unsigned = visits.complete({ appointmentRef: 'TH-3107', visitCode: CODE, encounterRef: 'enc' }, me, DAY);
 assert.equal(unsigned.ok ? null : unsigned.id, 'encounter-unsigned');
 assert.equal(visits.visit('TH-3107')!.state, 'in-progress');
 signed = true;
 const done = visits.complete({ appointmentRef: 'TH-3107', visitCode: CODE, encounterRef: 'enc' }, me, DAY);
 assert.ok(done.ok);
 if (!done.ok) return;
 assert.deepEqual(done.events.map(e => e.type), ['appointment.completed', 'visit.billable']);
 assert.deepEqual(done.events[0]!.payload, { appointmentRef: 'TH-3107', encounterRef: 'enc', serviceId: 'wound' });
 assert.deepEqual(done.events[1]!.payload, { appointmentRef: 'TH-3107', serviceId: 'wound', clinicianRef: 'N-205' });
 assert.equal('encounterRef' in done.events[1]!.payload, false);
});

test('a nurse’s location is shared on the visit’s day until completion, and refused either side of that', () => {
 const visits = desk();
 const refusal = careContract.engineRefusals.find(r => r.id === 'location-beyond-the-visit')!.statement;
 const before = locationShare(careContract, visits.visit('TH-3107'), new Date('2026-09-13T16:00:00+02:00'));
 assert.equal(before.ok ? null : before.statement, refusal);
 assert.ok(locationShare(careContract, visits.visit('TH-3107'), DAY).ok);
 visits.start({ appointmentRef: 'TH-3107', visitCode: CODE }, me, DAY);
 visits.complete({ appointmentRef: 'TH-3107', visitCode: CODE, encounterRef: 'enc' }, me, DAY);
 const after = locationShare(careContract, visits.visit('TH-3107'), DAY);
 assert.equal(after.ok ? null : after.statement, refusal);
 assert.equal(locationShare(careContract, null, DAY).ok, false);
});
