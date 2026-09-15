/**
 * Money's cash code on the runtime, read from the store as it is at rest.
 *
 * The runtime's own tests prove a secret is kept out of the replay table and a refusal keeps only the
 * writes its route names, on synthetic routes. These prove the same two things on Money's real ones,
 * because the defect the Money lead found was a real cash code sitting in a real replay row: the store
 * file is opened directly, beside the runtime, and read as anybody with the sqlite shell would read it.
 *
 * The nurse's cash-code entry, POST /v1/money/payments/{paymentRef}/cash-code@1, is declared and still
 * proposed, so Money's engine does not bind it. Here it is bound by a copy of the engine written for the
 * test, with the request shape the contract already declares and the ledger's own enterCashCode behind
 * it. The only thing the copy adds is where the ledger's writes to the code row and the audit go: through
 * ctx.recordRefusal, as the route's keptOnRefusal allows, so that a wrong code survives the refusal it
 * causes. Nothing in this file is written into packages/catalog/apis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import moneyApi from '../../../catalog/apis/money.json' with { type: 'json' };
import { createClock, createRuntime, defineEngine, ok, refuse, type EngineContext, type EventKey, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { isRefusal, money, refusal, serviceById } from './domain/contract.ts';
import { createMoney, TABLE_NAMES, type MoneyTables, type Table } from './domain/ledger.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-14T09:00:00+02:00';
const ENTRY: RouteKey = 'POST /v1/money/payments/{paymentRef}/cash-code@1';
const LIMIT = money.cash.attemptLimit;
const SHOWN_ONCE = moneyApi.routes.find(r => r.method === 'POST' && r.path === '/v1/money/payments' && r.version === 2)!.secretResponseFields!.find(s => s.field === 'cashCode')!.shownOnce;

/* The tables the handler records its writes into for a refusal to keep. The handler chooses to record
   them; whether they survive the refusal is the runtime's decision, made from the route's keptOnRefusal,
   so taking keptOnRefusal out of the contract makes the attempt test fail rather than this file. */
const RECORDED = ['cash_codes', 'cash_audit'];
const SQL_NAMES: Record<typeof TABLE_NAMES[number], string> = {
 payables: 'payables', payments: 'payments', cashCodes: 'cash_codes', cashAudit: 'cash_audit', attempts: 'payment_attempts', keys: 'payment_keys',
 billable: 'billable_visits', earned: 'earned_lines', cases: 'signed_cases', payouts: 'payouts', suspensions: 'partner_suspensions'
};

/* Reads go to the store; a put into a table the refusal keeps is recorded rather than run. */
function recordingTables(ctx: EngineContext): MoneyTables {
 const table = <T,>(name: string): Table<T> => ({
  get: key => { const row = ctx.store.prepare(`SELECT doc FROM ${name} WHERE ref = ?`).get(key) as { doc: string } | undefined; return row ? JSON.parse(row.doc) as T : undefined; },
  put: (key, value) => {
   const sql = `INSERT INTO ${name} (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc`;
   if (RECORDED.includes(name)) ctx.recordRefusal(sql, key, JSON.stringify(value));
   else ctx.store.prepare(sql).run(key, JSON.stringify(value));
  },
  all: () => (ctx.store.prepare(`SELECT doc FROM ${name} ORDER BY rowid`).all() as { doc: string }[]).map(row => JSON.parse(row.doc) as T)
 });
 return Object.fromEntries(TABLE_NAMES.map(name => [name, table(SQL_NAMES[name])])) as unknown as MoneyTables;
}

