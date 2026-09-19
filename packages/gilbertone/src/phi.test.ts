import test from 'node:test';
import assert from 'node:assert/strict';
import { containsPHI, detectPHI, luhnValid, redactPHI } from './phi.ts';

/* Two thirteen-digit numbers of the same shape, and the only difference this detector cares
   about: one ends on a check digit the Luhn sum accepts, the other does not. The first is treated
   as an identity number; the second is a reference number having a bad day, and refusing to call
   it an identity number is the false positive this check exists to prevent. */
const VALID_ID = '8001015009087';
const NON_LUHN_ID = '8501015009087';

test('the Luhn check separates identity numbers from bare runs of digits', () => {
  assert.equal(luhnValid(VALID_ID), true);
  assert.equal(luhnValid(NON_LUHN_ID), false);
  assert.equal(luhnValid('not digits'), false);
  assert.equal(luhnValid(''), false);
});

test('detects an identity number that passes the Luhn check', () => {
  assert.equal(containsPHI(`my id number is ${VALID_ID}`), true);
  assert.deepEqual(detectPHI(`my id number is ${VALID_ID}`), [
    { name: 'sa-id-number', match: VALID_ID },
  ]);
});

test('leaves a thirteen-digit number that fails the Luhn check alone', () => {
  const text = `my reference number is ${NON_LUHN_ID}`;
  assert.equal(containsPHI(text), false);
  assert.deepEqual(detectPHI(text), []);
  assert.equal(redactPHI(text), text);
});

test('detects an international phone number', () => {
  assert.deepEqual(detectPHI('call me on +27821234567'), [
    { name: 'phone-intl', match: '+27821234567' },
  ]);
  assert.equal(containsPHI('ring +27 82 123 4567 now'), true);
});

test('detects a local phone number', () => {
  assert.deepEqual(detectPHI('call me on 082 123 4567'), [
    { name: 'phone-local', match: '082 123 4567' },
  ]);
  assert.equal(containsPHI('my number is 0821234567'), true);
});

test('detects an email address', () => {
  assert.deepEqual(detectPHI('email me at nurse@gilbert.co.za'), [
    { name: 'email', match: 'nurse@gilbert.co.za' },
  ]);
});

test('detects a medical aid member number', () => {
  assert.deepEqual(detectPHI('my medical aid number is DISC12345678'), [
    { name: 'medical-aid', match: 'DISC12345678' },
  ]);
});

test('redactPHI replaces every kind of detail it finds, and nothing else', () => {
  const raw =
    'mail nurse@gilbert.co.za, ring 0821234567, id 8001015009087, aid DISC12345678, call +27821234567';
  const redacted = redactPHI(raw);
  assert.equal(
    redacted,
    'mail [EMAIL REDACTED], ring [PHONE REDACTED], id [ID REDACTED], aid [MEDICAL AID REDACTED], call [PHONE REDACTED]',
  );
  for (const original of [
    'nurse@gilbert.co.za',
    '0821234567',
    '8001015009087',
    'DISC12345678',
    '+27821234567',
  ]) {
    assert.equal(redacted.includes(original), false, original);
  }
});

test('ordinary health sentences are not mistaken for sensitive detail', () => {
  const ordinary = [
    'I have 5 tablets left',
    'my appointment is at 10',
    'the nurse is coming on Tuesday morning',
    'I am 62 years old',
    'I take two pills in the morning',
  ];
  for (const sentence of ordinary) {
    assert.equal(containsPHI(sentence), false, sentence);
    assert.deepEqual(detectPHI(sentence), [], sentence);
    assert.equal(redactPHI(sentence), sentence, sentence);
  }
});

test('the same call answers the same twice', () => {
  /* The patterns carry /g, and a shared RegExp remembers where it stopped: these functions build
     a fresh expression per call, and this is the test that says so. */
  const sentence = `my id is ${VALID_ID} and my phone is 0821234567`;
  const first = detectPHI(sentence);
  const second = detectPHI(sentence);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    { name: 'sa-id-number', match: VALID_ID },
    { name: 'phone-local', match: '0821234567' },
  ]);
});
