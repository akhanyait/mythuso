/**
 * Simulated positions, and the refusal the whole feed is arranged around.
 *
 * packages/catalog/feeds.json calls it the single most important refusal in its file: a position
 * feed carries no patient id, no visit id, no track and no address. The first suite below does not
 * take that on trust and does not restate the list either — it reads `neverAccepts` out of the
 * contract, takes every spelling of every entry, canonicalises each one the way the ingestion
 * boundary does, and walks what the simulator produced at every depth looking for a match. A field
 * added to that list tomorrow is checked here tomorrow, without this file being edited, which is the
 * only version of this test that is worth having: a hand-written list of four field names would go
 * on passing for ever after the contract grew a fifth.
 *
 * It is then asked a second time from the other side, by running the payload through `decide` — the
 * real door a real supplier will meet. `not-connected` is the answer it reserves for a payload it
 * found nothing wrong with, so one assertion covers the shape, the forbidden scan, the unknown
 * fields, the missing fields and the types at once.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DEPTH, canonical, decide, feedById } from '../src/feeds/index.ts';
import { forbiddenIndex } from '../src/feeds/contract.ts';
import { refusalsOf } from '../src/simulation/contract.ts';
import { isRefusal, type SimulatedEvent } from '../src/simulation/index.ts';
import { SIMULATED_NURSES, arrivalFrom, deviceOf, nurseById, nursePosition, positionOn, zoneNamed } from '../src/simulation/care.ts';

const FEED = feedById('nurse-position')!;
const FORBIDDEN = forbiddenIndex(FEED);
const NOW = new Date();
const MELVILLE = zoneNamed('Melville')!;

const answer = (subject: string, detail?: Record<string, unknown>) => nursePosition.produce({ subject, at: NOW, detail });
const position = (subject: string, detail?: Record<string, unknown>): SimulatedEvent => {
 const produced = answer(subject, detail);
 assert.ok(!isRefusal(produced), `${subject} was refused: ${isRefusal(produced) ? produced.refused : ''}`);
 return produced as SimulatedEvent;
};

/** Every key in a structure, at every depth, in the one canonical form the contract computes. */
function everyKey(value: unknown, depth = 0): string[] {
 if (depth > MAX_DEPTH) return [];
 if (Array.isArray(value)) return value.flatMap(item => everyKey(item, depth + 1));
 if (typeof value !== 'object' || value === null) return [];
 return Object.entries(value as Record<string, unknown>)
  .flatMap(([key, nested]) => [canonical(key), ...everyKey(nested, depth + 1)]);
}

describe('a position never carries who is being visited', () => {
 test('the contract has something to refuse, so this test cannot pass by finding nothing', () => {
  assert.ok(FEED.neverAccepts.length >= 4);
  assert.ok(FORBIDDEN.size > FEED.neverAccepts.length, 'every alternative spelling is indexed too');
  assert.ok(FEED.neverAccepts.some(never => never.field === 'patientId'));
 });

 test('no simulated position names a forbidden field, at any depth, in any spelling', () => {
  for (const nurse of SIMULATED_NURSES) {
   for (const detail of [undefined, { towards: 'melville', minutesIn: 0 }, { towards: 'soweto', minutesIn: 45 }]) {
    const produced = answer(nurse.id, detail);
    if (isRefusal(produced)) continue;
    for (const key of everyKey(produced.payload)) {
     assert.ok(!FORBIDDEN.has(key), `${nurse.id} produced "${key}", which ${FEED.id} never accepts`);
    }
   }
  }
 });

 test('the whole event, and not only the payload, is clean of them', () => {
  const produced = position('N-205', { towards: 'melville', minutesIn: 5 });
  for (const key of everyKey(produced)) assert.ok(!FORBIDDEN.has(key));
 });

 test('the ingestion boundary agrees, and finds nothing else wrong either', () => {
  const refusal = decide(FEED, position('N-205', { towards: 'melville', minutesIn: 5 }).payload);
  assert.equal(refusal.kind, 'not-connected');
  assert.equal(refusal.forbidden, null);
  assert.equal(refusal.unknownFields, 0);
  assert.deepEqual(refusal.missing, []);
  assert.deepEqual(refusal.wrongType, []);
 });

 test('it carries exactly the five fields the feed accepts', () => {
  assert.deepEqual(
   Object.keys(position('N-205').payload).sort(),
   FEED.accepts.map(accepted => accepted.field).sort()
  );
 });
});

