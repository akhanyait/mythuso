import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assembleHandover,
 createObservationStore,
 type HandoverPack,
 type ObservationStore,
} from './observations.ts';
import type { StoredReading } from './vitals.ts';
import { detectPHI } from '../../../../packages/gilbertone/src/phi.ts';

/* The session observation context and the handover pack's own tests, added 22 September 2026 with
   /assistant/v1/handover/prepare.

   Two things are being held down. The first is the pack's honesty: it is assembled from what the
   store actually holds, it names "not-triaged" as its urgency because no ratified protocol ran,
   and it carries no score, no priority and no category — the fields a clinician would act on are
   exactly the fields an unrated piece of software has no authority to invent. The second is its
   privacy: a handover pack is the artefact the PHI redactor exists for, it is the one thing this
   service builds that is meant to be read by another person, so every line of it is redacted and
   the whole serialised pack is asserted here to carry nothing detectable. A session with nothing
   validated on it is refused rather than handed over empty, because an empty pack sent to a
   clinician is a person's time spent on nothing. */

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const CAPTURED = '2026-09-22T11:30:00.000Z';
const SESSION = 'session-fixture-01';

const vital = (over: Partial<StoredReading> = {}): StoredReading => ({
 type: 'heart-rate',
 loinc: '8867-4',
 value: 82,
 unit: '{beats}/min',
 capturedAt: CAPTURED,
 source: 'manual',
 ...over,
});

/* The pack a test gets back, or a failure that names the test's own expectation rather than
   throwing something a reader has to decode. */
const packOf = (store: ObservationStore, sessionId = SESSION): HandoverPack => {
 const assembled = assembleHandover(store, sessionId, NOW);
 assert.equal(assembled.ok, true, 'this session was given a reading, so a pack exists');
 if (!assembled.ok) throw new Error('unreachable: the assertion above failed');
 return assembled.pack;
};

test('a session with no validated reading on it has nothing to hand over', () => {
 const store = createObservationStore();
 assert.deepEqual(assembleHandover(store, SESSION, NOW), { ok: false, nothing: true });
 /* A session that was never mentioned at all is the same answer, and not an error: the store
    holds nothing about it, which is the truth the route turns into its own 409. */
 assert.deepEqual(assembleHandover(store, 'session-never-seen', NOW), { ok: false, nothing: true });
 assert.deepEqual(store.readings(SESSION), []);
});

test('a validated reading becomes a pack, assembled at the moment it was asked for', () => {
 const store = createObservationStore();
 store.addReading(SESSION, vital());
 const pack = packOf(store);
 assert.equal(pack.preparedAt, new Date(NOW).toISOString(), 'the pack is stamped with the assembly time');
 assert.match(pack.handoverRef, /^handover-/, 'the reference names what it is');
 assert.equal(pack.vitals.length, 1);
 assert.equal(
  pack.vitals[0],
  `heart-rate 82 {beats}/min at ${CAPTURED}`,
  'the line carries the type, the value, the UCUM unit and when it was taken — a clinician’s four facts',
 );
 assert.deepEqual(pack.symptoms, [], 'no symptom list is held by this store, and none is invented');
 assert.deepEqual(pack.sources, [], 'no knowledge source is held by this store, and none is invented');
});

test('the pack’s urgency is "not-triaged", and it carries no score of any kind', () => {
 const store = createObservationStore();
 store.addReading(SESSION, vital());
 store.addReading(SESSION, vital({ type: 'oxygen-saturation', loinc: '59408-5', value: 98, unit: '%' }));
 const pack = packOf(store);
 assert.equal(
  pack.urgency,
  'not-triaged',
  'the honest answer while no ratified protocol has run: nobody was triaged here',
 );
 /* The banned family, asserted against the pack's own keys and values rather than against a
    comment: a handover that carried a number a clinician would act on would be a triage that
    nobody ratified. */
 for (const forbidden of ['score', 'priority', 'rank', 'rating', 'grade', 'band', 'percentile', 'weight']) {
  for (const key of Object.keys(pack)) {
   assert.equal(key.toLowerCase().includes(forbidden), false, `the pack must not carry a "${forbidden}" field`);
  }
 }
 assert.equal(
  /score|priority|triage category/i.test(JSON.stringify(pack)),
  false,
  'no value in the pack names a score, a priority or a triage category either',
 );
 assert.match(pack.summary, /No triage was run/, 'the summary says out loud what was not done');
});

test('the summary says what the pack holds and what it deliberately does not', () => {
 const store = createObservationStore();
 store.addReading(SESSION, vital());
 const one = packOf(store).summary;
 assert.match(one, /1 validated vital reading/, 'one reading reads as one');
 store.addReading(SESSION, vital({ type: 'body-temperature', loinc: '8310-5', value: 37, unit: 'Cel' }));
 const two = packOf(store).summary;
 assert.match(two, /2 validated vital readings/, 'two readings read as two, and the plural with them');
 assert.match(
  two,
  /transcript/,
  'the conversation lives in the conversation store and the summary names that it is not reproduced here',
 );
});

