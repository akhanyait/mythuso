/**
 * The engine runtime: binds engine modules to the frozen API contract, runs their handlers against
 * their own stores, carries their events on the bus and moves the simulated clock.
 *
 * ── The binder ───────────────────────────────────────────────────────────────────────────────────────
 *
 * A handler is registered under "<METHOD> <path>@<version>" and the binder refuses, before any store is
 * opened, a key the contract does not declare, a route that is withdrawn and a route another engine
 * owns — so a module cannot answer for somebody else's resource by naming it. At request time it does
 * the contract's half of every call exactly as the mock does, and for the same reason: the caller is one
 * the route names, the purpose is one the route serves, a money or dispatch write carries its
 * idempotency key, every required field is sent. It adds what a mock could not: every sent field is of
 * its declared type, a handler sees only declared fields (the names of the others and never their
 * values), and a handler's answer is the declared response shape — inside every object whose fields the
 * contract declares, too — or a refusal the route declares, the shared list declares, or its engine declares
 * and names the route in answeredBy. A refusal is rendered with the contract's status and sentence and nothing
 * else. Anything a handler did before refusing or failing is rolled back, and its events are dropped.
 *
 * A route no module has bound is answered by packages/mock-api, imported rather than copied, so the
 * dev server answers all of the contract while the engines are built one route at a time.
 *
 * ── What it never does ───────────────────────────────────────────────────────────────────────────────
 *
 * It refuses to exist without MYTHUSO_ENGINES=synthetic-data-only — here, in the factory, so that
 * importing the library does not skip the door the server goes through. A caller's role arrives in a
 * development header and is believed; that is what "development only" means, and why nothing in deploy/
 * may name this package. The mock the runtime falls back to is told it may answer because this factory
 * has already refused to start without the runtime's own synthetic-data flag.
 */
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { createMock, match, needsIdempotencyKey } from '../../../mock-api/src/mock.ts';
import { BindingRefused, BusRefused, recipientsOf, refusalFrom, validatePublish, validateSubscription, valueOfType } from './bus.ts';
import { createClock } from './clock.ts';
import { keysAllowedBy, loadRuntimeContract, repositoryRoot, routeKeyOf, type ContractRoute, type Field, type Refusal, type RuntimeContract } from './contract.ts';
import { openDatabase, openEngineStore, requestDigest } from './store.ts';
import { StoreRefused, recordTargetFor, storeFacade } from './facade.ts';
import { createTrail } from './trail.ts';
import type { BusEvent, Caller, Clock, EngineContext, EngineModule, RouteHandler, RouteKey, RuntimeAnswer, SubscriptionHandler, TrailEntry, TrailReader } from './types.ts';

export { BindingRefused, BusRefused };
export class RuntimeRefusedToStart extends Error {}

export type RuntimeRequest = { method: string; path: string; headers: Record<string, string | undefined>; query: Record<string, string>; body: Record<string, unknown> };
export type RuntimeOptions = {
 env: Record<string, string | undefined>;
 engines: readonly EngineModule[];
 /** A directory for one SQLite file per engine and the bus trail, or ":memory:". */
 dataDirectory?: string;
 clock?: Clock;
 /**
  * The runtime's own tests only: a copy of the loaded contract with synthetic routes added, so a feature
  * of the runtime can be tested on a route that is not, and never becomes, part of packages/catalog/apis.
  * Every binder rule still applies to it. The boundary check refuses this option in anything but a test.
  */
 contract?: RuntimeContract;
};
export type Fault = { engine: string; where: string; error: unknown };
export type Runtime = {
 handle(request: RuntimeRequest): RuntimeAnswer;
 call(route: RouteKey, input: { role: string; ref?: string | null; purpose: string; fields: Record<string, unknown> }): RuntimeAnswer;
 advance(ms: number): void;
 readonly clock: Clock;
 readonly trail: TrailReader & { all(): TrailEntry[] };
 bound(): RouteKey[];
 faults(): readonly Fault[];
 close(): void;
};

