import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTurn,
  createConversation,
  getContext,
  hasActiveEscalation,
  resolveSlot,
  TURN_LIMIT,
  type ConversationState,
  type Turn,
} from './conversation.ts';

const turnOf = (n: number, over: Partial<Turn> = {}): Turn => ({
  turnId: `t${n}`,
  parentTurnId: n > 1 ? `t${n - 1}` : null,
  text: `message ${n}`,
  classification: 'care',
  route: 'standard',
  timestamp: n,
  audience: 'patient',
  slots: {},
  ...over,
});

test('createConversation returns an empty state', () => {
  const state = createConversation('session-1');
  assert.equal(state.sessionId, 'session-1');
  assert.deepEqual(state.turns, []);
  assert.equal(state.activeTask, null);
  assert.deepEqual(state.unresolvedSlots, []);
  assert.equal(state.escalationState, 'none');
  assert.deepEqual(state.consentScope, []);
});

test('addTurn appends and returns a new state without touching the old one', () => {
  const before = createConversation('session-1');
  const after = addTurn(before, turnOf(1));
  assert.notEqual(after, before);
  assert.equal(before.turns.length, 0);
  assert.equal(after.turns.length, 1);
  assert.equal(after.turns[0].turnId, 't1');
});

test('addTurn caps the history at twenty turns and drops the oldest', () => {
  let state = createConversation('session-1');
  for (let n = 1; n <= 25; n += 1) state = addTurn(state, turnOf(n));
  assert.equal(state.turns.length, TURN_LIMIT);
  assert.equal(state.turns[0].turnId, 't6');
  assert.equal(state.turns[TURN_LIMIT - 1].turnId, 't25');
});

test('getContext reads the last five classifications', () => {
  let state = createConversation('session-1');
  const spoken: Turn['classification'][] = ['care', 'care', 'emergency', 'identity', 'voice', 'care'];
  spoken.forEach((classification, index) => {
    state = addTurn(state, turnOf(index + 1, { classification }));
  });
  const context = getContext(state);
  assert.deepEqual(context.recentClassifications, ['care', 'emergency', 'identity', 'voice', 'care']);
  assert.equal(context.turnCount, 6);
  assert.equal(context.activeTask, 'care');
});

test('hasActiveEscalation follows the turns and the state', () => {
  let state = createConversation('session-1');
  assert.equal(hasActiveEscalation(state), false);
  /* a handover request is pending, not active: the queue has been asked for, not raised */
  state = addTurn(state, turnOf(1, { classification: 'handover', route: 'handover' }));
  assert.equal(state.escalationState, 'pending');
  assert.equal(hasActiveEscalation(state), false);
  state = addTurn(state, turnOf(2, { classification: 'emergency', route: 'emergency' }));
  assert.equal(state.escalationState, 'active');
  assert.equal(hasActiveEscalation(state), true);
  /* and nothing after it lowers the escalation */
  state = addTurn(state, turnOf(3));
  assert.equal(state.escalationState, 'active');
  assert.equal(hasActiveEscalation(state), true);
  /* a state raised directly counts too */
  const raised: ConversationState = { ...createConversation('session-2'), escalationState: 'active' };
  assert.equal(hasActiveEscalation(raised), true);
});

test('resolveSlot fills the newest turn and strikes the slot off the list', () => {
  const opened: ConversationState = {
    ...createConversation('session-1'),
    unresolvedSlots: ['visit-day', 'phone'],
  };
  const asked = addTurn(opened, turnOf(1));
  const resolved = resolveSlot(asked, 'visit-day', 'Tuesday');
  assert.notEqual(resolved, asked);
  assert.deepEqual(resolved.unresolvedSlots, ['phone']);
  assert.deepEqual(resolved.turns[resolved.turns.length - 1].slots, { 'visit-day': 'Tuesday' });
  /* the state it was given is untouched */
  assert.deepEqual(asked.unresolvedSlots, ['visit-day', 'phone']);
  assert.deepEqual(asked.turns[asked.turns.length - 1].slots, {});
});

test('resolveSlot with no turns yet still clears the slot', () => {
  const opened: ConversationState = {
    ...createConversation('session-1'),
    unresolvedSlots: ['phone'],
  };
  const resolved = resolveSlot(opened, 'phone', '082 000 0000');
  assert.deepEqual(resolved.unresolvedSlots, []);
  assert.deepEqual(resolved.turns, []);
});