test('readings are listed in the order they were taken, and every one of them is listed', () => {
 const store = createObservationStore();
 const taken: Array<[string, number, string]> = [
  ['heart-rate', 82, '{beats}/min'],
  ['respiratory-rate', 16, '{breaths}/min'],
  ['oxygen-saturation', 98, '%'],
 ];
 taken.forEach(([type, value, unit], index) =>
  store.addReading(
   SESSION,
   vital({ type, value, unit, capturedAt: new Date(NOW - (taken.length - index) * 60_000).toISOString() }),
  ),
 );
 const pack = packOf(store);
 assert.equal(pack.vitals.length, taken.length);
 assert.deepEqual(store.readings(SESSION).map((entry) => entry.type), taken.map(([type]) => type));
 for (const [type, value, unit] of taken) {
  assert.ok(
   pack.vitals.some((line) => line.startsWith(`${type} ${value} ${unit} at `)),
   `${type} ${value} ${unit} is in the pack`,
  );
 }
});

test('one session’s readings never appear in another session’s pack', () => {
 /* The session id names a conversation and never a person, and it is the only thing separating
    two conversations' health information in this store — so the separation is asserted rather
    than assumed. */
 const store = createObservationStore();
 store.addReading(SESSION, vital({ value: 82 }));
 store.addReading('session-fixture-02', vital({ type: 'body-temperature', loinc: '8310-5', value: 39, unit: 'Cel' }));
 const pack = packOf(store);
 assert.equal(pack.vitals.length, 1);
 assert.equal(pack.vitals[0], `heart-rate 82 {beats}/min at ${CAPTURED}`);
 assert.deepEqual(assembleHandover(store, 'session-fixture-03', NOW), { ok: false, nothing: true });
});

test('every line of the pack is redacted, and the whole pack carries nothing detectable', () => {
 /* The store validates nothing of its own — validation is ../lib/vitals.ts's, on the way in — so
    the pack redacts on the way out rather than trusting that the front door caught everything. A
    reading whose type field carried an identity number is exactly the case: refused at the route,
    and unreadable here even if it somehow got stored. */
 const store = createObservationStore();
 store.addReading(SESSION, vital({ type: 'heart-rate 8001015009087' }));
 store.addReading(SESSION, vital({ type: 'respiratory-rate', loinc: '9279-1', value: 16, unit: '{breaths}/min', capturedAt: '2026-09-22T11:31:00.000Z' }));
 const pack = packOf(store);
 assert.equal(
  pack.vitals[0].includes('8001015009087'),
  false,
  'the identity number is not in the pack',
 );
 assert.match(pack.vitals[0], /\[ID REDACTED\]/, 'and its absence is visible as a redaction');
 assert.match(pack.vitals[1], /^respiratory-rate 16 \{breaths\}\/min at /, 'a clean line is untouched');
 /* The words a clinician would read, held to the detector: the summary and every reading line.
    The reference is left out of this assertion on purpose — it is a random identifier of this
    service's own making and holds no text, and a test that ran a detector over a random string
    would be a test that could fail on nothing. */
 assert.deepEqual(detectPHI(pack.summary), [], 'nothing detectable survives in the summary');
 for (const line of pack.vitals)
  assert.deepEqual(detectPHI(line), [], `nothing detectable survives in "${line}"`);
 assert.equal(
  JSON.stringify(pack).includes('8001015009087'),
  false,
  'and the number itself appears nowhere in the serialised pack, in any field',
 );
});

test('a pack is held against its own reference, and an unknown reference is simply absent', () => {
 const store = createObservationStore();
 store.addReading(SESSION, vital());
 const pack = packOf(store);
 store.addHandover(SESSION, pack);
 assert.deepEqual(store.handover(pack.handoverRef), pack, 'the reference finds the pack that was prepared');
 assert.equal(store.handover('handover-never-prepared'), undefined, 'and nothing else');
 /* Two preparations are two packs with two references: a submission would look one up by the
    reference the person was shown, so a second preparation must not overwrite the first. */
 const second = packOf(store);
 store.addHandover(SESSION, second);
 assert.notEqual(second.handoverRef, pack.handoverRef);
 assert.deepEqual(store.handover(pack.handoverRef), pack);
 assert.deepEqual(store.handover(second.handoverRef), second);
});

test('a fresh store holds nothing, and nothing in it survives a reading that was never added', () => {
 const store = createObservationStore();
 assert.deepEqual(store.readings(SESSION), []);
 assert.equal(store.handover('handover-fixture'), undefined);
 assert.deepEqual(assembleHandover(store, SESSION, NOW), { ok: false, nothing: true });
 /* Two stores are two sessions' worth of separation: the factory makes a new one per call, which
    is what the server's live seam does once per process. */
 const other = createObservationStore();
 store.addReading(SESSION, vital());
 assert.deepEqual(other.readings(SESSION), [], 'a second store is not the first');
});
