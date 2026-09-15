/* The desk queue carries exactly what the contract lets it, in the order a person picks things up. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, deskCarries, deskRoles, fieldSafety } from './rules.ts';
import { defaultTimings, defaultsInForce, panicWindowOf } from './settings.ts';
import { acknowledgeOverdue, startTimer, tick, type Timer } from './checkins.ts';
import { acknowledge, raisePanic, type Panic } from './panics.ts';
import { deskCounts, deskQueue } from './desk.ts';

const T0 = Date.UTC(2026, 8, 14, 6, 0);
const who = (ref: string | null) => ({ nurse: `Nurse ${ref}`, suburb: 'Soweto' });
const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => { assert.ok(r.ok); return (r as { value: T }).value; };
const overdueTimer = (ref: string, at: number): Timer => {
 const timer = ok(startTimer({ checkinRef: ref, event: { appointmentRef: `A-${ref}`, visitCodeMatched: true }, serviceId: 'mental', nurseRef: 'N-205' }, at, defaultsInForce));
 return ok(tick(timer, timer.dueAt));
};
const panicAt = (ref: string, at: number): Panic =>
 ok(raisePanic({ panicRef: ref, raisedByRole: 'nurse', nurseRef: 'N-206', locationShareMinutes: defaultTimings.panicWindowMinutes }, at, panicWindowOf([])));

test('every row carries the contract’s keys and none of the three it never carries', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const queue = deskQueue([overdueTimer('CHK-1', T0)], [panicAt('PNC-1', now - 5 * MINUTE)], now, who);
 assert.equal(queue.length, 2);
 for (const row of queue) {
  assert.deepEqual(Object.keys(row), [...deskCarries]);
  for (const never of fieldSafety.desk.neverCarries) assert.ok(!(never.field in row), `a desk row never carries ${never.field}`);
  /* The timer was for a mental-health visit. Nothing about that reaches the row. */
  assert.ok(!JSON.stringify(row).toLowerCase().includes('mental'));
 }
});

test('a panic nobody has picked up leads, then an overdue nobody has, then what the desk already has', () => {
 const now = T0 + 6 * 60 * MINUTE;
 const oldOverdue = overdueTimer('CHK-OLD', T0);
 const picked = ok(acknowledgeOverdue(overdueTimer('CHK-PICKED', T0 - 60 * MINUTE), 'O-801', now));
 const newPanic = panicAt('PNC-NEW', now - 2 * MINUTE);
 const pickedPanic = ok(acknowledge(panicAt('PNC-PICKED', now - 30 * MINUTE), { kind: 'person', role: deskRoles[0]!, ref: 'O-801' }, now));
 const queue = deskQueue([picked, oldOverdue], [pickedPanic, newPanic], now, who);
 assert.deepEqual(queue.map(row => row.reference), ['PNC-NEW', 'CHK-OLD', 'CHK-PICKED', 'PNC-PICKED']);
 assert.equal(queue[0].ageMinutes, 2);
 assert.deepEqual(deskCounts(queue), { waiting: 2, open: 4, panics: 2 });
});
