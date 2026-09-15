/**
 * The runtime's own suite: the binder refuses what the contract does not declare, the request half of
 * every call refuses exactly as the contract says, a handler's answer is held to its declared shape, the
 * bus refuses what the event contract refuses and delivers only where it routes, and the trail is a
 * chain that notices a line changed underneath it. Engines here are synthetic modules written for the
 * test; the real engines have suites of their own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BindingRefused, BusRefused, MEMORY, RuntimeRefusedToStart, createClock, createRuntime, defineEngine, ok, refuse, type EngineContext, type EngineModule } from './index.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-14T09:00:00+02:00';
const empty = { routes: {}, subscriptions: {}, store: { schema: '' } };
const runtimeWith = (engines: EngineModule[], dataDirectory = MEMORY) => createRuntime({ env: FLAG, engines, dataDirectory, clock: createClock(START) });
const refusalOf = (fn: () => unknown) => { try { fn(); } catch (error) { return (error as BindingRefused | BusRefused).refusal; } return null; };

test('the runtime refuses to start without the synthetic-data flag, in the factory', () => {
 assert.throws(() => createRuntime({ env: {}, engines: [], dataDirectory: MEMORY }), RuntimeRefusedToStart);
 assert.throws(() => createRuntime({ env: { MYTHUSO_ENGINES: 'yes' }, engines: [], dataDirectory: MEMORY }), RuntimeRefusedToStart);
});

test('the binder refuses a route the contract does not declare, a withdrawn one and another engine\'s', () => {
 const handler = () => ok({});
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'core', routes: { 'POST /v1/core/nothing@1': handler } })])), 'route-not-in-the-contract');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'core', routes: { 'POST /v1/core/loops@2': handler } })])), 'route-not-in-the-contract');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'clinical', routes: { 'POST /v1/clinical/triage@1': handler } })])), 'route-withdrawn');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'care', routes: { 'POST /v1/core/loops@1': handler } })])), 'route-belongs-to-another-engine');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'hospital' })])), 'engine-not-declared');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'core' }), defineEngine({ ...empty, id: 'core' })])), 'engine-not-declared');
});

test('the binder refuses a subscription to an undeclared, withdrawn, foreign or own event', () => {
 const on = () => {};
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'care', subscriptions: { 'visit.teleported@1': on } })])), 'undeclared-event');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'care', subscriptions: { 'person.trust_updated@1': on } })])), 'no-subscription-to-a-withdrawn-version');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'money', subscriptions: { 'checkin.overdue@1': on } })])), 'subscription-not-declared');
 assert.equal(refusalOf(() => runtimeWith([defineEngine({ ...empty, id: 'core', subscriptions: { 'loop.opened@1': on } })])), 'no-subscribing-to-yourself');
});

const loops = (handler: (fields: Record<string, unknown>, ctx: EngineContext, undeclared: readonly string[]) => ReturnType<typeof ok>) => defineEngine({
 ...empty, id: 'core',
 store: { schema: 'CREATE TABLE IF NOT EXISTS loops (ref TEXT PRIMARY KEY, owner TEXT NOT NULL);' },
 routes: { 'POST /v1/core/loops@1': (request, ctx) => handler(request.fields, ctx, request.undeclared) },
});
const openLoop = { idempotencyKey: 'k-1', sourceEngine: 'care', ownerRole: 'nurse', fallbackRole: 'ops-desk', dueBy: '2026-09-14T10:00:00+02:00' };
const asCare = (fields: Record<string, unknown>) => ({ role: 'engine:care', purpose: 'treatment', fields });

test('the request half refuses exactly as the contract says, with its status and sentence', () => {
 let ran = 0;
 const runtime = runtimeWith([loops(() => { ran++; return ok({ loopRef: 'loop-1' }); })]);
 const answer = (input: { role: string; purpose: string; fields: Record<string, unknown> }) => runtime.call('POST /v1/core/loops@1', input);
 assert.deepEqual(answer({ ...asCare(openLoop), role: 'engine:trust' }).body, { error: 'caller-not-allowed', message: 'This route does not take calls from your role.' });
 assert.equal(answer({ ...asCare(openLoop), purpose: 'billing' }).body.error, 'purpose-not-allowed');
 assert.equal(answer(asCare({ ...openLoop, idempotencyKey: undefined })).body.error, 'idempotency-key-required');
 assert.equal(answer(asCare({ ...openLoop, ownerRole: '' })).status, 400);
 assert.equal(answer(asCare({ ...openLoop, dueBy: 'tomorrow' })).body.error, 'field-of-the-wrong-type');
 assert.equal(ran, 0, 'no refused call reached the handler');
 const done = answer(asCare(openLoop));
 assert.deepEqual([done.status, done.body, done.answeredBy], [200, { loopRef: 'loop-1' }, 'engine']);
 runtime.close();
});

test('a handler sees declared fields only, and the names of the rest', () => {
 let seen: [Record<string, unknown>, readonly string[]] | null = null;
 const runtime = runtimeWith([loops((fields, _ctx, undeclared) => { seen = [fields, undeclared]; return ok({ loopRef: 'loop-1' }); })]);
 runtime.call('POST /v1/core/loops@1', asCare({ ...openLoop, bloodPressure: '180/110' }));
 assert.ok(seen);
 assert.equal('bloodPressure' in seen![0], false);
 assert.deepEqual(seen![1], ['bloodPressure']);
 runtime.close();
});

test('an idempotent route replays the same key as the same act once', () => {
 let ran = 0;
 const runtime = runtimeWith([loops((_f, ctx) => { ran++; ctx.store.prepare('INSERT INTO loops (ref, owner) VALUES (?, ?)').run(`loop-${ran}`, 'nurse'); return ok({ loopRef: `loop-${ran}` }); })]);
 const first = runtime.call('POST /v1/core/loops@1', asCare(openLoop));
 const second = runtime.call('POST /v1/core/loops@1', asCare(openLoop));
 assert.deepEqual(second.body, first.body);
 assert.equal(ran, 1);
 runtime.close();
});

/* Replays belong to one caller and one request. Acknowledging a loop is idempotent and taken from
   people, so it is where two callers can choose the same key. */
