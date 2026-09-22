import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVital, type VitalInput } from './vitals.ts';
import vitalsContract from '../../../../packages/catalog/vitals.json' with { type: 'json' };

/* The vital-sign validator's own tests, added 22 September 2026 with /assistant/v1/vitals.

   What is being held down here is a boundary rather than an algorithm: this module says whether a
   number is shaped like the reading it claims to be, and never what the number means. So every
   bound in these tests is read out of packages/catalog/vitals.json rather than typed again — a
   test that hardcoded 300 as a heart-rate ceiling would keep passing after the contract moved, and
   would be testing nothing. The three things asserted hardest are the ones that protect a patient:
   a reading that failed anything is refused rather than clamped or stored, an identity-shaped
   value is refused before it is parsed as anything else, and a source that is not manual meets an
   empty device allowlist and is refused as unregistered until a data protection impact assessment
   puts a device on it. */

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const types = vitalsContract.types as Array<{
 id: string;
 loinc: string;
 unit: string;
 min: number;
 max: number;
}>;
const sources = vitalsContract.sources as string[];
const allowlist = vitalsContract.deviceAllowlist.real as string[];
const maxAgeMs = vitalsContract.staleness.maxAgeMs as number;

/* A reading that passes everything, so each test below changes exactly one fact about it and can
   name that fact as the reason for the refusal it meets. */
const reading = (over: Partial<VitalInput> = {}): VitalInput => ({
 type: 'heart-rate',
 value: 82,
 unit: '{beats}/min',
 capturedAt: new Date(NOW - 60_000).toISOString(),
 source: 'manual',
 ...over,
});

test('a manual reading inside its bounds is accepted, carrying the catalog’s own LOINC code and UCUM unit', () => {
 const verdict = validateVital(reading(), NOW);
 assert.equal(verdict.ok, true, 'a plausible manual reading is the one thing this route accepts');
 if (!verdict.ok) return;
 assert.deepEqual(verdict.reading, {
  type: 'heart-rate',
  loinc: '8867-4',
  value: 82,
  unit: '{beats}/min',
  capturedAt: new Date(NOW - 60_000).toISOString(),
  source: 'manual',
 });
 /* Nothing but the reading itself survives: no interpretation, no flag, no category and no
    score, because deciding what a heart rate means for this person is a ratified protocol's act
    and there is none. The exact key list is the assertion. */
 assert.deepEqual(Object.keys(verdict.reading).sort(), [
  'capturedAt',
  'loinc',
  'source',
  'type',
  'unit',
  'value',
 ]);
});

test('every type the contract registers is accepted at a value inside its own bounds', () => {
 for (const vital of types) {
  const verdict = validateVital(
   reading({
    type: vital.id,
    unit: vital.unit,
    value: (vital.min + vital.max) / 2,
   }),
   NOW,
  );
  assert.equal(verdict.ok, true, `${vital.id} at its midpoint must be accepted`);
  if (!verdict.ok) continue;
  assert.equal(verdict.reading.loinc, vital.loinc, `${vital.id} keeps the contract's LOINC code`);
  assert.equal(verdict.reading.unit, vital.unit, `${vital.id} keeps the contract's UCUM unit`);
 }
});

test('a type the contract does not register is refused, never read as the nearest one', () => {
 for (const type of ['blood-pressure', 'heart rate', 'sats', 'HEART-RATE', '']) {
  const verdict = validateVital(reading({ type }), NOW);
  assert.equal(verdict.ok, false, `"${type}" is not a registered type`);
  if (verdict.ok) continue;
  assert.equal(verdict.refusalId, 'reading-not-validated');
  assert.equal(verdict.status, 422);
 }
});

test('a unit that does not belong to the type is refused, so a value is never read as another measure', () => {
 /* The LOINC code and the UCUM unit are the pair that makes a number safe to carry: 120 in
    mm[Hg] is a blood pressure and 120 in {beats}/min is a heart rate, and a route that accepted
    either unit for either type would be storing one as the other. */
 const verdict = validateVital(reading({ unit: 'mm[Hg]' }), NOW);
 assert.equal(verdict.ok, false);
 if (!verdict.ok) {
  assert.equal(verdict.refusalId, 'reading-not-validated');
  assert.equal(verdict.status, 422);
 }
 const imperial = validateVital(reading({ unit: 'bpm' }), NOW);
 assert.equal(imperial.ok, false, 'a unit that is not UCUM is not the contract unit either');
});