export function createRuntime(options: RuntimeOptions): Runtime {
 const contract = options.contract ?? loadRuntimeContract();
 const settings = contract.settings;
 if (options.env[settings.flag] !== settings.flagValue) throw new RuntimeRefusedToStart(`The engines answer with synthetic data only, and nothing runs until ${settings.flag}=${settings.flagValue} says so.`);
 const clock = options.clock ?? createClock();
 const directory = options.dataDirectory ?? options.env[settings.dataVariable] ?? fileURLToPath(new URL(settings.defaultDataDirectory, repositoryRoot));
 const mock = createMock({ env: { [contract.mock.mock.flag]: contract.mock.mock.flagValue }, contract: contract.mock, now: () => clock.now() });
 const runtimeRefusal = (id: string) => refusalFrom(contract, id) as Refusal;
 const shared = (id: string): Refusal => {
  const found = contract.shared.find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis.json has lost the shared refusal ${id}.`);
  return found;
 };

 /* Bind everything before opening anything, so a refused module leaves no file behind. */
 const handlers = new Map<string, { engine: string; route: ContractRoute; handler: RouteHandler }>();
 const subscribers = new Map<string, { engine: string; handler: SubscriptionHandler }[]>();
 const modules = new Map<string, EngineModule>();
 for (const module of options.engines) {
  if (!contract.engines.has(module.id)) throw new BindingRefused(runtimeRefusal('engine-not-declared'), `"${module.id}" is not an engine in packages/catalog/events.json.`);
  if (modules.has(module.id)) throw new BindingRefused(runtimeRefusal('engine-not-declared'), `"${module.id}" was bound twice.`);
  modules.set(module.id, module);
  for (const [key, handler] of Object.entries(module.routes)) {
   const route = contract.byKey.get(key);
   if (!route) throw new BindingRefused(runtimeRefusal('route-not-in-the-contract'), `${module.id} registered ${key}.`);
   if (route.withdrawn) throw new BindingRefused(runtimeRefusal('route-withdrawn'), `${module.id} registered ${key}.`);
   if (route.engine !== module.id) throw new BindingRefused(runtimeRefusal('route-belongs-to-another-engine'), `${module.id} registered ${key}, which is ${route.engine}'s.`);
   if (typeof handler !== 'function') throw new BindingRefused(runtimeRefusal('route-not-in-the-contract'), `${module.id} registered ${key} without a handler.`);
   handlers.set(key, { engine: module.id, route, handler });
  }
  for (const [key, handler] of Object.entries(module.subscriptions)) {
   validateSubscription(contract, module.id, key);
   if (typeof handler !== 'function') throw new BindingRefused(runtimeRefusal('subscription-not-declared'), `${module.id} subscribed to ${key} without a handler.`);
   subscribers.set(key, [...(subscribers.get(key) ?? []), { engine: module.id, handler }]);
  }
 }
 const trail = createTrail(openDatabase(directory, 'bus-trail'), clock);
 const stores = new Map<string, DatabaseSync>();
 for (const module of modules.values()) stores.set(module.id, openEngineStore(directory, module.id, module.store.schema));
 /* The handle stays here. A handler holds only the facade, which reads every statement before it runs. */
 const facades = new Map([...stores].map(([engine, db]) => [engine, storeFacade(db, runtimeRefusal)]));

 const faults: Fault[] = [];
 const queue: { event: BusEvent; engine: string }[] = [];
 let draining = false;

 const render = (refusal: Refusal, answeredBy: RuntimeAnswer['answeredBy'] = 'engine'): RuntimeAnswer => ({ status: refusal.status, body: { error: refusal.id, message: refusal.statement }, answeredBy });
 const fault = (engine: string, where: string, error: unknown): RuntimeAnswer => {
  faults.push({ engine, where, error });
  return render(runtimeRefusal('engine-fault'), 'runtime');
 };
 /* An engine refusal is answered only by the routes its answeredBy names. Any route used to be able to
    answer any refusal its engine declared, so a refusal could be added to a frozen route by declaring it
    one level up — which is how encounter-signature-unconfirmed reached two frozen Care routes — and no
    lock saw it. The names are part of each route's line in packages/catalog/apis.refusals.lock. */
 const declaredRefusal = (route: ContractRoute, id: string): Refusal | undefined =>
  route.refusals.find(r => r.id === id)
  ?? contract.engineRefusals.get(route.engine)?.find(r => r.id === id && (r.answeredBy ?? []).includes(route.key))
  ?? contract.shared.find(r => r.id === id);

 function flush(outbox: BusEvent[]) {
  for (const event of outbox) {
   const key = `${event.type}@${event.version}`;
   trail.append('published', { eventId: event.eventId, eventKey: key, engine: event.owner, body: event });
   const { to, withheld } = recipientsOf(contract, event, (subscribers.get(key) ?? []).map(s => s.engine));
   if (withheld.length) trail.append('withheld', { eventId: event.eventId, eventKey: key, engine: event.owner, body: withheld });
   for (const engine of to) queue.push({ event, engine });
  }
  outbox.length = 0;
 }

 /* A write a handler recorded for a refusal to keep. Only a route handler is given a route and a list to
    record into; a tick and a delivery refuse nothing, so they have neither. */
 type RecordedWrite = { sql: string; params: (string | number | bigint | null | Uint8Array)[] };
 function context(engine: string, caller: Caller, purpose: string, idempotencyKey: string | null, outbox: BusEvent[], route: ContractRoute | null = null, records: RecordedWrite[] | null = null): EngineContext {
  const actor = caller.role.startsWith('engine:') ? 'system' : caller.role;
  return {
   engine, caller, purpose, idempotencyKey,
   store: facades.get(engine)!,
   recordRefusal(sql, ...params) {
    if (!route || !records) throw new StoreRefused(runtimeRefusal('refusal-record-refused'), 'Only a route handler records what a refusal keeps.');
    const target = recordTargetFor(sql);
    if (!target) throw new StoreRefused(runtimeRefusal('refusal-record-refused'), "A refusal keeps one insert or update into one of the engine's own tables.");
    if (!(route.keptOnRefusal?.tables ?? []).some(table => table.toLowerCase() === target.table)) throw new StoreRefused(runtimeRefusal('refusal-record-refused'), `${route.key} does not name ${target.table} among the tables a refusal keeps.`);
    records.push({ sql, params });
   },
   clock: { now: () => clock.now(), iso: () => clock.iso() },
   publish(key, payload, publishOptions) {
    try {
     const event = validatePublish(contract, engine, key, payload, { ...publishOptions, actorRole: publishOptions.actorRole ?? actor, purposeOfUse: publishOptions.purposeOfUse ?? purpose }, clock);
     outbox.push(event);
     return { eventId: event.eventId, type: event.type, version: event.version };
    } catch (error) {
     if (error instanceof BusRefused) trail.append('refused', { eventKey: key, engine, body: { refusal: error.refusal, fields: error.fields } });
     throw error;
    }
   },
   call(key, fields, { purpose: callPurpose }) {
    const route = contract.byKey.get(key);
    if (!route || route.withdrawn) throw new BindingRefused(runtimeRefusal('route-not-in-the-contract'), `${engine} called ${key}.`);
    if (route.engine === engine) throw new BindingRefused(runtimeRefusal('calls-its-own-route'), `${engine} called ${key}.`);
    return dispatch(route, { role: `engine:${engine}`, ref: null }, callPurpose, fields, false);
   },
   ...(engine === 'core' ? { trail: { entries: trail.entries, verify: trail.verify } } : {}),
  };
 }

 const fromQuery = (field: Field, raw: string): unknown => {
  if (field.object) return raw;
  switch (field.type) {
   case 'integer': case 'number': case 'coordinate': return raw.trim() === '' ? raw : Number(raw);
   case 'boolean': return raw === 'true' ? true : raw === 'false' ? false : raw;
   case 'list': return raw.split(',');
   default: return raw;
  }
 };
 /* A handler's answer is held to its declared shape at every depth. The inside of an object used to be
    described only in prose, so a handler could add a key to a settings row or drop one and every screen
    reading it found out first. Where the contract declares an object's fields, a stray, a missing or a
    mistyped key inside it is a fault exactly as an undeclared top-level field is. A value whose inside a
    contract section decides is held to the keys that section allows, where it lists keys, and otherwise
    left to the section, which the build hashes into the route's line in apis.shapes.lock. */
 const shapeProblem = (where: string, f: Field, value: unknown): string | null => {
  if (f.shapeFrom) {
   const keys = keysAllowedBy(f.shapeFrom);
   if (!keys) return null;
   for (const row of f.type === 'list' && Array.isArray(value) ? value : [value]) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return `${where} is not an object.`;
    const stray = Object.keys(row).find(k => !keys.has(k));
    if (stray) return `${where} carries "${stray}", which ${f.shapeFrom} does not allow.`;
   }
   return null;
  }
  if (!valueOfType(f.type, value, f.object)) return `${where} is something other than ${f.object ? (f.type === 'list' ? 'a list of objects' : 'an object') : f.type}.`;
  if (!f.fields) return null;
  const rows = (f.type === 'list' ? value : [value]) as unknown[];
  for (const [i, row] of rows.entries()) {
   const at = f.type === 'list' ? `${where}[${i}]` : where;
   if (typeof row !== 'object' || row === null || Array.isArray(row)) return `${at} is not an object.`;
   const record = row as Record<string, unknown>;
   for (const inner of f.fields) {
    const given = record[inner.field];
    if (given === undefined || (given === null && !inner.nullable)) { if (inner.required) return `${at} has no ${inner.field}${given === null ? ', only null' : ''}.`; continue; }
    if (given === null) continue;
    const problem = shapeProblem(`${at}.${inner.field}`, inner, given);
    if (problem) return problem;
   }
   const stray = Object.keys(record).find(k => !f.fields!.some(inner => inner.field === k));
   if (stray) return `${at} carries "${stray}", which its declared fields do not.`;
  }
  return null;
 };
 const responseProblem = (route: ContractRoute, body: Record<string, unknown>): string | null => {
  for (const f of route.response) {
   if (body[f.field] === undefined || body[f.field] === null) { if (f.required) return `${route.key} answered without ${f.field}.`; continue; }
   if (!f.shapeFrom && !valueOfType(f.type, body[f.field], f.object)) return `${route.key} answered ${f.field} as something other than ${f.type}.`;
   if (f.fields || f.shapeFrom) {
    const problem = shapeProblem(`${route.key}'s ${f.field}`, f, body[f.field]);
    if (problem) return problem;
   }
  }
  const extra = Object.keys(body).find(k => !route.response.some(f => f.field === k));
  return extra ? `${route.key} answered with "${extra}", which its response does not declare.` : null;
 };

 function mockAnswer(route: ContractRoute, caller: Caller, purpose: string | undefined, given: Record<string, unknown>): RuntimeAnswer {
  const path = route.mountedPath.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(given[name] ?? '')));
  /* The route was chosen by its key, so the mock is told its version too, or a path live at two versions would be refused. */
  const headers = { [contract.mock.mock.roleHeader]: caller.role, [contract.mock.mock.purposeHeader]: purpose, [contract.mock.mock.versionHeader]: String(route.version) };
  const query = route.method === 'GET' ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, String(v)])) : {};
  return { ...mock.handle({ method: route.method, path, headers, query, body: route.method === 'GET' ? {} : given }), answeredBy: 'mock' };
 }

 function dispatch(route: ContractRoute, caller: Caller, purpose: string | undefined, given: Record<string, unknown>, queryStrings: boolean): RuntimeAnswer {
  const bound = handlers.get(route.key);
  if (!bound) return mockAnswer(route, caller, purpose, given);
  /* A caller the binder cannot tell apart from anybody — self, anonymous, loopback — is never admitted
     on a header's word, even where a route names it; that route needs a handler that checks, and the
     build derives this route's callers the same way. */
  if (!caller.role || settings.binderCannotAdmit.includes(caller.role) || !route.callers.includes(caller.role)) return render(shared('caller-not-allowed'));
  if (!purpose || !route.purpose.includes(purpose)) return render(shared('purpose-not-allowed'));
  const idempotencyField = contract.mock.idempotency.field;
  const key = given[idempotencyField];
  if (needsIdempotencyKey(contract.mock, route) && (typeof key !== 'string' || !key)) return render(shared('idempotency-key-required'));
  const fields: Record<string, unknown> = {};
  for (const f of route.request) {
   let value = given[f.field];
   if (value === undefined || value === null || value === '') {
    if (f.required) return render(shared('required-field-missing'));
    continue;
   }
   if (queryStrings && typeof value === 'string') value = fromQuery(f, value);
   if (!valueOfType(f.type, value, f.object)) return render(runtimeRefusal('field-of-the-wrong-type'));
   fields[f.field] = value;
  }
  const undeclared = Object.keys(given).filter(name => !route.request.some(f => f.field === name));
  const db = stores.get(bound.engine)!;
  /* A stored reply is handed back only to the caller who asked for it, for the request it answered.
     An engine is one caller under its own name; a person is identified by their reference, and an
     idempotent write from a person the binder cannot tell apart from another is refused, because the
     only alternative is a stored answer that could reach the wrong one. A reused key whose declared
     fields differ is refused rather than replayed. The binder answers that refusal itself, with the
     shared idempotency-key-reused, before the handler runs: the handler cannot see the earlier request,
     so it could not tell the difference. No engine file redeclares it, at route or engine level: every
     route inherits the shared refusals, and the boundary check refuses a second definition of one. */
  const replayKey = route.idempotent && typeof key === 'string' && key ? key : null;
  const engineCaller = caller.role.startsWith('engine:');
  if (replayKey && !engineCaller && !caller.ref) return render(runtimeRefusal('caller-unidentified'));
  const callerRef = engineCaller ? caller.role : caller.ref ?? '';
  const digest = requestDigest(fields);
  /* A declared secret is removed before an answer is stored, and a replay answers with the contract's
     sentence in its place. The first answer, and only the first, carries the secret itself. */
  const withoutSecrets = (declared: ContractRoute, body: Record<string, unknown>): Record<string, unknown> => {
   const kept = { ...body };
   for (const secret of declared.secretResponseFields ?? []) delete kept[secret.field];
   return kept;
  };
  const withSecretsReplaced = (declared: ContractRoute, body: Record<string, unknown>): Record<string, unknown> => {
   const replayed = { ...body };
   for (const secret of declared.secretResponseFields ?? []) replayed[secret.field] = secret.shownOnce;
   return replayed;
  };
  if (replayKey) {
   const row = db.prepare('SELECT request_digest, status, body FROM _runtime_replays WHERE route = ? AND role = ? AND caller_ref = ? AND idempotency_key = ?').get(route.key, caller.role, callerRef, replayKey) as { request_digest: string; status: number; body: string } | undefined;
   if (row && row.request_digest !== digest) return render(shared('idempotency-key-reused'));
   if (row) return { status: row.status, body: withSecretsReplaced(route, JSON.parse(row.body)), answeredBy: 'engine' };
  }
  const outbox: BusEvent[] = [];
  /* What the handler recorded for a refusal to keep. Applied on its own after the rollback when the
     refusal is one the route's keptOnRefusal names; written with everything else on an answer that is
     not a refusal; dropped with everything else on a fault. A recorded write for any other refusal is a
     fault, because a way to keep an attempt counter must not quietly become a way to keep anything. */
  const records: RecordedWrite[] = [];
  const keep = (writes: RecordedWrite[]) => { for (const write of writes) db.prepare(write.sql).run(...write.params); };
  db.exec('BEGIN');
  try {
   const answer = bound.handler({ route: route.key, fields: Object.freeze(fields), undeclared }, context(bound.engine, caller, purpose, typeof key === 'string' ? key : null, outbox, route, records));
   if (!answer || typeof answer !== 'object') throw new Error(`${route.key} answered with neither ok nor refuse.`);
   if ('refuse' in answer) {
    db.exec('ROLLBACK');
    const refusal = declaredRefusal(route, answer.refuse);
    if (!refusal) return fault(bound.engine, route.key, new Error(`${route.key} refused with "${answer.refuse}", which neither the route nor the shared list declares, and no engine refusal of that id names in answeredBy.`));
    if (records.length) {
     if (!(route.keptOnRefusal?.refusals ?? []).includes(answer.refuse)) return fault(bound.engine, route.key, new Error(`${route.key} recorded writes for the refusal "${answer.refuse}", which its keptOnRefusal does not name, so nothing it recorded is kept.`));
     db.exec('BEGIN');
     try {
      keep(records);
      db.exec('COMMIT');
     } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      return fault(bound.engine, route.key, error);
     }
    }
    return render(refusal);
   }
   const problem = responseProblem(route, answer.ok);
   if (problem) throw new Error(problem);
   keep(records);
   const result: RuntimeAnswer = { status: 200, body: answer.ok, answeredBy: 'engine' };
   /* A secret the contract names is shown to this caller now and never kept: the replay row holds the
      answer without it, and a replay answers with the contract's sentence in its place. */
   if (replayKey) db.prepare('INSERT INTO _runtime_replays (route, role, caller_ref, idempotency_key, request_digest, status, body) VALUES (?, ?, ?, ?, ?, ?, ?)').run(route.key, caller.role, callerRef, replayKey, digest, result.status, JSON.stringify(withoutSecrets(route, result.body)));
   /* The facade refuses every statement that could end the transaction; this is the second lock on
      the same door, so a handler that found a way round the first still cannot commit half of itself. */
   if (!db.isTransaction) throw new Error('The transaction the binder began was no longer open when the work finished, so nothing it did is kept.');
   db.exec('COMMIT');
   flush(outbox);
   return result;
  } catch (error) {
   if (db.isTransaction) db.exec('ROLLBACK');
   return fault(bound.engine, route.key, error);
  }
 }

 function run(engine: string, where: string, work: (ctx: EngineContext) => void, caller: Caller, purpose: string, idempotencyKey: string | null): boolean {
  const db = stores.get(engine)!;
  const outbox: BusEvent[] = [];
  db.exec('BEGIN');
  try {
   work(context(engine, caller, purpose, idempotencyKey, outbox));
   /* The facade refuses every statement that could end the transaction; this is the second lock on
      the same door, so a handler that found a way round the first still cannot commit half of itself. */
   if (!db.isTransaction) throw new Error('The transaction the binder began was no longer open when the work finished, so nothing it did is kept.');
   db.exec('COMMIT');
   flush(outbox);
   return true;
  } catch (error) {
   if (db.isTransaction) db.exec('ROLLBACK');
   faults.push({ engine, where, error });
   return false;
  }
 }

 /* Deliveries run after the work that published them has committed, one at a time, in order. A
    subscriber that fails is rolled back and written to the trail by the name of its error; the bus
    carries on, because one engine's fault must not become every engine's silence. */
 function drain() {
  if (draining) return;
  draining = true;
  try {
   let budget = 10_000;
   while (queue.length) {
    if (--budget < 0) throw new Error('The bus delivered ten thousand events in one turn, which is a loop rather than a workload.');
    const { event, engine } = queue.shift()!;
    const key = `${event.type}@${event.version}`;
    const subscriber = (subscribers.get(key) ?? []).find(s => s.engine === engine)!;
    const delivered = run(engine, `deliver ${key}`, ctx => subscriber.handler(event, ctx), { role: `engine:${event.owner}`, ref: null }, event.purposeOfUse, event.eventId);
    const last = faults.at(-1);
    trail.append(delivered ? 'delivered' : 'delivery-failed', { eventId: event.eventId, eventKey: key, engine, body: delivered ? {} : { error: last?.error instanceof BusRefused || last?.error instanceof StoreRefused ? last.error.refusal : (last?.error as Error)?.name ?? 'Error' } });
   }
  } finally {
   draining = false;
  }
 }

 return {
  handle(request) {
   const found = match(contract.mock.routes, request.method, request.path, request.headers[contract.mock.mock.versionHeader]);
   if (found === 'malformed') return render(shared('malformed-path'), 'runtime');
   if (!found) return render(runtimeRefusal('no-route'), 'runtime');
   if ('refused' in found) return render(shared(found.refused), 'runtime');
   const route = contract.byKey.get(routeKeyOf(found.route))!;
   const header = (name: string) => request.headers[name];
   if (!handlers.has(route.key)) return { ...mock.handle(request), answeredBy: 'mock' };
   const caller: Caller = { role: header(contract.mock.mock.roleHeader) ?? '', ref: header(settings.callerRefHeader) ?? null };
   const given = { ...(request.method === 'GET' ? request.query : request.body), ...found.params };
   const answer = dispatch(route, caller, header(contract.mock.mock.purposeHeader), given, request.method === 'GET');
   drain();
   return answer;
  },
  call(key, input) {
   const route = contract.byKey.get(key);
   if (!route || route.withdrawn) return render(runtimeRefusal('no-route'), 'runtime');
   const answer = dispatch(route, { role: input.role, ref: input.ref ?? null }, input.purpose, input.fields, false);
   drain();
   return answer;
  },
  /* A tick has no purpose of its own: each event it publishes names the purpose of the concern it acts on. */
  advance(ms) {
   clock.advance(ms);
   for (const module of modules.values()) if (module.tick) run(module.id, 'tick', ctx => module.tick!(ctx), { role: 'system', ref: null }, '', null);
   drain();
  },
  clock,
  trail: { entries: trail.entries, verify: trail.verify, all: trail.all },
  bound: () => [...handlers.keys()] as RouteKey[],
  faults: () => faults,
  close() {
   for (const db of stores.values()) db.close();
  },
 };
}