const acknowledging = (runs: { count: number }) => defineEngine({
 ...empty, id: 'core',
 routes: { 'POST /v1/core/loops/{loopRef}/acknowledge@2': (_request, ctx) => { runs.count++; return ok({ acknowledgedAt: ctx.clock.iso() }); } },
});
const acknowledge = (runtime: ReturnType<typeof runtimeWith>, ref: string | null, fields: Record<string, unknown>) =>
 runtime.call('POST /v1/core/loops/{loopRef}/acknowledge@2', { role: 'nurse', ref, purpose: 'treatment', fields });

test('two callers who choose the same key get their own answers, never each other\'s', () => {
 const runs = { count: 0 };
 const runtime = runtimeWith([acknowledging(runs)]);
 const first = acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'same', loopRef: 'loop-1' });
 runtime.advance(60_000);
 const second = acknowledge(runtime, 'nurse-synthetic-2', { idempotencyKey: 'same', loopRef: 'loop-1' });
 assert.equal(runs.count, 2, 'the second caller\'s request ran');
 assert.deepEqual([first.status, second.status], [200, 200], 'both were answered, neither as a fault');
 assert.notDeepEqual(second.body, first.body);
 runtime.close();
});

test('the same caller, key and request is replayed without running the handler again', () => {
 const runs = { count: 0 };
 const runtime = runtimeWith([acknowledging(runs)]);
 const first = acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'k', loopRef: 'loop-1' });
 runtime.advance(60_000);
 const again = acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'k', loopRef: 'loop-1' });
 assert.equal(runs.count, 1);
 assert.deepEqual(again.body, first.body);
 runtime.close();
});

test('a reused key with a different request is refused, not replayed', () => {
 const runs = { count: 0 };
 const runtime = runtimeWith([acknowledging(runs)]);
 acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'k', loopRef: 'loop-1' });
 const reused = acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'k', loopRef: 'loop-2' });
 assert.equal(reused.body.error, 'idempotency-key-reused');
 assert.equal(reused.status, 409);
 assert.equal(runs.count, 1);
 runtime.close();
});

