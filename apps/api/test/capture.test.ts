/**
 * Offline capture, from the server's side.
 *
 * The whole of this file runs against the real protection module — a real key ring, the real gate,
 * the real hash chain — because the two claims worth testing are that intake cannot get past the
 * gate and that nothing it writes down is a reading. Neither can be tested against a stub that says
 * yes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import capture from '../../../packages/catalog/capture.json' with { type: 'json' };
import { createProtectionModule, type ActorVetting, type CheckRecord } from '../src/protection/index.ts';
import {
 CaptureIntake, CONFLICT_ESCALATION_DAYS, DEVICE_CLOCK_TOLERANCE_MS, openCaptureStore,
 type Batch, type QueuedEntry, type RecordStanding
} from '../src/capture/index.ts';

const NOW = Date.UTC(2026, 8, 6, 9, 0, 0);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const IN_DATE = '2027-06-01';

/** Every check the role carries, verified, in date, high-risk ones seconded. */
function cleared(roleId: string, overrides: Record<string, Partial<CheckRecord>> = {}): CheckRecord[] {
 const role = vetting.roles.find(candidate => candidate.id === roleId)!;
 return role.checks.map(check => ({
  checkId: check.id, state: 'verified' as const, expiresOn: IN_DATE,
  ...(check.risk === 'high' ? { secondedBy: 'reviewer-2' } : {}),
  ...overrides[check.id]
 }));
}

function harness(options: { actors?: ActorVetting[]; records?: Record<string, RecordStanding> } = {}) {
 let clock = NOW;
 const now = () => clock;
 const db = new DatabaseSync(':memory:');
 const actors = new Map((options.actors ?? [
  { actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse') },
  { actorId: 'nurse-2', roleId: 'nurse', records: cleared('nurse') },
  { actorId: 'doctor-1', roleId: 'doctor', records: cleared('doctor') }
 ]).map(actor => [actor.actorId, actor] as const));
 const standings = new Map<string, RecordStanding>(Object.entries(options.records ?? {
  'vitals|V-1': { version: 1, state: 'open', changedAt: NOW - DAY }
 }));
 const protection = createProtectionModule(
  { environment: 'development', protectionKeys: `1:${randomBytes(32).toString('hex')}` },
  db,
  { vetting: { find: actorId => actors.get(actorId) ?? null }, releases: { find: () => null }, now }
 )!;
 const store = openCaptureStore(db);
 const intake = new CaptureIntake({
  gate: protection.gate, audit: protection.audit, store,
  records: { find: query => standings.get(`${query.recordType}|${query.recordId}`) ?? null },
  vetting: { find: actorId => actors.get(actorId) ?? null },
  now
 });
 return {
  intake, store, db, actors, standings, protection,
  now,
  at: (ms: number) => { clock = ms; },
  advance: (ms: number) => { clock += ms; },
  /* Every row the chain holds, read straight out of the table the audit store writes to. */
  chain: () => db.prepare('SELECT * FROM protected_access_log ORDER BY seq').all() as unknown as Record<string, unknown>[]
 };
}

let sequence = 0;
const entry = (over: Partial<QueuedEntry> = {}): QueuedEntry => ({
 entryId: `E-${++sequence}`,
 recordType: 'vitals', recordId: 'V-1', subjectId: 'patient-1', field: 'reading-1',
 capability: 'view-clinical-record', provenance: 'device',
 believedCapturedAt: NOW - HOUR, sawRecordVersion: 1,
 payload: Buffer.from('137/84 at the door, cuff L, meter 4471'),
 ...over
});

const batch = (over: Partial<Batch> = {}): Batch => ({
 deviceId: 'phone-7',
 actor: { id: 'nurse-1', role: 'nurse', purpose: 'treatment' },
 believedSentAt: NOW,
 entries: [entry()],
 ...over
});

const kinds = (answer: { conflicts: { kind: string }[] }) => answer.conflicts.map(conflict => conflict.kind).sort();

/* ---- One batch, ten answers ------------------------------------------------------------------ */

describe('a batch from a phone that has been out of signal', () => {
 test('answers per entry, so one refusal never costs the other nine', () => {
  const h = harness();
  const good = [entry(), entry({ field: 'reading-2' }), entry({ field: 'reading-3' })];
  const bad = entry({ field: 'reading-4', provenance: 'guessed' });
  const receipt = h.intake.receive(batch({ entries: [good[0]!, bad, good[1]!, good[2]!] }));

  assert.equal(receipt.answers.length, 4);
  assert.deepEqual(receipt.answers.map(answer => answer.state), ['stored', 'refused', 'stored', 'stored']);
  /* The refusal is the catalogue's own rule, said to the nurse rather than to a developer. */
  assert.match(receipt.answers[1]!.reason!, /Every reading carries exactly one provenance/);
  assert.ok(receipt.answers[1]!.reason!.includes('"guessed" is not one of the four'));
 });

 test('an entry against a record this server cannot describe is refused, not guessed at', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ entries: [entry({ recordId: 'V-does-not-exist' })] }));
  assert.equal(receipt.answers[0]!.state, 'refused');
  assert.match(receipt.answers[0]!.reason!, /no clinical record exists in this service/);
 });

 test('an entry with no device and no id of its own gets no place in the order at all', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ entries: [entry({ entryId: '' })] }));
  assert.equal(receipt.answers[0]!.state, 'refused');
  assert.equal(receipt.answers[0]!.seq, 0);
  assert.equal(h.store.count(), 0, 'nothing to be idempotent on is nothing to record');
  assert.ok(h.chain().some(row => row.event === 'capture.refused'), 'the refusal is still in the chain');
 });

 test('an entry that does not say which version of the record it saw is refused', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ entries: [entry({ sawRecordVersion: -1 })] }));
  assert.equal(receipt.answers[0]!.state, 'refused');
  assert.match(receipt.answers[0]!.reason!, /which version of the record/);
 });
});

