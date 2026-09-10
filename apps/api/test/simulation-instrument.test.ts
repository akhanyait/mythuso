/**
 * The simulated instrument, through the seam that already exists.
 *
 * There is no feed here and there must not be one — packages/catalog/feeds.json says so under
 * `noSeam`, and the reason is that `apps/api/src/capture/**` is the seam. So the test that matters
 * is that what this produces is a batch the real intake takes, and that every reading carries its
 * mark: a fixture indistinguishable from a real reading is the whole hazard of simulating an
 * instrument at all.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import capture from '../../../packages/catalog/capture.json' with { type: 'json' };
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { CaptureIntake, openCaptureStore, type RecordStanding } from '../src/capture/index.ts';
import { PROVENANCES, isProvenance } from '../src/capture/contract.ts';
import { createProtectionModule, type ActorVetting, type CheckRecord } from '../src/protection/index.ts';
import { simulatorFor } from '../src/simulation/index.ts';
import { INSTRUMENTS, PROVENANCE, SIMULATED_MARK, isInstrumentRefusal, reading } from '../src/simulation/instrument.ts';

const AT = new Date('2026-09-10T09:00:00Z');
const NOW = AT.getTime();

/** Every check the role carries, verified, in date, high-risk ones seconded. */
const cleared = (roleId: string): CheckRecord[] =>
 vetting.roles.find(role => role.id === roleId)!.checks.map(check => ({
  checkId: check.id, state: 'verified' as const, expiresOn: '2027-06-01',
  ...(check.risk === 'high' ? { secondedBy: 'reviewer-2' } : {})
 }));

/** The real gate, the real chain, the real ledger. A stub that says yes would prove nothing here. */
function harness(actorId: string) {
 const db = new DatabaseSync(':memory:');
 const actors = new Map<string, ActorVetting>([[actorId, { actorId, roleId: 'nurse', records: cleared('nurse') }]]);
 const standings = new Map<string, RecordStanding>([['vitals|V-1001', { version: 1, state: 'open', changedAt: NOW - 86_400_000 }]]);
 const protection = createProtectionModule(
  { environment: 'development', protectionKeys: `1:${randomBytes(32).toString('hex')}` },
  db,
  { vetting: { find: id => actors.get(id) ?? null }, releases: { find: () => null }, now: () => NOW }
 )!;
 return new CaptureIntake({
  gate: protection.gate, audit: protection.audit, store: openCaptureStore(db),
  records: { find: query => standings.get(`${query.recordType}|${query.recordId}`) ?? null },
  vetting: { find: id => actors.get(id) ?? null },
  now: () => NOW
 });
}

