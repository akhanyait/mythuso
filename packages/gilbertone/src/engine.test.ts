import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage, evaluateMessage, normalizeText } from './engine.js';

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