describe('a request that carries one is refused before anything else is looked at', () => {
 test('a patient id in the request is refused, however it is spelled', () => {
  for (const spelling of ['patientId', 'patient_id', 'PATIENT-ID', 'beneficiaryId', 'memberId']) {
   const produced = answer('N-205', { [spelling]: 'anything', towards: 'melville' });
   assert.ok(isRefusal(produced), `${spelling} was not refused`);
   assert.ok(produced.refused.includes('patient id'));
  }
 });

 test('a visit id, a track and an address are refused in the same sentence', () => {
  for (const spelling of ['visitId', 'bookingId', 'track', 'breadcrumbs', 'address', 'formattedAddress']) {
   assert.ok(isRefusal(answer('N-205', { [spelling]: 'anything' })), `${spelling} was not refused`);
  }
 });

 test('nesting one three deep does not get it past the door', () => {
  const produced = answer('N-205', { context: { visit: { history: [{ patientRef: 'x' }] } } });
  assert.ok(isRefusal(produced));
 });

 test('it is refused even where the party is one nobody has heard of', () => {
  const produced = answer('N-999', { patientId: 'x' });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('patient id'), 'the interesting fact is not lost behind the cheap one');
 });
});

describe('nothing is drawn on a doorstep and nothing is claimed that was not derived', () => {
 test('a coordinate as a destination is refused as what it is', () => {
  for (const detail of [{ towards: { lat: -26.17, lng: 28.04 } }, { lat: -26.17 }, { lng: 28.04 }, { towards: '12 Oak Road, Melville' }]) {
   const produced = answer('N-205', detail);
   assert.ok(isRefusal(produced), `${JSON.stringify(detail)} was not refused`);
   assert.ok(produced.refused.includes('home'));
  }
 });

 test('a device that is telling nobody anything produces no position at all', () => {
  const silent = nurseById('N-207')!;
  assert.equal(silent.sharesPosition, false);
  const produced = answer(silent.id, { towards: 'melville' });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('arrival time'));
 });

 test('a fix wider than the suburb it would be drawn in is not drawn', () => {
  const indoors = nurseById('N-208')!;
  const device = deviceOf(indoors);
  assert.ok(device.accuracyMetres > indoors.zone!.radiusKm * 1000, 'the fixture must actually be a poor fix in a small suburb');
  const produced = answer(indoors.id, { towards: 'soweto' });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('arrival time'));
 });

 test('asking this feed to state the arrival is refused rather than answered', () => {
  for (const spelling of ['etaMinutes', 'eta', 'arrivesAt', 'minutesAway']) {
   const produced = answer('N-205', { towards: 'melville', [spelling]: 12 });
   assert.ok(isRefusal(produced), `${spelling} was not refused`);
   assert.ok(produced.refused.includes('arrival time'));
  }
 });

 test('the arrival is derived from the position, by name, with its basis attached', () => {
  const produced = position('N-205', { towards: 'melville', minutesIn: 0 });
  const eta = arrivalFrom(produced.payload as { lat: number; lng: number }, MELVILLE);
  assert.equal(eta.basis, 'straight-line');
  assert.ok(eta.minutes !== null && eta.minutes >= 1, 'one minute is the floor; nought reads as "she is at the gate"');
  assert.ok(eta.speedKmh !== null, 'a number without the speed it was divided by is a number with no basis');
 });

 test('every sentence the capability refuses is one this simulator actually says', () => {
  const declared = refusalsOf('dispatch');
  const fired = new Set<string>();
  const requests: Record<string, unknown>[] = [
   { patientId: 'x' }, { towards: { lat: -26.1, lng: 28.0 } }, { towards: 'melville', etaMinutes: 5 }
  ];
  for (const detail of requests) {
   const produced = answer('N-205', detail);
   if (isRefusal(produced)) fired.add(produced.refused);
  }
  assert.deepEqual([...fired].sort(), [...declared].sort());
 });
});

describe('the same nurse stands in the same place on every machine', () => {
 test('two identical requests produce an identical coordinate', () => {
  const first = position('N-205', { towards: 'melville', minutesIn: 4 }).payload;
  const second = position('N-205', { towards: 'melville', minutesIn: 4 }).payload;
  assert.equal(first.lat, second.lat);
  assert.equal(first.lng, second.lng);
  assert.equal(first.accuracyMetres, second.accuracyMetres);
 });

 test('she moves toward the suburb rather than sitting on its centre from the start', () => {
  const nurse = nurseById('N-205')!;
  const start = positionOn(nurse, nurse.zone!, MELVILLE, 0);
  const halfway = positionOn(nurse, nurse.zone!, MELVILLE, 4);
  const arrived = positionOn(nurse, nurse.zone!, MELVILLE, 600);
  assert.notDeepEqual(start, halfway);
  assert.deepEqual(arrived, { lat: MELVILLE.at.lat, lng: MELVILLE.at.lng });
 });

 test('every coordinate is rounded to the precision geography.json declares', () => {
  for (const minutesIn of [0, 1, 3, 7, 19]) {
   const { lat, lng } = position('N-206', { towards: 'melville', minutesIn }).payload as { lat: number; lng: number };
   assert.equal(lat, Math.round(lat * 1000) / 1000);
   assert.equal(lng, Math.round(lng * 1000) / 1000);
  }
 });
});
