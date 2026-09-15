/* The closed loop's arithmetic on its own: when the clock moves a concern, when it stops, and the order
   the Control Tower reads concerns in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canMove, dueAction, escalated, stateCodeOf, towerOrder, type Loop } from './loops.ts';

const SPAN = 1_000;
const loop = (overrides: Partial<Loop> = {}): Loop => ({
 loopRef: 'loop-synthetic', sourceEngine: 'safety', purpose: 'emergency', ownerRole: 'nurse', fallbackRole: 'ops-desk', escalated: false,
 openedAt: 0, dueBy: SPAN, spanMs: SPAN, acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null,
 closedAt: null, outcomeRef: null, closedByRole: null, alertRef: null, rung: null, dedupeKey: null, recordEntryRef: null, ...overrides
});

test('the clock moves an unacknowledged concern to its fallback once, then marks it exhausted, and touches nothing else', () => {
 assert.equal(dueAction(loop(), SPAN - 1), null, 'before its deadline');
 assert.equal(dueAction(loop(), SPAN), 'escalate');
 assert.equal(dueAction(loop({ escalated: true }), SPAN), 'exhaust', 'nobody after the fallback');
 assert.equal(dueAction(loop({ acknowledgedAt: 1 }), SPAN * 9), null, 'an acknowledged concern waits for its outcome');
 assert.equal(dueAction(loop({ escalated: true, exhaustedAt: SPAN }), SPAN * 9), null, 'an exhausted concern is not moved again');
 assert.equal(dueAction(loop({ closedAt: 1 }), SPAN * 9), null);
});

test('a fallback is given the time the owner had, from when it is moved, and has not acknowledged it', () => {
 const moved = escalated(loop({ acknowledgedAt: 5, acknowledgedByRole: 'nurse' }), SPAN * 3);
 assert.deepEqual([moved.ownerRole, moved.dueBy, moved.acknowledgedAt, moved.escalated, canMove(moved)], ['ops-desk', SPAN * 4, null, true, false]);
 assert.equal(stateCodeOf(moved), 'open');
 assert.equal(stateCodeOf({ ...moved, exhaustedAt: SPAN * 4, acknowledgedAt: SPAN * 5 }), 'exhausted', 'acknowledging an exhausted concern does not stop it being exhausted');
});

test('the Control Tower reads exhausted concerns first, longest exhausted at the top, then what nobody has taken on, then the rest', () => {
 const order = towerOrder([
  loop({ loopRef: 'acknowledged-soon', dueBy: 1, acknowledgedAt: 0 }),
  loop({ loopRef: 'open-later', dueBy: 50 }),
  loop({ loopRef: 'exhausted-recently', exhaustedAt: 40, escalated: true }),
  loop({ loopRef: 'closed', closedAt: 3, exhaustedAt: 1 }),
  loop({ loopRef: 'open-sooner', dueBy: 20 }),
  loop({ loopRef: 'exhausted-long-ago', exhaustedAt: 10, escalated: true })
 ]).map(l => l.loopRef);
 assert.deepEqual(order, ['exhausted-long-ago', 'exhausted-recently', 'open-sooner', 'open-later', 'acknowledged-soon']);
});