/* ---- Retries ---------------------------------------------------------------------------------- */

describe('a connection that dropped before the receipt arrived', () => {
 test('records once, answers the same, and says the repeat was a repeat', () => {
  const h = harness();
  const sent = batch({ entries: [entry(), entry({ field: 'reading-2' })] });
  const first = h.intake.receive(sent);
  h.advance(30_000);
  const second = h.intake.receive(sent);

  assert.deepEqual(second.answers.map(answer => answer.repeated), [true, true]);
  assert.deepEqual(second.answers.map(answer => answer.seq), first.answers.map(answer => answer.seq));
  assert.deepEqual(second.answers.map(answer => answer.receivedAt), first.answers.map(answer => answer.receivedAt),
   'the receipt time is the first arrival, not the retry');
  assert.equal(h.store.count(), 2);
  assert.equal(h.chain().filter(row => row.event === 'capture.accepted').length, 2, 'accepted twice would be filed twice');
  assert.equal(h.chain().filter(row => row.event === 'capture.replayed').length, 2);
 });

 test('a retry does not raise a duplicate against itself', () => {
  const h = harness();
  const sent = batch();
  h.intake.receive(sent);
  const second = h.intake.receive(sent);
  assert.deepEqual(second.answers[0]!.conflicts, []);
  assert.equal(second.answers[0]!.state, 'stored');
 });
});

/* ---- Ordering --------------------------------------------------------------------------------- */