test('a value outside its plausibility bound is refused at both ends, for every registered type', () => {
 for (const vital of types) {
  for (const value of [vital.min - 1, vital.max + 1]) {
   const verdict = validateVital(
    reading({ type: vital.id, unit: vital.unit, value }),
    NOW,
   );
   assert.equal(
    verdict.ok,
    false,
    `${vital.id} at ${value} is outside ${vital.min}–${vital.max} and must be refused`,
   );
   if (verdict.ok) continue;
   assert.equal(verdict.refusalId, 'reading-not-validated');
  }
  /* The bound is inclusive: a value sitting exactly on it is a real reading, and refusing it
     would be refusing the contract's own edge. */
  for (const value of [vital.min, vital.max]) {
   assert.equal(
    validateVital(reading({ type: vital.id, unit: vital.unit, value }), NOW).ok,
    true,
    `${vital.id} at ${value} is inside its bound`,
   );
  }
 }
});

test('a value that is not a finite number is refused rather than coerced', () => {
 for (const value of ['82', Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}]) {
  const verdict = validateVital(reading({ value }), NOW);
  assert.equal(verdict.ok, false, `${JSON.stringify(value) ?? 'undefined'} is not a number`);
  if (verdict.ok) continue;
  assert.equal(verdict.refusalId, 'reading-not-validated');
  assert.equal(verdict.status, 422);
 }
});

test('a stale reading is refused, and a fresh one is not', () => {
 const stale = validateVital(
  reading({ capturedAt: new Date(NOW - maxAgeMs - 1_000).toISOString() }),
  NOW,
 );
 assert.equal(stale.ok, false, 'a reading older than the contract window describes a person who may have changed since');
 if (!stale.ok) {
  assert.equal(stale.refusalId, 'reading-not-validated');
  assert.equal(stale.status, 422);
 }
 const justInside = validateVital(
  reading({ capturedAt: new Date(NOW - maxAgeMs + 1_000).toISOString() }),
  NOW,
 );
 assert.equal(justInside.ok, true, 'the window is the contract’s own, and its inside edge is inside');
 /* A timestamp that has not happened yet is a clock nobody can trust, and is refused on the same
    rule: a minute of slack covers a phone and a server disagreeing, and nothing more. */
 const future = validateVital(
  reading({ capturedAt: new Date(NOW + 120_000).toISOString() }),
  NOW,
 );
 assert.equal(future.ok, false, 'a reading from two minutes hence is not a reading');
});

test('a timestamp that cannot be read is refused rather than treated as now', () => {
 for (const capturedAt of ['yesterday', '', '2026-13-45', String(NOW)]) {
  const verdict = validateVital(reading({ capturedAt }), NOW);
  assert.equal(verdict.ok, false, `"${capturedAt}" is not a timestamp`);
  if (verdict.ok) continue;
  assert.equal(verdict.refusalId, 'reading-not-validated');
 }
});

test('a source the contract does not name is refused', () => {
 for (const source of ['fitbit', 'bluetooth', 'MANUAL', '']) {
  const verdict = validateVital(reading({ source }), NOW);
  assert.equal(verdict.ok, false, `"${source}" is not one of the contract's sources`);
  if (verdict.ok) continue;
  assert.equal(verdict.refusalId, 'reading-not-validated');
  assert.equal(verdict.status, 422);
 }
});

