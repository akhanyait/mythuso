import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage, classifyWithConfidence, evaluateMessage, normalizeText } from './engine.ts';
import type { ConversationContext } from './conversation.ts';

test('normalizes basic input', () => {
  assert.equal(normalizeText("I can't breathe!"), 'i cant breathe');
});

test('recognises emergency wording before anything else', () => {
  const result = evaluateMessage('I feel like I might hurt myself');
  assert.equal(result.classification, 'emergency');
  assert.equal(result.route, 'emergency');
});

test('recognises a request to talk to a nurse', () => {
  const result = evaluateMessage('Can I talk to a nurse?');
  assert.equal(result.classification, 'handover');
  assert.equal(result.route, 'handover');
});

test('recognises identity questions', () => {
  const result = evaluateMessage('Who are you?');
  assert.equal(result.classification, 'identity');
  assert.equal(result.route, 'standard');
});

test('recognises care questions', () => {
  const result = evaluateMessage('When is my nurse coming?');
  assert.equal(result.classification, 'care');
  assert.equal(result.route, 'standard');
});

test('clarifies when the request is vague', () => {
  const result = evaluateMessage('I do not understand this');
  assert.equal(result.classification, 'clarify');
  assert.equal(result.route, 'clarify');
});

test('returns an unknown route for other inputs', () => {
  const result = evaluateMessage('I am trying to remember my appointment details');
  assert.equal(classifyMessage('I am trying to remember my appointment details'), 'unknown');
  assert.equal(result.route, 'unknown');
});

test('the audience scopes the patient-voiced routes', () => {
  /* The nurse queue a handover offers belongs to a patient's conversation, and the care terms ask
     about the patient's own visit: behind a staff preview the same words are not that request. */
  assert.equal(classifyMessage('Can I talk to a nurse?', 'nurse'), 'unknown');
  assert.equal(classifyMessage('When is my nurse coming?', 'doctor'), 'unknown');
  /* and the patient keeps both. */
  assert.equal(classifyMessage('Can I talk to a nurse?'), 'handover');
  assert.equal(classifyMessage('When is my nurse coming?'), 'care');
});

test('an emergency is an emergency for every audience', () => {
  const result = evaluateMessage('I have chest pains', 'control-tower');
  assert.equal(result.classification, 'emergency');
  assert.equal(result.route, 'emergency');
});

test("a staff audience is told the scope, not offered the patient's doors", () => {
  const result = evaluateMessage('can you check the stock levels', 'partner');
  assert.equal(result.classification, 'unknown');
  assert.equal(result.route, 'unknown');
  assert.deepEqual(result.suggestedActions, ['identity', 'voice', 'emergency']);
});

test('a message that matches one category is fully that category', () => {
  const result = classifyWithConfidence('Who are you?');
  assert.equal(result.classification, 'identity');
  assert.equal(result.confidence, 1);
});

test('a message that is several things at once is divided among them', () => {
  /* Identity is listed above voice, so it wins — at half confidence rather than whichever the
     engine happened to check last. */
  const result = classifyWithConfidence('Who are you, can you hear me?');
  assert.equal(result.classification, 'identity');
  assert.equal(result.confidence, 0.5);
});

test('nothing matched is unknown at zero', () => {
  const result = classifyWithConfidence('I am trying to remember my appointment details');
  assert.equal(result.classification, 'unknown');
  assert.equal(result.confidence, 0);
  const empty = classifyWithConfidence('');
  assert.equal(empty.classification, 'unknown');
  assert.equal(empty.confidence, 0);
});

test('context lifts a match the last two turns already were', () => {
  const context: ConversationContext = {
    recentClassifications: ['identity', 'identity'],
    activeTask: null,
    turnCount: 2,
  };
  const result = classifyWithConfidence('Who are you, can you hear me?', 'patient', context);
  assert.equal(result.classification, 'identity');
  assert.ok(Math.abs(result.confidence - 0.65) < 1e-9);
});

test('one prior turn, a disagreement, or another subject does not lift anything', () => {
  const one: ConversationContext = { recentClassifications: ['identity'], activeTask: null, turnCount: 1 };
  const disagreed: ConversationContext = { recentClassifications: ['identity', 'voice'], activeTask: null, turnCount: 2 };
  const other: ConversationContext = { recentClassifications: ['voice', 'voice'], activeTask: null, turnCount: 2 };
  assert.equal(classifyWithConfidence('Who are you, can you hear me?', 'patient', one).confidence, 0.5);
  assert.equal(classifyWithConfidence('Who are you, can you hear me?', 'patient', disagreed).confidence, 0.5);
  assert.equal(classifyWithConfidence('Who are you, can you hear me?', 'patient', other).confidence, 0.5);
});

test('the boost never carries confidence past one', () => {
  const context: ConversationContext = { recentClassifications: ['care', 'care'], activeTask: 'care', turnCount: 2 };
  const result = classifyWithConfidence('When is my nurse coming?', 'patient', context);
  assert.equal(result.classification, 'care');
  assert.equal(result.confidence, 1);
});

test('classifyMessage is the classification half of the same answer', () => {
  for (const input of [
    'I have chest pain',
    'Can I talk to a nurse?',
    'Who are you?',
    'I do not understand this',
    'nothing in here matches anything',
  ]) {
    assert.equal(classifyMessage(input), classifyWithConfidence(input).classification, input);
  }
  /* the audience argument still travels the same way */
  assert.equal(
    classifyMessage('When is my nurse coming?', 'doctor'),
    classifyWithConfidence('When is my nurse coming?', 'doctor').classification,
  );
});

test('evaluateMessage now carries the confidence beside the words', () => {
  const emergency = evaluateMessage('I feel like I might hurt myself');
  assert.equal(emergency.classification, 'emergency');
  assert.equal(emergency.confidence, 1);
  const unknown = evaluateMessage('I am trying to remember my appointment details');
  assert.equal(unknown.classification, 'unknown');
  assert.equal(unknown.confidence, 0);
});