test('an idempotent write from a person who is not identified is refused, so no stored answer can reach somebody else', () => {
 const runs = { count: 0 };
 const runtime = runtimeWith([acknowledging(runs)]);
 assert.equal(acknowledge(runtime, null, { idempotencyKey: 'k', loopRef: 'loop-1' }).body.error, 'caller-unidentified');
 assert.equal(runs.count, 0);
 runtime.close();
});

/* The reviewer's reproduction, as a test. Before the replay fix, nurse B pressing panic with the key
   nurse A had chosen was handed A's panicRef, and only one panic.raised went out: one nurse's emergency
   was answered with another's. The Safety module here is synthetic; the route and the event are real. */
const panics = () => defineEngine({
 ...empty, id: 'safety',
 store: { schema: 'CREATE TABLE IF NOT EXISTS panics (ref TEXT PRIMARY KEY, raised_by TEXT NOT NULL);' },
 routes: {
  'POST /v1/safety/panics@1': (request, ctx) => {
   const count = (ctx.store.prepare('SELECT COUNT(*) AS n FROM panics').get() as { n: number }).n;
   const panicRef = `panic-synthetic-${count + 1}`;
   ctx.store.prepare('INSERT INTO panics (ref, raised_by) VALUES (?, ?)').run(panicRef, String(ctx.caller.ref));
   const locationShareEndsAt = new Date(ctx.clock.now().getTime() + Number(request.fields.locationShareMinutes) * 60_000).toISOString().replace('Z', '+00:00');
   ctx.publish('panic.raised@1', { panicRef, raisedByRole: ctx.caller.role, locationShareEndsAt }, { subjectRef: 'subject-synthetic-1', actorRole: ctx.caller.role, purposeOfUse: 'emergency' });
   return ok({ panicRef, locationShareEndsAt });
  },
 },
});
const press = (runtime: ReturnType<typeof runtimeWith>, ref: string, appointmentRef: string) =>
 runtime.call('POST /v1/safety/panics@1', { role: 'nurse', ref, purpose: 'emergency', fields: { idempotencyKey: 'press-1', appointmentRef, locationShareMinutes: 30 } });
const panicsRaised = (runtime: ReturnType<typeof runtimeWith>) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === 'panic.raised@1').length;

test('two nurses who press panic with the same key each raise their own panic', () => {
 const runtime = runtimeWith([panics()]);
 const a = press(runtime, 'nurse-synthetic-a', 'appointment-synthetic-1');
 const b = press(runtime, 'nurse-synthetic-b', 'appointment-synthetic-2');
 assert.deepEqual([a.status, b.status], [200, 200]);
 assert.notEqual(b.body.panicRef, a.body.panicRef, 'nurse B is not handed nurse A\'s panic');
 assert.equal(panicsRaised(runtime), 2, 'both emergencies were published');
 runtime.close();
});

test('the same nurse pressing again with the same key and a different visit is refused, and nothing more is raised', () => {
 const runtime = runtimeWith([panics()]);
 press(runtime, 'nurse-synthetic-a', 'appointment-synthetic-1');
 const again = press(runtime, 'nurse-synthetic-a', 'appointment-synthetic-2');
 assert.equal(again.status, 409);
 assert.deepEqual(again.body, { error: 'idempotency-key-reused', message: 'That idempotency key was already used for a different request.' });
 assert.equal(panicsRaised(runtime), 1);
 runtime.close();
});

