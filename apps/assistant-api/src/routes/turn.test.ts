import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTurn } from './turn.ts';

test('empty text asks for one rather than reporting unknown', async () => {
 const result = await handleTurn({ text: '', userConsent: true });
 assert.equal(result.route, 'clarify');
 assert.equal(result.classification, 'clarify');
});

test('whitespace-only text is treated the same as empty', async () => {
 const result = await handleTurn({ text: '   ', userConsent: true });
 assert.equal(result.route, 'clarify');
 assert.equal(result.classification, 'clarify');
});

test('withheld consent still asks for confirmation before the engine ever sees the text', async () => {
 const result = await handleTurn({ text: 'I need help', userConsent: false });
 assert.equal(result.route, 'unknown');
 assert.equal(result.requiresConfirmation, true);
 assert.equal(result.suggestedActions[0], 'confirm_message');
});

test('emergency wording is routed ahead of a handover word in the same message', async () => {
 const result = await handleTurn({ text: 'chest pain, please get me a nurse', userConsent: true });
 assert.equal(result.route, 'emergency');
 assert.equal(result.classification, 'emergency');
});

test('a plain care question reaches the shared engine and routes as standard', async () => {
 const result = await handleTurn({ text: 'When is my nurse coming?', userConsent: true });
 assert.equal(result.route, 'standard');
 assert.equal(result.classification, 'care');
});