describe('the device clock is not the truth', () => {
 test('the server\'s receipt time orders, whatever the device believes', () => {
  const h = harness();
  /* A phone whose clock is four hours fast. It sends three entries in the order they were taken and
     dates them all in the future; the order they land in is the order they are kept in. */
  h.intake.receive(batch({
   believedSentAt: NOW + 4 * HOUR,
   entries: [
    entry({ field: 'reading-1', believedCapturedAt: NOW + 3 * HOUR }),
    entry({ field: 'reading-2', believedCapturedAt: NOW + HOUR }),
    entry({ field: 'reading-3', believedCapturedAt: NOW + 2 * HOUR })
   ]
  }));
  const ordered = h.intake.ordered('vitals', 'V-1');
  assert.deepEqual(ordered.map(row => row.entry.field), ['reading-1', 'reading-2', 'reading-3'],
   'sent first is first, even though the device dated the second one earliest');
  assert.ok(ordered[0]!.entry.seq < ordered[1]!.entry.seq && ordered[1]!.entry.seq < ordered[2]!.entry.seq);
 });

 test('the device\'s time is presented as a belief, with the skew said out loud', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ believedSentAt: NOW + 4 * HOUR + 12 * 60_000 }));
  assert.equal(receipt.skewMs, 4 * HOUR + 12 * 60_000);
  assert.match(receipt.skewSentence, /4 hours 12 minutes ahead of/);
  const sentence = receipt.answers[0]!.sentence;
  assert.match(sentence, /which is what orders it/);
  assert.match(sentence, /that is what the device believed, not when it happened/);
  assert.match(sentence, /4 hours 12 minutes ahead of/, 'a large skew is a fact somebody can ask about');
 });

 test('a device that did not say what time it thought it was is not recorded as agreeing', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ believedSentAt: Number.NaN }));
  assert.equal(receipt.skewMs, null, 'null is "it did not say"; zero would be "it agreed exactly"');
  assert.match(receipt.skewSentence, /did not say what time it thought it was/);
  assert.deepEqual(kinds(receipt.answers[0]!), []);
 });

 test('being offline for six hours is a queue, not a broken clock', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ entries: [entry({ believedCapturedAt: NOW - 6 * HOUR })] }));
  assert.deepEqual(kinds(receipt.answers[0]!), [], 'a nurse with no signal all morning is not a conflict');
  assert.match(receipt.answers[0]!.sentence, /It waited 6 hours on the device/);
 });
});

/* ---- The four conflicts ------------------------------------------------------------------------ */