test('a declared refusal renders the contract\'s sentence; an undeclared one, a bad shape or a throw is a fault that keeps nothing', () => {
 let mode = 'refuse';
 let rows = 0;
 const runtime = runtimeWith([loops((_f, ctx) => {
  ctx.store.prepare('INSERT INTO loops (ref, owner) VALUES (?, ?)').run(`loop-${mode}`, 'nurse');
  rows = (ctx.store.prepare('SELECT COUNT(*) AS n FROM loops').get() as { n: number }).n;
  if (mode === 'refuse') return refuse('no-fallback');
  if (mode === 'undeclared') return refuse('because-i-said-so');
  if (mode === 'shape') return ok({ loopRef: 7 });
  if (mode === 'extra') return ok({ loopRef: 'x', ownerName: 'Thandi' });
  throw new Error('boom');
 })]);
 const call = () => runtime.call('POST /v1/core/loops@1', asCare({ ...openLoop, idempotencyKey: `k-${mode}` }));
 assert.deepEqual(call(), { status: 422, body: { error: 'no-fallback', message: 'Every concern has a fallback for when its owner does not answer.' }, answeredBy: 'engine' });
 for (mode of ['undeclared', 'shape', 'extra', 'throw']) {
  const answer = call();
  assert.equal(answer.status, 500, mode);
  assert.equal(answer.body.error, 'engine-fault');
 }
 assert.equal(rows, 1, 'each attempt saw only its own row: every earlier one was rolled back');
 runtime.close();
});

/* An engine refusal is answered only by the routes its answeredBy names. no-such-loop names the routes that
   look a concern up by its reference, and not the one that opens a concern, which issues the reference. A
   refusal the engine declares is not thereby a refusal every frozen route of the engine may start giving. */
test('an engine refusal is answered by the routes it names, and is a fault from any other', () => {
 const runtime = runtimeWith([defineEngine({ ...empty, id: 'core', routes: {
  'POST /v1/core/loops@1': () => refuse('no-such-loop'),
  'POST /v1/core/loops/{loopRef}/acknowledge@2': () => refuse('no-such-loop'),
 } })]);
 const named = acknowledge(runtime, 'nurse-synthetic-1', { idempotencyKey: 'k', loopRef: 'loop-nobody-issued' });
 assert.deepEqual([named.status, named.body], [404, { error: 'no-such-loop', message: 'There is no concern under that reference.' }]);
 const unnamed = runtime.call('POST /v1/core/loops@1', asCare(openLoop));
 assert.deepEqual([unnamed.status, unnamed.body.error], [500, 'engine-fault']);
 assert.match((runtime.faults().at(-1)!.error as Error).message, /answeredBy/);
 runtime.close();
});

test('a route with no handler is answered by the contract mock', () => {
 const runtime = runtimeWith([]);
 const answer = runtime.handle({ method: 'GET', path: '/v1/core/protocols/injection-administration%401', headers: { 'x-mythuso-role': 'nurse', 'x-mythuso-purpose': 'treatment' }, query: {}, body: {} });
 assert.equal(answer.answeredBy, 'mock');
 assert.equal(answer.status, 200);
 assert.equal(runtime.handle({ method: 'GET', path: '/v1/nowhere', headers: {}, query: {}, body: {} }).body.error, 'no-route');
 runtime.close();
});

/* A publisher driven by the clock, so a test can publish as any engine without a route of its own. */
const publisher = (id: string, act: (ctx: EngineContext) => void) => defineEngine({ ...empty, id, tick: act });
const grant = { grantRef: 'grant-1', recipientRole: 'caregiver', recipientRef: 'person-synthetic-2', purpose: 'treatment', expiresAt: '2026-12-13T09:00:00+02:00' };

