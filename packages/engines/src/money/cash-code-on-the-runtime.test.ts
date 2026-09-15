/**
 * Money's cash code on the runtime, read from the store as it is at rest.
 *
 * The runtime's own tests prove a secret is kept out of the replay table and a refusal keeps only the
 * writes its route names, on synthetic routes. These prove the same things on Money's real ones, because
 * the defect the Money lead found was a real cash code sitting in a real replay row: the store file is
 * opened directly, beside the runtime, and read as anybody with the sqlite shell would read it.
 *
 * The nurse's entry, POST /v1/money/payments/{paymentRef}/cash-code@2, and the desk's release,
 * POST /v1/money/payments/{paymentRef}/release@2, are bound by Money's own engine. Version one of each was
 * declared and never built, and is withdrawn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import moneyApi from '../../../catalog/apis/money.json' with { type: 'json' };
import { createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { money, refusal, serviceById } from './domain/contract.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-14T09:00:00+02:00';
const ENTRY: RouteKey = 'POST /v1/money/payments/{paymentRef}/cash-code@2';
const RELEASE: RouteKey = 'POST /v1/money/payments/{paymentRef}/release@2';
const LIMIT = money.cash.attemptLimit;
const REASON = money.cash.releaseReasons[0]!.id;
const route = (path: string, version: number) => moneyApi.routes.find(r => r.method === 'POST' && r.path === path && r.version === version)!;
const SHOWN_ONCE = route('/v1/money/payments', 2).secretResponseFields!.find(s => s.field === 'cashCode')!.shownOnce;

const care = () => {
 const queue: { key: EventKey; payload: Record<string, unknown> }[] = [];
 return {
  queue,
  module: defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' }, tick: ctx => { for (const e of queue.splice(0)) ctx.publish(e.key, e.payload, { subjectRef: 'subj-lerato', purposeOfUse: 'treatment' }); } })
 };
};

function world() {
 const dir = mkdtempSync(join(tmpdir(), 'mythuso-engines-money-cash-'));
 const publisher = care();
 const runtime = createRuntime({ env: FLAG, engines: [publisher.module, engine], dataDirectory: dir, clock: createClock(START) });
 publisher.queue.push({ key: 'appointment.booked@2', payload: { appointmentRef: 'APT-1', clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00', serviceId: 'vitals' } });
 runtime.advance(1000);
 const raw = (sql: string) => {
  const db = new DatabaseSync(join(dir, 'money.sqlite'));
  try { return db.prepare(sql).all() as Record<string, unknown>[]; } finally { db.close(); }
 };
 const docs = (table: string) => raw(`SELECT doc FROM ${table} ORDER BY rowid`).map(row => JSON.parse(String(row['doc'])) as Record<string, unknown>);
 const payCash = () => runtime.call('POST /v1/money/payments@2', {
  role: 'patient', ref: 'subj-lerato', purpose: 'billing',
  fields: { idempotencyKey: 'k-cash', payableRef: 'PB-APT-1', method: 'cash-otp', amountCents: serviceById('vitals').price * 100 }
 });
 const billable = () => {
  publisher.queue.push({ key: 'visit.billable@1', payload: { appointmentRef: 'APT-1', serviceId: 'vitals', clinicianRef: 'N-205' } });
  runtime.advance(1000);
 };
 const enter = (code: string, key: string, paymentRef: string, ref = 'N-205') => runtime.call(ENTRY, { role: 'nurse', ref, purpose: 'billing', fields: { idempotencyKey: key, paymentRef, code } });
 const release = (key: string, paymentRef: string, reasonCode?: string) => runtime.call(RELEASE, { role: 'ops-desk', ref: 'O-801', purpose: 'billing', fields: { idempotencyKey: key, paymentRef, ...(reasonCode ? { reasonCode } : {}) } });
 return { runtime, raw, docs, payCash, billable, enter, release };
}
const said = (id: string) => ({ error: id, message: refusal(id).statement });

test('the entry route keeps, on a wrong code, exactly the code row and the audit, and declares the code a secret request field', () => {
 const entry = route('/v1/money/payments/{paymentRef}/cash-code', 2);
 assert.deepEqual([...(entry.keptOnRefusal?.tables ?? [])].sort(), ['cash_audit', 'cash_codes']);
 assert.deepEqual([...(entry.keptOnRefusal?.refusals ?? [])].sort(), ['cash-code-held', 'cash-without-otp']);
 assert.deepEqual((entry.secretRequestFields ?? []).map(s => s.field), ['code']);
 assert.equal(route('/v1/money/payments/{paymentRef}/cash-code', 1).withdrawn?.supersededBy, ENTRY);
 assert.equal(route('/v1/money/payments/{paymentRef}/release', 1).withdrawn?.supersededBy, RELEASE);
});

test('a cash payment through payments@2 shows its code once, and the replay table at rest holds none of its digits', () => {
 const { runtime, raw, docs, payCash } = world();
 const first = payCash();
 assert.equal(first.status, 200, JSON.stringify(first.body));
 const code = String(first.body['cashCode']);
 assert.match(code, /^\d{6}$/, 'the patient is shown the code the one time it is issued');
 const replays = raw('SELECT route, body FROM _runtime_replays');
 const stored = replays.filter(row => row['route'] === 'POST /v1/money/payments@2');
 assert.equal(stored.length, 1, 'the answer was stored for replay');
 for (const row of replays) assert.ok(!String(row['body']).includes(code), `the cash code's digits are at rest in the replay row for ${row['route']}`);
 assert.ok(!('cashCode' in JSON.parse(String(stored[0]!['body']))), 'the replay row keeps the field at all');
 for (const doc of docs('cash_codes')) {
  assert.deepEqual(Object.keys(doc).sort(), ['digest', 'held', 'salt', 'wrongAttempts']);
  assert.ok(!Object.values(doc).includes(code));
 }
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the same idempotency key again answers the contract’s shownOnce sentence in the code’s place, and no code', () => {
 const { runtime, payCash } = world();
 const first = payCash();
 const code = String(first.body['cashCode']);
 const again = payCash();
 assert.equal(again.status, 200);
 assert.equal(again.body['cashCode'], SHOWN_ONCE);
 assert.ok(!JSON.stringify(again.body).includes(code), 'a replay handed the code back');
 assert.equal(again.body['paymentRef'], first.body['paymentRef'], 'the replay is the same payment');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('before the visit is billable the code is refused and nothing is counted; a payment that is not cash and another nurse are refused before a code is compared', () => {
 const { runtime, docs, payCash, billable, enter } = world();
 const paid = payCash();
 const code = String(paid.body['cashCode']);
 const paymentRef = String(paid.body['paymentRef']);
 assert.deepEqual(enter(code, 'early', paymentRef).body, said('cash-before-the-visit-finished'));
 billable();
 assert.deepEqual(enter(code, 'nothing', 'PAY-NOTHING-SYNTHETIC').body, said('payable-not-found'));
 assert.deepEqual(enter(code === '000000' ? '111111' : '000000', 'other-nurse', paymentRef, 'N-204').body, said('cash-code-not-your-visit'));
 assert.equal(docs('cash_codes')[0]!['wrongAttempts'], 0, 'a refusal before the code was compared counted an attempt');
 assert.deepEqual(docs('cash_audit'), []);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('wrong codes to the limit hold the payment and survive every refusal; the right code is refused while held; a release needs a reason; then the right code is accepted', () => {
 const { runtime, raw, docs, payCash, billable, enter, release } = world();
 const paid = payCash();
 const code = String(paid.body['cashCode']);
 const paymentRef = String(paid.body['paymentRef']);
 const wrong = code === '000000' ? '111111' : '000000';
 billable();
 for (let attempt = 1; attempt <= LIMIT; attempt++) {
  const expected = attempt < LIMIT ? 'cash-without-otp' : 'cash-code-held';
  const answer = enter(wrong, `wrong-${attempt}`, paymentRef);
  assert.deepEqual([answer.status, answer.body], [refusal(expected).status, said(expected)], `attempt ${attempt}`);
  assert.equal(docs('cash_codes')[0]!['wrongAttempts'], attempt, `attempt ${attempt} was rolled back with its refusal`);
 }
 assert.equal(docs('cash_codes')[0]!['held'], true);

 /* A wrong code sent again under a key already used is counted again: a refusal is never replayed. */
 const right = enter(code, 'right-after-hold', paymentRef);
 assert.deepEqual(right.body, said('cash-code-held'));
 assert.deepEqual(docs('cash_audit').map(row => row['outcome']), [...Array(LIMIT - 1).fill('wrong'), 'held', 'refused-while-held']);
 assert.equal(docs('payments').find(p => p['paymentRef'] === paymentRef)!['stateCode'], 'pending', 'a held payment was recorded as paid');

 /* The desk. A nurse is not a caller; a release says why, with a reason the contract gives. */
 assert.equal(runtime.call(RELEASE, { role: 'nurse', ref: 'N-205', purpose: 'billing', fields: { idempotencyKey: 'nurse-release', paymentRef, reasonCode: REASON } }).body['error'], 'caller-not-allowed');
 assert.deepEqual(release('no-reason', paymentRef).body, said('release-without-a-reason'));
 assert.deepEqual(release('odd-reason', paymentRef, 'because-synthetic').body, said('release-reason-not-known'));
 assert.equal(docs('cash_codes')[0]!['held'], true, 'a refused release lifted the hold');
 const released = release('released', paymentRef, REASON);
 assert.deepEqual([released.status, released.body], [200, { stateCode: 'pending' }]);
 assert.deepEqual(release('released', paymentRef, REASON).body, released.body, 'the same key replays rather than releasing twice');
 assert.deepEqual(release('again', paymentRef, REASON).body, said('cash-code-not-held'));
 assert.deepEqual(docs('cash_codes')[0]!, { ...docs('cash_codes')[0]!, wrongAttempts: 0, held: false });

 const accepted = enter(code, 'right-after-release', paymentRef);
 assert.deepEqual([accepted.status, accepted.body], [200, { stateCode: 'succeeded' }]);
 const audit = docs('cash_audit');
 assert.deepEqual(audit.map(row => row['outcome']), [...Array(LIMIT - 1).fill('wrong'), 'held', 'refused-while-held', 'released', 'accepted']);
 const releasedRow = audit.find(row => row['outcome'] === 'released')!;
 assert.deepEqual([releasedRow['actorRole'], releasedRow['actorRef'], releasedRow['reasonCode'], typeof releasedRow['at']], ['ops-desk', 'O-801', REASON, 'string']);
 for (const row of audit) {
  assert.ok(!Object.values(row).includes(code) && !Object.values(row).includes(wrong), 'an audit row keeps who and when, never what was entered');
 }
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'payment.succeeded@1').length, 1);
 assert.ok(!runtime.trail.all().some(e => e.body.includes(code)), 'the cash code reached the bus trail');

 /* The accepted entry's replay row: no code in its body, and its request digest is not a digest of the code. */
 const entryRows = raw(`SELECT body, request_digest FROM _runtime_replays WHERE route = '${ENTRY}'`);
 assert.equal(entryRows.length, 1);
 const withCode = createHash('sha256').update(JSON.stringify([['code', code], ['idempotencyKey', 'right-after-release'], ['paymentRef', paymentRef]])).digest('hex');
 assert.notEqual(entryRows[0]!['request_digest'], withCode, 'the replay row keeps a digest of the cash code');
 assert.ok(!String(entryRows[0]!['body']).includes(code));
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
