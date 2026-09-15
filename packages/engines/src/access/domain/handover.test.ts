/* The handover: a structured summary with no words and no emergency group, an urgency that only rises,
   and conversation.handover carrying exactly its frozen payload. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../../catalog/apis/access.json' with { type: 'json' };
import assistant from '../../../../catalog/assistant.json' with { type: 'json' };
import events from '../../../../catalog/events.json' with { type: 'json' };
import { deskAt, emptyQueue, handOver, summarise, type ConversationTurn } from './handover.ts';
import { accessInForce } from './settings.ts';

const now = new Date('2026-09-14T10:00:00+02:00');
const turn = (over: Partial<ConversationTurn>): ConversationTurn => ({ channel: 'typed', matchedQuestionId: null, askedForNurse: false, emergency: false, ...over });
const request = (turns: ConversationTurn[], conversationRef = 'conv-1') =>
 ({ conversationRef, summary: summarise(turns), actorRole: 'patient', subjectRef: 'subject-lerato', now });

test('the summary is how the person asked, what matched and an urgency — nothing they said and no group', () => {
 const summary = summarise([turn({ matchedQuestionId: 'visit' }), turn({ channel: 'chosen', matchedQuestionId: 'nurse', askedForNurse: true })]);
 assert.deepEqual(summary, { channelCode: 'typed', matchedQuestionId: 'visit', emergencyLast: false, urgencyCode: 'not-assessed' });
 assert.deepEqual(summarise([]), { channelCode: 'none', matchedQuestionId: null, emergencyLast: false, urgencyCode: 'not-assessed' });
 // The fields a patient is shown are the fields that go: none of them is their words or a group.
 assert.deepEqual(assistant.answers.handover.fields.map(f => f.id), ['channel', 'matched', 'urgency']);
});

test('conversation.handover carries exactly its frozen payload and none of what it refuses', () => {
 const sent = handOver(emptyQueue, request([turn({ emergency: true })]));
 assert.ok(!sent.refused);
 assert.equal(sent.value.sentNow, true);
 assert.match(sent.value.handover.handoverRef, /^SIM-HO-/);
 assert.match(sent.value.handover.summaryEntryRef, /^SIM-ENTRY-/);
 const [event] = sent.events;
 const frozen = events.events.find(e => e.type === 'conversation.handover' && e.version === 1)!;
 assert.deepEqual(Object.keys(event!.payload).sort(), frozen.payload.map(f => f.field).sort());
 const carried = JSON.stringify(event);
 for (const never of [...frozen.neverCarries.map(n => n.field), 'groups', 'emergencyGroups', 'words', 'message']) assert.ok(!carried.includes(`"${never}"`), never);
 assert.equal(event!.type === 'conversation.handover' && event!.payload.urgencyCode, 'emergency');
});

test('an emergency anywhere in the conversation stays an emergency, and a calmer handover never lowers it', () => {
 const turns = [turn({ emergency: true }), turn({ matchedQuestionId: 'visit' }), turn({ matchedQuestionId: 'nurse', askedForNurse: true })];
 assert.equal(summarise(turns).urgencyCode, 'emergency');
 const first = handOver(emptyQueue, request(turns));
 assert.ok(!first.refused);
 const calmer = handOver(first.value.queue, request([turn({ matchedQuestionId: 'visit' })]));
 assert.ok(!calmer.refused);
 assert.equal(calmer.value.sentNow, false);
 assert.equal(calmer.events.length, 0);
 assert.equal(calmer.value.handover.urgencyCode, 'emergency');
});

test('the same urgency twice sends nothing new, and a risen one does', () => {
 const first = handOver(emptyQueue, request([turn({})]));
 assert.ok(!first.refused);
 const same = handOver(first.value.queue, request([turn({}), turn({ channel: 'chosen' })]));
 assert.ok(!same.refused);
 assert.deepEqual([same.value.sentNow, same.events.length], [false, 0]);
 const risen = handOver(same.value.queue, request([turn({}), turn({ emergency: true })]));
 assert.ok(!risen.refused);
 assert.deepEqual([risen.value.sentNow, risen.events.length, risen.value.queue.handovers.length], [true, 1, 1]);
});

test('a handover without a summary does not go', () => {
 const refused = handOver(emptyQueue, { conversationRef: 'conv-1', summary: null, actorRole: 'patient', subjectRef: 's', now });
 assert.ok(refused.refused);
 const route = access.routes.find(r => r.path === '/v1/access/conversations/{conversationRef}/handover')!;
 assert.deepEqual([refused.id, refused.status, refused.statement], ['no-summary', 422, route.refusals.find(r => r.id === 'no-summary')!.statement]);
});

test('the urgency codes are the contract’s, most urgent first, and neither of them is calm', () => {
 assert.deepEqual(assistant.answers.handover.urgency.map(u => u.id), ['emergency', 'not-assessed']);
});

/* The desk's hours are Access's setting handover-hours. 15 September 2026 is a Tuesday in Johannesburg. */
test('the handover desk is open inside a window of the hours in force, and says when it next opens outside one', () => {
 const hours = accessInForce([]).handoverHours;
 const at = (clock: string, on = '2026-09-15') => new Date(`${on}T${clock}:00+02:00`);
 assert.deepEqual(deskAt(hours, at('08:00')).open, true);
 assert.deepEqual(deskAt(hours, at('23:00')), { open: false, opens: { daysAhead: 1, date: '2026-09-16', from: hours[0]!.from } });
 assert.deepEqual(deskAt(hours, at('03:00')), { open: false, opens: { daysAhead: 0, date: '2026-09-15', from: hours[0]!.from } });
 // A window ends at its closing minute, not a minute after.
 assert.equal(deskAt(hours, at(hours[0]!.to)).open, false);
 // Midnight UTC is already two in the morning in Johannesburg, and the answer is Johannesburg's.
 assert.equal(deskAt(hours, new Date('2026-09-15T21:30:00Z')).open, false);
 const weekdays = [{ post: 'handover-desk', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '17:00' }];
 assert.deepEqual(deskAt(weekdays, at('10:00', '2026-09-19')), { open: false, opens: { daysAhead: 2, date: '2026-09-21', from: '08:00' } });
 // A rota with no window is refused as a setting; if one were handed in, there is no opening to promise.
 assert.deepEqual(deskAt([], at('08:00')), { open: false, opens: null });
});