test('the bus refuses an undeclared, withdrawn, foreign-owned, never-listed or mis-shaped event, and says so in the trail by field name', () => {
 const results: (string | null)[] = [];
 const as = (fn: (ctx: EngineContext) => void) => fn;
 const cases: [string, (ctx: EngineContext) => void][] = [
  ['undeclared-event', as(ctx => ctx.publish('record.teleported@1', {}, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['withdrawn-version', as(ctx => ctx.publish('passport.consent.granted@1', {}, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['not-the-owner', as(ctx => ctx.publish('loop.opened@1', { loopRef: 'l', sourceEngine: 'record', ownerRole: 'nurse', dueBy: START }, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['refused-field', as(ctx => ctx.publish('passport.consent.granted@3', { ...grant, recipientPhone: '0820000000' }, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['refused-field', as(ctx => ctx.publish('passport.consent.granted@3', grant, { subjectRef: '8001015009087', purposeOfUse: 'treatment' }))],
  ['not-the-frozen-shape', as(ctx => ctx.publish('passport.consent.granted@3', { ...grant, colour: 'blue' }, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['not-the-frozen-shape', as(ctx => ctx.publish('passport.consent.granted@3', { ...grant, expiresAt: 'soon' }, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))],
  ['not-the-frozen-shape', as(ctx => ctx.publish('passport.consent.granted@3', grant, { subjectRef: 'subject-1', purposeOfUse: 'curiosity' }))],
 ];
 const runtime = runtimeWith([publisher('record', ctx => { for (const [, act] of cases) results.push(refusalOf(() => act(ctx))); })]);
 runtime.advance(1);
 assert.deepEqual(results, cases.map(([id]) => id));
 const refused = runtime.trail.all().filter(e => e.kind === 'refused');
 assert.equal(refused.length, cases.length);
 assert.ok(refused.every(e => !e.body.includes('0820000000') && !e.body.includes('8001015009087')), 'a refused value is never written down');
 runtime.close();
});

test('an event is delivered to declared subscribers only, a grant only to the engine serving its role, after the publisher commits', () => {
 const heard: string[] = [];
 const listen = (id: string) => defineEngine({ ...empty, id, subscriptions: { 'passport.consent.granted@3': () => { heard.push(id); } } });
 const runtime = runtimeWith([
  publisher('record', ctx => ctx.publish('passport.consent.granted@3', grant, { subjectRef: 'subject-1', purposeOfUse: 'treatment' })),
  listen('access'), listen('care'), listen('medicines'),
 ]);
 runtime.advance(60_000);
 assert.deepEqual(heard, ['access'], 'a caregiver grant reaches access, which serves the caregiver role, and nobody else');
 const kinds = runtime.trail.all().map(e => e.kind);
 assert.deepEqual(kinds, ['published', 'withheld', 'delivered']);
 runtime.close();
});

test('a subscriber that fails is rolled back and written to the trail, and the bus carries on', () => {
 const heard: string[] = [];
 const runtime = runtimeWith([
  publisher('record', ctx => ctx.publish('passport.consent.granted@3', { ...grant, recipientRole: 'nurse-assigned' }, { subjectRef: 'subject-1', purposeOfUse: 'treatment' })),
  defineEngine({ ...empty, id: 'care', subscriptions: { 'passport.consent.granted@3': () => { throw new Error('care fell over'); } } }),
 ]);
 runtime.advance(1);
 runtime.advance(1);
 assert.deepEqual(runtime.trail.all().filter(e => e.kind === 'delivery-failed').length, 2);
 assert.deepEqual(heard, []);
 runtime.close();
});

test('the trail is a hash chain that notices a line changed underneath it', () => {
 const directory = mkdtempSync(join(tmpdir(), 'mythuso-engines-'));
 const runtime = runtimeWith([publisher('record', ctx => ctx.publish('passport.consent.granted@3', grant, { subjectRef: 'subject-1', purposeOfUse: 'treatment' }))], directory);
 runtime.advance(1);
 runtime.advance(1);
 assert.equal(runtime.trail.verify(), true);
 const raw = new DatabaseSync(join(directory, 'bus-trail.sqlite'));
 raw.prepare("UPDATE trail SET engine = 'money' WHERE seq = 1").run();
 raw.close();
 assert.equal(runtime.trail.verify(), false);
 runtime.close();
});

/* The store an engine is handed is its own tables and nothing more. This is the reviewer's escape as
   reproduced: a Care tick ended the binder's transaction, attached Safety's file and an arbitrary one,
   read Safety's rows and began a new transaction so that nothing looked wrong. It must be refused, and
   the attempt must be a fault rather than a quiet success. */
test('an engine cannot end the binder\'s transaction, attach another engine\'s store or create a database through its own', async () => {
 const { existsSync } = await import('node:fs');
 const directory = mkdtempSync(join(tmpdir(), 'mythuso-engines-escape-'));
 let seen: unknown = null;
 const safety = defineEngine({ ...empty, id: 'safety', store: { schema: 'CREATE TABLE IF NOT EXISTS panics (ref TEXT PRIMARY KEY);' }, tick: ctx => { ctx.store.prepare('INSERT OR IGNORE INTO panics (ref) VALUES (?)').run('panic-synthetic-1'); } });
 const care = defineEngine({ ...empty, id: 'care', tick: ctx => {
  ctx.store.exec(`COMMIT; ATTACH '${join(directory, 'safety.sqlite')}' AS other; ATTACH '${join(directory, 'arbitrary.sqlite')}' AS arb; CREATE TABLE arb.loot (ref TEXT); BEGIN;`);
  seen = ctx.store.prepare('SELECT ref FROM other.panics').all();
 } });
 const runtime = runtimeWith([safety, care], directory);
 runtime.advance(1);
 assert.equal(seen, null, 'care never read safety\'s rows');
 assert.equal(existsSync(join(directory, 'arbitrary.sqlite')), false, 'no database was created');
 const careFaults = runtime.faults().filter(f => f.engine === 'care');
 assert.equal(careFaults.length, 1, 'the attempt is a fault, not a quiet success');
 assert.equal((careFaults[0]!.error as Error).name, 'StoreRefused');
 runtime.close();
});

test('the store refuses every statement that reaches past the engine\'s own tables, however it is spelt', () => {
 const outcomes: Record<string, string> = {};
 const attempts: Record<string, string> = {
  'attach': "ATTACH DATABASE ':memory:' AS other",
  'attach behind a comment, in lower case': "/* just a read */ attach database ':memory:' as other",
  'detach': 'DETACH DATABASE other',
  'begin': 'BEGIN',
  'commit': 'COMMIT',
  'rollback': 'ROLLBACK',
  'savepoint': 'SAVEPOINT s',
  'release': 'RELEASE s',
  'vacuum into': "VACUUM INTO '/tmp/mythuso-engines-copy.sqlite'",
  'a pragma that writes': 'PRAGMA writable_schema = 1',
  'the replay table': 'SELECT * FROM _runtime_replays',
  'the replay table, quoted': 'SELECT * FROM "_runtime_replays"',
  'the replay table, bracketed and in capitals': 'DELETE FROM [_RUNTIME_REPLAYS]',
  'the replay table, as a string where a table name belongs': "SELECT * FROM '_runtime_replays'",
  'a second statement after the first': 'SELECT 1; DELETE FROM notes',
 };
 const runtime = runtimeWith([defineEngine({ ...empty, id: 'care', store: { schema: 'CREATE TABLE IF NOT EXISTS notes (ref TEXT);' }, tick: ctx => {
  for (const [name, sql] of Object.entries(attempts)) {
   try { ctx.store.prepare(sql).all(); outcomes[name] = 'ran'; } catch (error) { outcomes[name] = (error as Error).name; }
  }
  ctx.store.prepare('INSERT INTO notes (ref) VALUES (?)').run('note-synthetic-1');
  outcomes.own = String((ctx.store.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n);
  outcomes['a pragma that reads'] = String((ctx.store.prepare('PRAGMA table_info(notes)').all() as unknown[]).length);
 } })]);
 runtime.advance(1);
 for (const name of Object.keys(attempts)) assert.equal(outcomes[name], 'StoreRefused', name);
 assert.equal(outcomes.own, '1', 'the engine still writes and reads its own tables');
 assert.equal(outcomes['a pragma that reads'], '1', 'a read-only pragma on its own table still works');
 runtime.close();
});

/* The reviewer's last store finding: the boundary check's _runtime_ ban reads source text, so a table
   name assembled while the engine runs never appears in any file for it to find. The facade reads the
   statement SQLite is actually handed, so the assembled name is refused as surely as a written one. */
test('a runtime table name assembled at run time is refused as surely as one written out', () => {
 let outcome = 'not attempted';
 const runtime = runtimeWith([defineEngine({ ...empty, id: 'care', tick: ctx => {
  const table = ['_run', 'time_replays'].join('');
  try { ctx.store.prepare('DELETE FROM ' + table).run(); outcome = 'ran'; } catch (error) { outcome = (error as Error).name; }
 } })]);
 runtime.advance(1);
 assert.equal(outcome, 'StoreRefused');
 runtime.close();
});