test('every non-manual source meets an empty allowlist and is refused as an unregistered device', () => {
 /* This is the DPIA gate in the validator's own terms: the contract's real-device allowlist is
    empty because no assessment has been done, so a device reading, a HealthKit reading and a
    Health Connect reading are all refused — with or without a device reference, because a
    reference to a device nobody registered is the thing being refused. */
 assert.deepEqual(allowlist, [], 'the contract’s real-device allowlist is empty until a DPIA is done');
 for (const source of sources.filter((entry) => entry !== 'manual')) {
  const bare = validateVital(reading({ source }), NOW);
  assert.equal(bare.ok, false, `${source} carries no registered device`);
  if (!bare.ok) {
   assert.equal(bare.refusalId, 'unregistered-device');
   assert.equal(bare.status, 422);
  }
  const named = validateVital(reading({ source, deviceRef: 'device-fixture-01' }), NOW);
  assert.equal(named.ok, false, `${source} naming an unregistered device is refused too`);
  if (!named.ok) assert.equal(named.refusalId, 'unregistered-device');
 }
});

test('a manual reading needs no device, and is not refused for the allowlist being empty', () => {
 assert.equal(validateVital(reading(), NOW).ok, true);
 assert.equal(
  validateVital(reading({ deviceRef: 'device-fixture-01' }), NOW).ok,
  true,
  'a device reference on a manual reading is carried past the allowlist, which is a manual source’s own rule',
 );
});

test('an identity-shaped value is refused before anything about it is read', () => {
 /* The PHI rule, and the reason it comes first: a field that should hold a type, a unit or a
    device reference and instead holds somebody's identity number is not a reading with a mistake
    in it, it is personal information this service was never asked to hold. It is refused whole —
    not redacted and stored — and the refusal is the same one a malformed reading meets, so the
    answer does not confirm that a number in the body was recognised as an identity number. */
 const identityShaped: Array<[string, VitalInput]> = [
  ['a South African identity number as the type', reading({ type: '8001015009087' })],
  ['an email address as the unit', reading({ unit: 'someone@example.com' })],
  ['a medical-aid number as the device reference', reading({ deviceRef: 'ABC123456' })],
  ['an international phone number as the source', reading({ source: '+27821234567' })],
  ['a local phone number beside a real reading', reading({ type: 'heart-rate 0821234567' })],
 ];
 for (const [why, input] of identityShaped) {
  const verdict = validateVital(input, NOW);
  assert.equal(verdict.ok, false, why);
  if (verdict.ok) continue;
  assert.equal(verdict.refusalId, 'reading-not-validated', why);
  assert.equal(verdict.status, 422, why);
 }
 /* Even a reading that would otherwise pass, with an identity number riding in the one optional
    field, is refused: the check is over every string the request carries. */
 const otherwise = validateVital(
  reading({ deviceRef: '8001015009087', source: 'manual' }),
  NOW,
 );
 assert.equal(otherwise.ok, false, 'a valid reading with an identity number in it is not a valid reading');
});

test('the validator is a question, not a write: it holds no reading and remembers no session', () => {
 /* Two identical calls answer identically, and neither leaves anything behind — the store the
    route writes to is ../lib/observations.ts's, handed a reading only after this said yes. A
    validator that kept state would be a second store nobody audited. */
 const first = validateVital(reading(), NOW);
 const second = validateVital(reading(), NOW);
 assert.deepEqual(first, second);
 assert.equal(validateVital(reading({ value: 400 }), NOW).ok, false);
 assert.deepEqual(
  validateVital(reading(), NOW),
  first,
  'a refusal in between changed nothing about the answer after it',
 );
});

test('the contract’s own darkness is a catalog fact, asserted so an edit to it is seen', () => {
 /* The route reads the switch from packages/catalog/vitals.json's testing block and its device
    gate from the same file's allowlist. Both are asserted here so that opening either is a
    deliberate catalog act that fails a test on the way past, rather than a quiet change to what a
    deployment accepts. */
 assert.deepEqual(vitalsContract.testing, {
  env: 'MYTHUSO_VITALS_TESTING',
  value: 'synthetic',
  why: vitalsContract.testing.why,
 });
 assert.equal(vitalsContract.darkForRealDevices.dpiA, 'not-done');
 assert.equal(vitalsContract.consent.required, true);
 assert.equal(maxAgeMs, 86_400_000, 'the staleness window is a day');
 assert.deepEqual(sources, ['manual', 'device', 'healthkit', 'healthconnect']);
});
