/**
 * What the runtime keeps, and what it must not, tested on synthetic routes.
 *
 * A secret in a response — a one-time code — is shown to the caller once and never written to the replay
 * table; a replay of the same key answers with the contract's sentence in its place, never the code. The
 * Money lead found the first replay table kept whole bodies, so a cash code sat at rest in plain text
 * while Money itself kept only a salted digest.
 *
 * And a refusal rolls back everything a handler did, except the writes its contract says that refusal
 * keeps: an attempt counter and an audit row. Without that, a wrong code's attempt would vanish with the
 * refusal that counted it, and an attempt limit would never bite.
 *
 * The routes exist only here: they are added to a copy of the loaded contract passed to createRuntime.
 * Nothing in this file is written into packages/catalog/apis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadRuntimeContract, type ContractRoute, type RuntimeContract } from './contract.ts';
import { createClock, createRuntime, defineEngine, ok, refuse, type EngineModule, type RouteKey } from './index.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-14T09:00:00+02:00';
const WHY = 'Synthetic, for the runtime tests.';
const SHOWN_ONCE = 'The pickup code was shown once, when it was issued, and is not shown again.';
const LIMIT = 3;

type SyntheticRoute = Omit<ContractRoute, 'key' | 'engine' | 'file' | 'mountedPath' | 'summary' | 'status'>;

function withSyntheticRoutes(routes: SyntheticRoute[]): RuntimeContract {
 const base = loadRuntimeContract();
 const added: ContractRoute[] = routes.map(route => ({
  ...route, engine: 'core', file: 'packages/engines/src/runtime/replay-and-refusal.test.ts', mountedPath: route.path,
  summary: WHY, status: 'proposed', key: `${route.method} ${route.path}@${route.version}` as RouteKey,
 }));
 return { ...base, routes: [...base.routes, ...added], byKey: new Map([...base.byKey, ...added.map(route => [route.key, route] as const)]) };
}

const text = (field: string, required = true) => ({ field, type: 'string', required, why: WHY });
const directory = (name: string) => mkdtempSync(join(tmpdir(), `mythuso-engines-${name}-`));
const rowsOf = (dir: string, sql: string) => {
 const raw = new DatabaseSync(join(dir, 'core.sqlite'));
 try { return raw.prepare(sql).all() as Record<string, unknown>[]; } finally { raw.close(); }
};

/* ── Secrets in responses ──────────────────────────────────────────────────────────────────────────── */

const pickupContract = withSyntheticRoutes([{
 method: 'POST', path: '/v1/core/test-pickups', version: 1, callers: ['nurse'], purpose: ['treatment'],
 request: [text('idempotencyKey'), text('parcelRef')],
 response: [text('receiptRef'), text('pickupPin')],
 refusals: [{ id: 'no-parcel', status: 404, statement: 'There is no such parcel.', why: WHY }],
 idempotent: true,
 secretResponseFields: [{ field: 'pickupPin', shownOnce: SHOWN_ONCE }],
}]);

const pickups = (issued: { count: number }): EngineModule => defineEngine({
 id: 'core', subscriptions: {}, store: { schema: '' },
 routes: { 'POST /v1/core/test-pickups@1': () => { issued.count++; return ok({ receiptRef: `receipt-synthetic-${issued.count}`, pickupPin: '482913' }); } },
});

test('a secret in a response is shown once, is not in the replay table at rest, and a replay answers with the sentence instead', () => {
 const dir = directory('secret');
 const issued = { count: 0 };
 const runtime = createRuntime({ env: FLAG, engines: [pickups(issued)], dataDirectory: dir, clock: createClock(START), contract: pickupContract });
 const input = { role: 'nurse', ref: 'nurse-synthetic-1', purpose: 'treatment', fields: { idempotencyKey: 'pickup-1', parcelRef: 'parcel-synthetic-1' } };
 const first = runtime.call('POST /v1/core/test-pickups@1', input);
 assert.equal(first.status, 200);
 assert.equal(first.body.pickupPin, '482913', 'the caller sees the code the one time it is issued');
 const stored = rowsOf(dir, 'SELECT body FROM _runtime_replays');
 assert.equal(stored.length, 1, 'the answer was stored for replay');
 assert.ok(stored.every(row => !String(row.body).includes('482913')), 'the code is not at rest in the replay table');
 const again = runtime.call('POST /v1/core/test-pickups@1', input);
 assert.equal(issued.count, 1, 'the replay did not run the handler again');
 assert.equal(again.body.pickupPin, SHOWN_ONCE, 'a replay answers with the sentence, never the code');
 assert.equal(again.body.receiptRef, first.body.receiptRef, 'everything that is not a secret is replayed as it was');
 runtime.close();
});

/* ── Writes a refusal keeps ────────────────────────────────────────────────────────────────────────── */

