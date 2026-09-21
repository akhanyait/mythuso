import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The consent disclosure's own tests, added with its correction on 21 September 2026.

   WHY THE WORDS CHANGED. The gate before the first question used to tell every reader that
   "GilbertOne does not send what you say to MyThuso" — and with a model provider configured for
   the second tier, that sentence was false the moment anybody asked something the matcher could
   not place. The replacement says what is true: typed or transcribed text may be sent to the
   configured model provider after details that could identify the reader have been removed, no
   audio recording is kept, and the reader should avoid typing identifying health information.

   WHAT MUST NEVER MOVE WITH IT. The same section carries the emergency and refusal language — the
   prohibition list and the emergency notice — and the task that corrected the disclosure was
   explicit that none of it may be softened. So this file holds two edges at once: the sentences
   that had to change, asserted present in their new truthful form and absent in their old false
   one; and the sentences that must not change, asserted line for line. The rendered gate is held
   to this same contract by tests/assistant.spec.ts, which reads its assertions out of
   packages/catalog/assistant.json rather than restating them — so a drift between the file and
   the screen fails there, and a drift in the words themselves fails here. */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const consent = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/catalog/assistant.json'), 'utf8'),
).consent;

test('the privacy disclosure says where typed or transcribed text may go, and after what', () => {
  assert.ok(
    consent.privacyBody.includes('language model provider configured for MyThuso'),
    'the disclosure names the destination in the same breath as the question',
  );
  assert.ok(
    consent.privacyBody.includes('after details that could identify you have been removed'),
    'redaction is named as the condition the sending stands behind',
  );
  assert.ok(
    consent.privacyBody.includes('avoid typing identifying health information'),
    'the reader is asked plainly not to hand over what identifies her',
  );
  assert.ok(
    consent.privacyBody.includes('no audio recording'),
    'what is not kept is said about audio — the claim that is true of this product',
  );
  assert.ok(
    !consent.privacyBody.includes('does not send what you say'),
    'the sentence the second tier made false must never come back',
  );
});

test('the powered-by disclosure names the model’s share of an answer and its two refusals', () => {
  assert.ok(
    consent.poweredByBody.includes('approved sentences'),
    'the first tier is still the approved sentences',
  );
  assert.ok(
    consent.poweredByBody.includes('language model provider configured for MyThuso'),
    'the second tier is named where the platform is named',
  );
  assert.ok(
    consent.poweredByBody.includes('never to diagnose and never to prescribe'),
    'the model’s limits ride with its name, in the same sentence',
  );
  assert.ok(
    !consent.poweredByBody.includes('uses only approved sentences'),
    'the old sentence claimed the sentences were the whole of it',
  );
});

test('the emergency and refusal language is unchanged, line for line', () => {
  assert.deepEqual(
    consent.willNotDo,
    [
      'Never tells you what you have.',
      'Never suggests a medicine, dose, or change.',
      'Never makes an emergency sound less urgent.',
      'Never offers an appointment, a nurse, or a hospital bed that nobody has confirmed.',
      'No recording of your voice is made or kept.',
      'The microphone only listens while open.',
      'GilbertOne is not a person and not a doctor.',
      'A crisis is never left to GilbertOne alone.',
      'Not recognising an emergency does not mean there is not one.',
    ],
    'the prohibition list is a promise; a forgotten line and a softened line fail the same way here',
  );
  assert.equal(
    consent.emergencyNotice,
    'If you think it is an emergency, call {ambulance}, or {mobile} from a mobile.',
    'the emergency notice stands verbatim — not recognising an emergency is never made to sound like safety',
  );
});