describe('the four conflicts, and who settles each', () => {
 test('the catalogue is the authority on the resolver, and only one of them is the server', () => {
  const server = capture.conflicts.filter(conflict => conflict.resolution === 'server');
  assert.deepEqual(server.map(conflict => conflict.id), ['clock-skew']);
 });

 test('clock-skew is detected and settled by the server on receipt', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({ believedSentAt: NOW + DEVICE_CLOCK_TOLERANCE_MS + 60_000 }));
  const answer = receipt.answers[0]!;
  assert.equal(answer.state, 'stored', 'settled, so it is not held');
  assert.deepEqual(kinds(answer), ['clock-skew']);
  assert.equal(answer.conflicts[0]!.resolution, 'server');
  assert.equal(answer.conflicts[0]!.settledBy, 'server');
  assert.equal(answer.conflicts[0]!.settledAt, receipt.receivedAt);
  assert.equal(h.intake.held().length, 0);
 });

 test('a capture time after the moment it arrived is a clock conflict however small', () => {
  const h = harness();
  const receipt = h.intake.receive(batch({
   believedSentAt: NOW + 7000,
   entries: [entry({ believedCapturedAt: NOW + 5000 })]
  }));
  assert.deepEqual(kinds(receipt.answers[0]!), ['clock-skew'], 'seven seconds is well inside the tolerance');
  assert.match(receipt.answers[0]!.conflicts[0]!.finding, /cannot be right/);
 });

 test('two entries on one slot are both kept, and neither is chosen', () => {
  const h = harness();
  const first = h.intake.receive(batch({ entries: [entry()] })).answers[0]!;
  h.advance(4 * 60_000);
  const second = h.intake.receive(batch({ entries: [entry()] })).answers[0]!;

  assert.equal(first.state, 'stored');
  assert.equal(second.state, 'conflicted');
  assert.deepEqual(kinds(second), ['duplicate-observation']);
  assert.equal(second.conflicts[0]!.resolution, 'clinician');
  assert.equal(second.conflicts[0]!.settledAt, null, 'a timestamp does not win a clinical disagreement');
  /* Both are still there, in the server's order, and neither has been merged into the other. */
  const ordered = h.intake.ordered('vitals', 'V-1');
  assert.equal(ordered.length, 2);
  assert.deepEqual(ordered.map(row => row.entry.state), ['stored', 'conflicted']);
 });

 test('an entry against a record that has been signed is held, never applied silently', () => {
  const h = harness({ records: { 'vitals|V-1': { version: 2, state: 'signed', changedAt: NOW - HOUR } } });
  const answer = h.intake.receive(batch()).answers[0]!;
  assert.equal(answer.state, 'conflicted');
  assert.deepEqual(kinds(answer), ['stale-write']);
  assert.match(answer.conflicts[0]!.finding, /signed on 2026-09-06/);
  assert.equal(answer.conflicts[0]!.settledAt, null);
 });

 test('a record that moved on while the entry was queued is held too', () => {
  const h = harness({ records: { 'vitals|V-1': { version: 5, state: 'open', changedAt: NOW - HOUR } } });
  const answer = h.intake.receive(batch({ entries: [entry({ sawRecordVersion: 3 })] })).answers[0]!;
  assert.deepEqual(kinds(answer), ['stale-write']);
  assert.match(answer.conflicts[0]!.finding, /working from version 3 .* now at version 5/);
 });

 test('two conflicts at once: the server settles its one and holds the other', () => {
  const h = harness({ records: { 'vitals|V-1': { version: 4, state: 'open', changedAt: NOW - HOUR } } });
  const answer = h.intake.receive(batch({
   believedSentAt: NOW + 6 * HOUR,
   entries: [entry({ sawRecordVersion: 1 })]
  })).answers[0]!;
  assert.deepEqual(kinds(answer), ['clock-skew', 'stale-write']);
  assert.equal(answer.state, 'conflicted');
  const settled = answer.conflicts.filter(conflict => conflict.settledAt !== null).map(conflict => conflict.kind);
  assert.deepEqual(settled, ['clock-skew'], 'only the clock is the server\'s to settle');
 });

 test('nothing is auto-resolved except the clock, across every kind', () => {
  const h = harness({ records: { 'vitals|V-1': { version: 9, state: 'open', changedAt: NOW } } });
  h.intake.receive(batch({ believedSentAt: NOW + 9 * HOUR, entries: [entry(), entry()] }));
  const held = h.intake.held();
  assert.ok(held.length > 0);
  for (const { conflict } of held) {
   assert.equal(conflict.resolution, 'clinician');
   assert.notEqual(conflict.kind, 'clock-skew');
  }
 });
});

/* ---- The nurse whose clearance ran out while she was offline ---------------------------------- */

