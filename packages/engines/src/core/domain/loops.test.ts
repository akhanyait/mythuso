/* The closed loop's arithmetic on its own: who a concern goes to next and for how long, when a post is
   skipped, what a panic alerts, when a concern runs out of people, and the order the Control Tower reads
   concerns in. The rota is the one in packages/catalog/closed-loop.json's settings, read through the
   settings code, so a changed default or a changed post moves these tests with it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTimeOf, proposeChange, snapshotOf, type Change } from '../../settings/shape.ts';
import { coreBlock, coreSettings, rotaOf } from './settings.ts';
import { MINUTE_MS, everyPostOnDuty, holdersOf, nextHolder, postOf, settle, stateCodeOf, towerOrder, type KeptRota, type Loop } from './loops.ts';

/* A Tuesday, where the rota is kept. */
const MORNING = Date.parse('2026-09-15T09:00:00+02:00');
const NIGHT = Date.parse('2026-09-15T01:20:00+02:00');
const SPAN = 20 * MINUTE_MS;
const defaults = rotaOf(snapshotOf(coreBlock, []));
const loop = (overrides: Partial<Loop> = {}): Loop => ({
 loopRef: 'loop-synthetic', sourceEngine: 'safety', purpose: 'emergency', ownerRole: 'nurse', fallbackRole: 'ops-desk', holder: { kind: 'owner' }, rota: defaults,
 alerted: null, severity: null, openedAt: MORNING, dueBy: MORNING + SPAN, spanMs: SPAN, acknowledgedAt: null, acknowledgedByRole: null, exhaustedAt: null, announcedAt: null,
 closedAt: null, outcomeRef: null, closedByRole: null, alertRef: null, rung: null, dedupeKey: null, recordEntryRef: null, ...overrides
});
/* The rota with one setting changed through the rules an admin's change goes through. */
function changed(setting: string, value: unknown): KeptRota {
 const result = proposeChange(coreSettings, [], { setting, value, reason: 'Synthetic.', expectedVersion: 1, byRole: 'admin', byRef: 'A-901' }, MORNING);
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return rotaOf(snapshotOf(coreBlock, [result.value.change as Change]));
}

test('the rota is read on the day and at the time where it is kept', () => {
 assert.deepEqual(localTimeOf(MORNING), { day: 'tue', time: '09:00' });
 assert.deepEqual(localTimeOf(Date.parse('2026-09-13T22:00:00Z')), { day: 'mon', time: '00:00' }, 'midnight is 00:00, never 24:00');
});

test('a concern nobody takes on goes to its fallback for the owner’s time, then up the posts in order, each for its own minutes, and runs out of people after the last', () => {
 const steps = settle(loop(), MORNING + 24 * 60 * MINUTE_MS);
 const posts = defaults.posts;
 const held = posts.filter(post => post.role !== null);
 assert.ok(held.length >= 2 && held.length < posts.length, 'these walks expect a rota with a post no role holds yet, after the posts that are held');
 assert.deepEqual(steps.map(s => [s.kind, s.loop.ownerRole, s.loop.holder.kind]), [
  ['escalated', 'ops-desk', 'fallback'],
  ...held.map(post => ['escalated', post.role, 'post']),
  ['exhausted', held.at(-1)!.role, 'post']
 ]);
 const fallback = MORNING + SPAN;
 assert.equal(steps[0]!.loop.dueBy, fallback + SPAN, 'the fallback is given the time the owner had');
 let reached = fallback + SPAN;
 held.forEach((post, index) => {
  const step = steps[index + 1]!;
  assert.equal(step.at, reached, `${post.id} is reached at the deadline before it, not when somebody looked`);
  assert.equal(postOf(step.loop)?.id, post.id);
  reached += defaults.stepsMs[index]!;
  assert.equal(step.loop.dueBy, reached, `${post.id} holds it for its own minutes`);
 });
 const last = steps.at(-1)!;
 assert.equal(last.loop.exhaustedAt, reached);
 assert.deepEqual(last.skipped, posts.slice(held.length).map(post => ({ post: post.id, because: 'no-role' })), 'a post no role holds is skipped and says so, never given to another role');
 assert.deepEqual(settle(last.loop, reached * 2), [], 'an exhausted concern is never moved again');
});

test('a post not on duty when the concern reaches it is skipped, and the skip names it', () => {
 /* Owner until 01:40, fallback until 02:00: the desk is not on at two in the morning. */
 const [desk, lead] = defaults.posts;
 const night = loop({ openedAt: NIGHT, dueBy: NIGHT + SPAN });
 const [toFallback, toPost] = settle(night, NIGHT + 2 * SPAN);
 assert.equal(toFallback!.loop.holder.kind, 'fallback');
 assert.deepEqual(toPost!.skipped, [{ post: desk!.id, because: 'off-duty' }]);
 assert.equal(postOf(toPost!.loop)?.id, lead!.id);
 assert.equal(toPost!.loop.ownerRole, lead!.role);
 assert.equal(toPost!.loop.dueBy, NIGHT + 2 * SPAN + defaults.stepsMs[1]!, 'the post it went to holds it for its own minutes, not the skipped post’s');
});