const codeRoute = (keptOnRefusal: SyntheticRoute['keptOnRefusal']): SyntheticRoute => ({
 method: 'POST', path: '/v1/core/test-codes', version: 1, callers: ['nurse'], purpose: ['treatment'],
 request: [text('parcelRef'), text('code'), text('mode', false)],
 response: [text('stateCode')],
 refusals: [
  { id: 'code-wrong', status: 422, statement: 'That is not the code that was issued.', why: WHY },
  { id: 'code-held', status: 409, statement: 'Too many wrong codes. The parcel is held for the desk.', why: WHY },
  { id: 'no-parcel', status: 404, statement: 'There is no such parcel.', why: WHY },
 ],
 idempotent: false,
 keptOnRefusal,
});
const kept = { refusals: ['code-wrong', 'code-held'], tables: ['attempts', 'audit'], why: 'An attempt limit bites only if the attempts it counts survive the refusal that counted them.' };
const codeContract = withSyntheticRoutes([codeRoute(kept)]);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS attempts (parcel TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (parcel TEXT NOT NULL, outcome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS releases (parcel TEXT NOT NULL);`;

/* The handler under test. mode steers it into each misuse the runtime must refuse. */
const codes = (): EngineModule => defineEngine({
 id: 'core', subscriptions: {}, store: { schema: SCHEMA },
 routes: {
  'POST /v1/core/test-codes@1': (request, ctx) => {
   const parcel = String(request.fields.parcelRef);
   const mode = request.fields.mode;
   const count = (ctx.store.prepare('SELECT count FROM attempts WHERE parcel = ?').get(parcel) as { count: number } | undefined)?.count ?? 0;
   if (mode === 'undeclared-table') { ctx.recordRefusal('INSERT INTO releases (parcel) VALUES (?)', parcel); return refuse('code-wrong'); }
   if (mode === 'delete') { ctx.recordRefusal('DELETE FROM attempts WHERE parcel = ?', parcel); return refuse('code-wrong'); }
   if (mode === 'unkept-refusal') { ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', parcel, 'looked-up'); return refuse('no-parcel'); }
   if (mode === 'throws') { ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', parcel, 'thrown'); throw new Error('synthetic fault'); }
   if (count >= LIMIT) { ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', parcel, 'held'); return refuse('code-held'); }
   ctx.store.prepare('INSERT INTO releases (parcel) VALUES (?)').run(parcel);
   if (request.fields.code !== '482913') {
    ctx.recordRefusal('INSERT INTO attempts (parcel, count) VALUES (?, 1) ON CONFLICT (parcel) DO UPDATE SET count = count + 1', parcel);
    ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', parcel, 'wrong');
    return refuse('code-wrong');
   }
   ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', parcel, 'released');
   return ok({ stateCode: 'released' });
  },
 },
});
const enter = (runtime: ReturnType<typeof createRuntime>, fields: Record<string, unknown>) =>
 runtime.call('POST /v1/core/test-codes@1', { role: 'nurse', ref: 'nurse-synthetic-1', purpose: 'treatment', fields: { parcelRef: 'parcel-synthetic-1', ...fields } });

test('wrong codes up to the attempt limit keep their counter and audit rows through the refusal, and then the parcel is held', () => {
 const dir = directory('attempts');
 const runtime = createRuntime({ env: FLAG, engines: [codes()], dataDirectory: dir, clock: createClock(START), contract: codeContract });
 for (let i = 0; i < LIMIT; i++) assert.equal(enter(runtime, { code: '000000' }).body.error, 'code-wrong');
 const held = enter(runtime, { code: '482913' });
 assert.equal(held.status, 409, 'after the limit even the right code is refused');
 assert.equal(held.body.error, 'code-held');
 const counted = rowsOf(dir, 'SELECT count FROM attempts');
 assert.equal(counted.length, 1, 'one counter for the one parcel');
 assert.equal(counted[0]!.count, LIMIT, 'every wrong attempt was counted');
 assert.equal(rowsOf(dir, "SELECT * FROM audit WHERE outcome = 'wrong'").length, LIMIT);
 assert.equal(rowsOf(dir, "SELECT * FROM audit WHERE outcome = 'held'").length, 1);
 assert.equal(rowsOf(dir, 'SELECT * FROM releases').length, 0, 'a write the refusal does not keep was rolled back');
 runtime.close();
});

test('an answer that is not a refusal writes what the handler recorded, with everything else it did', () => {
 const dir = directory('released');
 const runtime = createRuntime({ env: FLAG, engines: [codes()], dataDirectory: dir, clock: createClock(START), contract: codeContract });
 assert.equal(enter(runtime, { code: '482913' }).body.stateCode, 'released');
 assert.equal(rowsOf(dir, "SELECT * FROM audit WHERE outcome = 'released'").length, 1);
 assert.equal(rowsOf(dir, 'SELECT * FROM releases').length, 1);
 runtime.close();
});

test('a recorded write is refused, and kept nowhere, when it is not narrow: an undeclared table, a delete, a refusal the contract does not keep, or a fault', () => {
 for (const mode of ['undeclared-table', 'delete', 'unkept-refusal', 'throws']) {
  const dir = directory(`misuse-${mode}`);
  const runtime = createRuntime({ env: FLAG, engines: [codes()], dataDirectory: dir, clock: createClock(START), contract: codeContract });
  const answer = enter(runtime, { code: '000000', mode });
  assert.equal(answer.status, 500, mode);
  assert.equal(answer.body.error, 'engine-fault', mode);
  assert.equal(rowsOf(dir, 'SELECT * FROM audit').length + rowsOf(dir, 'SELECT * FROM attempts').length + rowsOf(dir, 'SELECT * FROM releases').length, 0, `${mode} kept nothing`);
  if (mode !== 'throws') assert.equal((runtime.faults().at(-1)?.error as Error)?.name, mode === 'unkept-refusal' ? 'Error' : 'StoreRefused', mode);
  runtime.close();
 }
});

test('only a route handler records what a refusal keeps: a tick cannot', () => {
 const dir = directory('tick');
 const ticking = defineEngine({ id: 'core', subscriptions: {}, routes: {}, store: { schema: SCHEMA }, tick: ctx => { ctx.recordRefusal('INSERT INTO audit (parcel, outcome) VALUES (?, ?)', 'parcel-synthetic-1', 'ticked'); } });
 const runtime = createRuntime({ env: FLAG, engines: [ticking], dataDirectory: dir, clock: createClock(START), contract: codeContract });
 runtime.advance(1);
 assert.equal((runtime.faults().at(-1)?.error as Error)?.name, 'StoreRefused');
 assert.equal(rowsOf(dir, 'SELECT * FROM audit').length, 0);
 runtime.close();
});