describe('the simulated instrument', () => {
 test('answers no feed, because the devices capability has no route and must not grow one', () => {
  /* The registry is keyed by feed and this stands in front of a batch, so it is not in it. Asserted
     rather than left implicit: the day somebody adds a devices route, this test is what says the
     contract's own `noSeam` reasoning was overruled. */
  assert.equal(simulatorFor('devices'), undefined);
  assert.equal(capture.devices.length, INSTRUMENTS.length);
 });

 test('produces an entry the capture contract would recognise, for every instrument in the catalogue', () => {
  for (const instrument of INSTRUMENTS) {
   const answer = reading({ subject: 'V-1001', at: AT, detail: { instrumentId: instrument.id } });
   assert.ok(!isInstrumentRefusal(answer));
   const [entry] = answer.batch.entries;
   assert.ok(entry);
   assert.ok(isProvenance(entry.provenance), `${instrument.id}: "${entry.provenance}" is not a provenance the catalogue declares`);
   assert.ok(instrument.measures.includes(entry.field), `${instrument.id} produced a reading for ${entry.field}, which it does not measure`);
   assert.equal(typeof entry.believedCapturedAt, 'number');
   assert.equal(typeof entry.sawRecordVersion, 'number');
  }
 });

 test('carries exactly one provenance, and it is one of the four — no default and no unknown', () => {
  assert.ok(PROVENANCES.includes(PROVENANCE as typeof PROVENANCES[number]));
  const answer = reading({ subject: 'V-1001', at: AT });
  assert.ok(!isInstrumentRefusal(answer));
  assert.equal(answer.batch.entries[0]!.provenance, PROVENANCE);
 });

 test('marks the device, the entry and the sealed bytes as simulated', () => {
  const answer = reading({ subject: 'V-1001', at: AT });
  assert.ok(!isInstrumentRefusal(answer));
  assert.ok(answer.batch.deviceId.startsWith(SIMULATED_MARK), answer.batch.deviceId);
  assert.ok(answer.batch.entries[0]!.entryId.startsWith(SIMULATED_MARK));
  assert.ok(new TextDecoder().decode(answer.batch.entries[0]!.payload).startsWith(SIMULATED_MARK));
 });

 test('puts no reading in the bytes it hands over', () => {
  /* This service holds no clinical record and there is nothing to file a value into. A fixture that
     invented a systolic pressure to have something to seal would be inventing a reading about a
     person who does not exist, in a service whose boundary check fails the build on a clinical
     table. So the payload is the mark and the run, and nothing that parses as a measurement. */
  const answer = reading({ subject: 'V-1001', at: AT });
  assert.ok(!isInstrumentRefusal(answer));
  /* Exactly the mark, the instrument and the visit, and nothing else. Asserted as equality rather
     than as an absence, because "there is no measurement in here" is a claim about everything that
     could be in there and the only way to make it is to say what is. */
  assert.equal(
   new TextDecoder().decode(answer.batch.entries[0]!.payload),
   `${SIMULATED_MARK}:${answer.instrument.id}:V-1001`
  );
 });

 test('renders the capability\'s own simulation notice with every reading', () => {
  const answer = reading({ subject: 'V-1001', at: AT });
  assert.ok(!isInstrumentRefusal(answer));
  assert.equal(answer.notice, 'The instrument is simulated. No Bluetooth session is opened and no device is contacted.');
  assert.equal(answer.supplier, 'A simulated instrument, in process.');
 });

 test('reads the same visit the same way, on any machine', () => {
  assert.deepEqual(reading({ subject: 'V-77', at: AT }), reading({ subject: 'V-77', at: AT }));
 });

 test('syncs through the real intake, the real gate and the real chain', () => {
  /* The end of the journey, and the reason the devices simulator produces a batch rather than a
     feed payload: what comes out of it is taken by the intake this product already has, decided
     against a nurse's own current standing, and sealed by the gate. Nothing here is a stub. */
  const answer = reading({
   subject: 'V-1001', at: AT,
   detail: { recordType: 'vitals', recordId: 'V-1001', capability: 'view-clinical-record' }
  });
  assert.ok(!isInstrumentRefusal(answer));
  const receipt = harness('V-1001').receive(answer.batch);
  assert.equal(receipt.answers.length, 1);
  assert.equal(receipt.answers[0]!.state, 'stored', receipt.answers[0]!.reason);
  assert.equal(receipt.answers[0]!.conflicts.length, 0);
  /* The device id the ledger now holds for ever says a fixture produced this. */
  assert.ok(receipt.deviceId.startsWith(SIMULATED_MARK));
 });

 describe('refuses', () => {
  test('a caller asking it to open a radio session', () => {
   const answer = reading({ subject: 'V-1001', at: AT, detail: { openSession: true } });
   assert.ok(isInstrumentRefusal(answer));
   assert.equal(answer.refused, 'Open a Bluetooth or eSIM session.');
   assert.equal(answer.seam, 'apps/api/src/capture/**');
  });

  test('a caller asking for a reading with the mark taken off', () => {
   const answer = reading({ subject: 'V-1001', at: AT, detail: { withoutTheMark: true } });
   assert.ok(isInstrumentRefusal(answer));
   assert.equal(answer.refused, 'Produce a reading without its provenance mark.');
  });
 });
});