describe('the capturer\'s standing lapsed between capture and sync', () => {
 /* Her police clearance expired the day after the reading was taken. At the moment she syncs, the
    gate refuses her — correctly, and on its own arithmetic. The reading is neither discarded nor
    filed on her authority alone. */
 const lapsing = (): ActorVetting => ({
  actorId: 'nurse-1', roleId: 'nurse',
  records: cleared('nurse', { 'police-clearance': { expiresOn: '2026-09-05' } })
 });

 test('the reading is held for a clinician, and the gate still refused it', () => {
  const h = harness({ actors: [lapsing()] });
  const answer = h.intake.receive(batch({ entries: [entry({ believedCapturedAt: Date.UTC(2026, 8, 4, 8, 0, 0) })] })).answers[0]!;

  assert.equal(answer.state, 'conflicted');
  assert.deepEqual(kinds(answer), ['vetting-lapsed']);
  assert.equal(answer.conflicts[0]!.resolution, 'clinician');
  assert.equal(answer.conflicts[0]!.settledAt, null);
  /* The gate's own refusal is what the entry carries as its reason: nothing here overrode it. */
  assert.match(answer.reason!, /Police clearance lapsed/i);
  /* And nothing was sealed, because the gate would not seal it. */
  assert.equal(answer.sealed, undefined);
  assert.equal(h.store.find('phone-7', answer.entryId)!.payloadDigest, null);
 });

 test('it says which checks lapsed, what the device claims, and whether the claim can be vouched for', () => {
  const h = harness({ actors: [lapsing()] });
  const answer = h.intake.receive(batch({ entries: [entry({ believedCapturedAt: Date.UTC(2026, 8, 4, 8, 0, 0) })] })).answers[0]!;
  const finding = answer.conflicts[0]!.finding;
  assert.match(finding, /Police clearance/i);
  assert.match(finding, /would have cleared her/);
  assert.match(finding, /no earlier contact from this device/, 'a first sync has no window to corroborate against');
  assert.match(finding, /reconstructed from the evidence held today/, 'the limit is said, not hidden');
 });

 test('a claim inside the window between two contacts is corroborated; one outside it is not', () => {
  const h = harness({ actors: [lapsing()] });
  /* The Thursday sync, while she was still cleared. It is what the server can later vouch for: it
     saw this device on that day, so anything the device claims between then and its next contact is
     consistent with what the server itself observed. */
  const thursday = Date.UTC(2026, 8, 3, 7, 0, 0);
  h.at(thursday);
  h.intake.receive(batch({ believedSentAt: thursday, entries: [entry({ field: 'reading-0', believedCapturedAt: thursday - HOUR })] }));

  /* Friday's reading, taken while she was still cleared, arriving on the Sunday after her clearance
     ran out on the Saturday. */
  h.at(NOW);
  const inside = h.intake.receive(batch({ entries: [entry({ field: 'reading-1', believedCapturedAt: Date.UTC(2026, 8, 4, 8, 0, 0) })] })).answers[0]!;
  assert.deepEqual(kinds(inside), ['vetting-lapsed']);
  assert.match(inside.conflicts[0]!.finding, /which is a window this server observed/);

  /* And one the device dates before it last spoke to this server, which is a claim about its own
     clock and nothing the server saw. */
  const outside = h.intake.receive(batch({ entries: [entry({ field: 'reading-2', believedCapturedAt: Date.UTC(2026, 7, 20, 8, 0, 0) })] })).answers[0]!;
  assert.deepEqual(kinds(outside), ['vetting-lapsed']);
  assert.match(outside.conflicts[0]!.finding, /cannot corroborate it and it rests on the device's own clock/);
 });

 test('a nurse who was never cleared is refused rather than held', () => {
  const h = harness({
   actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { 'police-clearance': { state: 'outstanding' } }) }]
  });
  const answer = h.intake.receive(batch()).answers[0]!;
  assert.equal(answer.state, 'refused');
  assert.deepEqual(kinds(answer), [], 'nothing lapsed; she never had it');
 });

 test('a suspension is not a lapse, and does not become a conflict', () => {
  const h = harness({
   actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse'), suspended: true, suspendedReason: 'Under investigation.' }]
  });
  const answer = h.intake.receive(batch()).answers[0]!;
  assert.equal(answer.state, 'refused');
  assert.match(answer.reason!, /Under investigation/);
 });

 test('she does not settle it herself', () => {
  const h = harness({ actors: [lapsing(), { actorId: 'doctor-1', roleId: 'doctor', records: cleared('doctor') }] });
  const answer = h.intake.receive(batch({ entries: [entry({ believedCapturedAt: Date.UTC(2026, 8, 4, 8, 0, 0) })] })).answers[0]!;
  const herself = h.intake.settle(
   { id: 'nurse-1', role: 'nurse', purpose: 'treatment' },
   { deviceId: 'phone-7', entryId: answer.entryId },
   { as: 'stands', reason: 'It was fine.' }
  );
  assert.equal(herself.ok, false);
  assert.match(herself.reason, /nobody rules on their own clearance/);
 });
});

/* ---- Settlement ------------------------------------------------------------------------------- */