const withEntry = defineEngine({
 ...engine,
 routes: {
  ...engine.routes,
  [ENTRY]: (request, ctx) => {
   const ledger = createMoney({
    tables: recordingTables(ctx), clock: () => ctx.clock.now(), simulation: true,
    publish: (key, payload, subjectRef) => { ctx.publish(key as EventKey, payload, { subjectRef, purposeOfUse: 'billing' }); }
   });
   const answer = ledger.enterCashCode({ role: ctx.caller.role, subjectRef: ctx.caller.ref ?? '' }, { paymentRef: String(request.fields['paymentRef']), code: String(request.fields['code']) });
   return isRefusal(answer) ? refuse(answer.id) : ok({ stateCode: answer.stateCode });
  }
 }
});

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
 const runtime = createRuntime({ env: FLAG, engines: [publisher.module, withEntry], dataDirectory: dir, clock: createClock(START) });
 publisher.queue.push({ key: 'appointment.booked@1', payload: { appointmentRef: 'APT-1', clinicianRef: 'N-205', scheduledFor: '2026-09-15T09:00:00+02:00' } });
 runtime.advance(1000);
 publisher.queue.push({ key: 'visit.billable@1', payload: { appointmentRef: 'APT-1', serviceId: 'vitals', clinicianRef: 'N-205' } });
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
 const enter = (code: string, key: string, paymentRef: string) => runtime.call(ENTRY, { role: 'nurse', ref: 'N-205', purpose: 'billing', fields: { idempotencyKey: key, paymentRef, code } });
 return { runtime, raw, docs, payCash, enter };
}

test('the cash-code entry route keeps, on a wrong code, exactly the code row and the audit, and nothing else', () => {
 const entry = moneyApi.routes.find(r => r.path === '/v1/money/payments/{paymentRef}/cash-code' && r.version === 1);
 assert.deepEqual([...(entry?.keptOnRefusal?.tables ?? [])].sort(), [...RECORDED].sort());
 assert.deepEqual([...(entry?.keptOnRefusal?.refusals ?? [])].sort(), ['cash-code-held', 'cash-without-otp']);
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
 /* Money's own row is a salt and a digest, never the code. */
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

test('wrong cash codes up to money.json’s attemptLimit hold the payment, and the counter and audit rows survive every refusal', () => {
 const { runtime, docs, payCash, enter } = world();
 const paid = payCash();
 const code = String(paid.body['cashCode']);
 const paymentRef = String(paid.body['paymentRef']);
 const wrong = code === '000000' ? '111111' : '000000';
 for (let attempt = 1; attempt <= LIMIT; attempt++) {
  const expected = attempt < LIMIT ? 'cash-without-otp' : 'cash-code-held';
  const answer = enter(wrong, `wrong-${attempt}`, paymentRef);
  assert.deepEqual([answer.status, answer.body], [refusal(expected).status, { error: expected, message: refusal(expected).statement }], `attempt ${attempt}`);
  assert.equal(docs('cash_codes')[0]!['wrongAttempts'], attempt, `attempt ${attempt} was rolled back with its refusal`);
 }
 assert.equal(docs('cash_codes')[0]!['held'], true);

 /* After the limit the right code is refused too, and that refusal is written down as well. */
 const right = enter(code, 'right-after-hold', paymentRef);
 assert.equal(right.body['error'], 'cash-code-held');
 const outcomes = docs('cash_audit').map(row => row['outcome']);
 assert.deepEqual(outcomes, [...Array(LIMIT - 1).fill('wrong'), 'held', 'refused-while-held']);
 assert.ok(docs('cash_audit').every(row => row['actorRole'] === 'nurse' && row['actorRef'] === 'N-205' && !Object.values(row).includes(code) && !Object.values(row).includes(wrong)), 'an audit row keeps who and when, never what was entered');
 assert.equal(docs('payments').find(p => p['paymentRef'] === paymentRef)!['stateCode'], 'pending', 'a held payment was recorded as paid');
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'payment.succeeded@1').length, 0);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the right code before the limit records the cash as paid, with the wrong attempts before it still counted', () => {
 const { runtime, docs, payCash, enter } = world();
 const paid = payCash();
 const code = String(paid.body['cashCode']);
 const paymentRef = String(paid.body['paymentRef']);
 enter(code === '000000' ? '111111' : '000000', 'wrong-1', paymentRef);
 const right = enter(code, 'right', paymentRef);
 assert.deepEqual([right.status, right.body], [200, { stateCode: 'succeeded' }]);
 assert.deepEqual(docs('cash_audit').map(row => row['outcome']), ['wrong', 'accepted']);
 assert.equal(docs('cash_codes')[0]!['wrongAttempts'], 1);
 assert.equal(runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'payment.succeeded@1').length, 1);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