test('a concern keeps the rota it was opened under: a changed rota reaches the next concern and never one already escalating', () => {
 const shorter = changed('escalation-minutes', [1, 10]);
 assert.deepEqual([shorter.settingsVersion, shorter.stepsMs], [2, [MINUTE_MS, 10 * MINUTE_MS]]);
 const atFallback = { holder: { kind: 'fallback' as const }, ownerRole: 'ops-desk', dueBy: MORNING };
 assert.equal(nextHolder(loop(atFallback), MORNING).spanMs, defaults.stepsMs[0], 'opened before the change, it keeps the minutes it was opened with');
 assert.equal(nextHolder(loop({ ...atFallback, rota: shorter }), MORNING).spanMs, MINUTE_MS, 'opened after it, it reads the new ones');
});

test('a panic alerts every post on duty at once, walks nothing and reads no minutes, and anybody it alerted may take it on', () => {
 const posts = defaults.posts;
 const onInTheMorning = everyPostOnDuty(defaults, MORNING);
 assert.deepEqual(onInTheMorning.alerted.map(p => p.id), posts.filter(p => p.role !== null).map(p => p.id), 'every post a role holds is on duty at nine');
 assert.deepEqual(onInTheMorning.skipped, posts.filter(p => p.role === null).map(p => ({ post: p.id, because: 'no-role' })));
 assert.deepEqual(everyPostOnDuty(changed('escalation-minutes', [60, 60]), MORNING), onInTheMorning, 'the minutes change nothing a panic alerts');
 const atNight = everyPostOnDuty(defaults, Date.parse('2026-09-15T02:00:00+02:00'));
 assert.ok(atNight.skipped.some(s => s.because === 'off-duty'), 'a post not on duty at two in the morning is not alerted');
 assert.ok(atNight.alerted.length >= 1, 'somebody is on duty at every hour');

 const panic = loop({ holder: { kind: 'every-post' }, fallbackRole: null, alerted: onInTheMorning.alerted.map(p => p.id), ownerRole: onInTheMorning.alerted[0]!.role! });
 assert.deepEqual(holdersOf(panic), onInTheMorning.alerted.map(p => p.role));
 assert.equal(nextHolder(panic, MORNING + SPAN).holder, null, 'nobody comes after every post');
 assert.deepEqual(settle(panic, MORNING + SPAN).map(s => s.kind), ['exhausted'], 'a panic nobody took on is exhausted, never walked up a rota');
});

test('the clock leaves a concern that has been taken on, run out of people or been closed exactly where it is', () => {
 assert.deepEqual(settle(loop(), MORNING + SPAN - 1), [], 'before its deadline');
 assert.deepEqual(settle(loop({ acknowledgedAt: MORNING }), MORNING + SPAN * 9), [], 'an acknowledged concern waits for its outcome');
 assert.deepEqual(settle(loop({ exhaustedAt: MORNING + SPAN }), MORNING + SPAN * 9), []);
 assert.deepEqual(settle(loop({ closedAt: MORNING }), MORNING + SPAN * 9), []);
 const [moved] = settle(loop({ acknowledgedAt: null }), MORNING + SPAN);
 assert.deepEqual([moved!.loop.acknowledgedAt, stateCodeOf(moved!.loop)], [null, 'open'], 'a new holder has not taken it on');
 assert.equal(stateCodeOf({ ...moved!.loop, exhaustedAt: MORNING + SPAN * 4, acknowledgedAt: MORNING + SPAN * 5 }), 'exhausted', 'acknowledging an exhausted concern does not stop it being exhausted');
});

test('the Control Tower reads exhausted concerns first, longest exhausted at the top, then what nobody has taken on, then the rest', () => {
 const order = towerOrder([
  loop({ loopRef: 'acknowledged-soon', dueBy: 1, acknowledgedAt: 0 }),
  loop({ loopRef: 'open-later', dueBy: 50 }),
  loop({ loopRef: 'exhausted-recently', exhaustedAt: 40 }),
  loop({ loopRef: 'closed', closedAt: 3, exhaustedAt: 1 }),
  loop({ loopRef: 'open-sooner', dueBy: 20 }),
  loop({ loopRef: 'exhausted-long-ago', exhaustedAt: 10 })
 ]).map(l => l.loopRef);
 assert.deepEqual(order, ['exhausted-long-ago', 'exhausted-recently', 'open-sooner', 'open-later', 'acknowledged-soon']);
});