describe('a clinician settles what is held', () => {
 const doctor = { id: 'doctor-1', role: 'doctor', purpose: 'treatment' } as const;

 const twoOnOneSlot = () => {
  const h = harness();
  h.intake.receive(batch({ entries: [entry()] }));
  h.advance(60_000);
  const second = h.intake.receive(batch({ entries: [entry()] })).answers[0]!;
  return { h, second };
 };

 test('the superseded entry is kept, not deleted', () => {
  const { h, second } = twoOnOneSlot();
  const settled = h.intake.settle(doctor, { deviceId: 'phone-7', entryId: second.entryId },
   { as: 'superseded', reason: 'The first cuff reading stands; this retake was on the wrong arm.' });
  assert.ok(settled.ok);
  assert.equal(settled.entry.settledAs, 'superseded');
  assert.equal(settled.entry.state, 'stored');
  assert.equal(settled.conflicts[0]!.settledBy, 'doctor-1');
  assert.equal(h.intake.ordered('vitals', 'V-1').length, 2, 'both are still there');
  assert.equal(h.intake.held().length, 0);
 });

 test('a decision with no reason is refused', () => {
  const { h, second } = twoOnOneSlot();
  const settled = h.intake.settle(doctor, { deviceId: 'phone-7', entryId: second.entryId }, { as: 'stands', reason: '  ' });
  assert.equal(settled.ok, false);
  assert.match(settled.reason, /has to say why/);
 });

 test('the second clinician to decide is told, rather than overwriting the first', () => {
  const { h, second } = twoOnOneSlot();
  assert.ok(h.intake.settle(doctor, { deviceId: 'phone-7', entryId: second.entryId }, { as: 'stands', reason: 'This one is the accurate reading.' }).ok);
  const again = h.intake.settle(doctor, { deviceId: 'phone-7', entryId: second.entryId }, { as: 'not-filed', reason: 'On reflection.' });
  assert.equal(again.ok, false);
  assert.match(again.reason, /already settled it|Nothing on this entry is waiting/);
 });

 test('a clinician the gate refuses settles nothing', () => {
  const { h, second } = twoOnOneSlot();
  const stranger = h.intake.settle({ id: 'nobody-1', role: 'doctor', purpose: 'treatment' },
   { deviceId: 'phone-7', entryId: second.entryId }, { as: 'stands', reason: 'Because I say so.' });
  assert.equal(stranger.ok, false);
  assert.match(stranger.reason, /Nobody by that name has been vetted/);
  assert.equal(h.intake.held().length, 1);
 });

 test('a settled duplicate does not raise the same conflict against the next entry', () => {
  const { h, second } = twoOnOneSlot();
  h.intake.settle(doctor, { deviceId: 'phone-7', entryId: second.entryId },
   { as: 'not-filed', reason: 'Taken against the wrong visit; the nurse has recaptured it.' });
  assert.equal(h.store.find('phone-7', second.entryId)!.state, 'refused',
   'not filed, not lost, and distinguishable from a refusal the server made');
 });
});

/* ---- The chain --------------------------------------------------------------------------------- */

describe('everything lands in the hash chain, and none of it is a reading', () => {
 test('an accept, a refusal and a conflict are each in it, and the chain still verifies', () => {
  const h = harness({ records: { 'vitals|V-1': { version: 1, state: 'open', changedAt: NOW } } });
  h.intake.receive(batch({ entries: [entry(), entry({ provenance: 'guessed', field: 'reading-9' }), entry()] }));
  const events = h.chain().map(row => String(row.event));
  assert.ok(events.includes('capture.accepted'));
  assert.ok(events.includes('capture.refused'));
  assert.ok(events.includes('capture.conflicted'));
  assert.ok(events.includes('capture.conflict.duplicate-observation'));
  /* The gate wrote its own entries alongside, which is the point of going through it. */
  assert.ok(events.includes('record.sealed'));
  const verified = h.protection.audit.verify();
  assert.ok(verified.intact);
 });

 test('the payload appears nowhere in the log, and the log would not take it', () => {
  const h = harness();
  const secret = 'systolic 182 diastolic 118';
  h.intake.receive(batch({ entries: [entry({ payload: Buffer.from(secret) })] }));
  /* The digests are hex, so a three-digit run turns up inside one often enough that searching the
     raw JSON for "182" failed this test at random — which is worse than not having the test. What
     is searched is everything the chain wrote except its own digests, which is the only place a
     leaked reading could actually be read. */
  const written = JSON.stringify(h.chain(), (_key, value) =>
   typeof value === 'string' && /^[0-9a-f]{32,}$/.test(value) ? '<digest>' : value);
  assert.ok(!written.includes(secret));
  assert.ok(!written.includes('182'), `a reading leaked into the chain: ${written}`);
  /* Not left to whoever writes the next caller: the chain refuses a field it does not know. */
  assert.throws(() => h.protection.audit.append({ event: 'capture.accepted', payload: secret }),
   /may not carry "payload"/);
 });

 test('the ledger keeps a fingerprint of the sealed envelope and not the envelope', () => {
  const h = harness();
  const secret = 'glucose 3.1 mmol/L, strip lot 88213';
  const answer = h.intake.receive(batch({ entries: [entry({ payload: Buffer.from(secret) })] })).answers[0]!;
  const row = h.store.find('phone-7', answer.entryId)!;

  assert.ok(answer.sealed, 'the envelope goes back to the device');
  assert.equal(row.payloadDigest!.length, 64);
  assert.equal(row.keyVersion, 1);
  /* Nothing in the ledger row is the reading, and nothing in it is the ciphertext either. */
  const stored = JSON.stringify(row);
  assert.ok(!stored.includes(secret));
  assert.ok(!stored.includes(Buffer.from(answer.sealed!).toString('base64')));
  /* And the whole database holds no copy of it: not in the ledger, not in the chain. */
  const tables = h.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as unknown as { name: string }[];
  for (const table of tables) {
   const everything = JSON.stringify(h.db.prepare(`SELECT * FROM ${table.name}`).all());
   assert.ok(!everything.includes(secret), `${table.name} holds the reading`);
  }
 });

 test('the sealed envelope is opaque to everything outside the gate', () => {
  const h = harness();
  const secret = 'temperature 39.4 forehead';
  const answer = h.intake.receive(batch({ entries: [entry({ payload: Buffer.from(secret) })] })).answers[0]!;
  const envelope = Buffer.from(answer.sealed!);
  assert.ok(!envelope.toString('utf8').includes(secret));
  assert.ok(!envelope.toString('utf8').includes('39.4'));
  /* There is no method on the intake that returns a payload at all, opened or otherwise. */
  assert.ok(!Object.getOwnPropertyNames(Object.getPrototypeOf(h.intake)).some(name => /reveal|open|payload|read/i.test(name)));
 });
});

/* ---- Limbo ------------------------------------------------------------------------------------- */

describe('an entry conflicted for a year is a question, not a record', () => {
 const held = () => {
  const h = harness();
  h.intake.receive(batch({ entries: [entry()] }));
  h.advance(60_000);
  h.intake.receive(batch({ entries: [entry()] }));
  return h;
 };

 test('what has waited too long is reported rather than resolved', () => {
  const h = held();
  assert.equal(h.intake.overdue().length, 0);
  h.advance(CONFLICT_ESCALATION_DAYS * DAY);
  const overdue = h.intake.overdue();
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0]!.waitingDays, CONFLICT_ESCALATION_DAYS);
  assert.equal(overdue[0]!.conflict.settledAt, null, 'reporting it is not settling it');
 });

 test('disposal reaches what is settled and never what is still waiting', () => {
  const h = held();
  const wayPast = NOW + 400 * DAY;
  assert.equal(h.intake.disposable(wayPast), 1, 'the first entry was never in conflict');
  assert.equal(h.intake.dispose(wayPast), 1);
  assert.equal(h.store.count(), 1);
  assert.equal(h.intake.held().length, 1, 'the held one is still there, still asking');
 });

 test('the person is told what is kept about them, and that it is not a reading', () => {
  const h = held();
  const [kept] = h.intake.retainedFor('patient-1');
  assert.ok(kept);
  assert.match(kept.because, /does not hold the reading itself/);
  assert.equal(h.intake.retainedFor('patient-nobody').length, 0);
 });
});
