/* The API contract, turned into checks a bound engine cannot walk around.
 *
 * Twelve files in packages/catalog/apis are the frozen contract: every route's status, the callers it
 * takes, the purpose it serves, the fields it takes and the sentences it refuses with. The engines bind
 * to it through packages/engines/src/runtime, which refuses an undeclared key, a withdrawn route and
 * another engine's route before any store is opened. What the binder cannot say is whether the routes an
 * engine registers are the routes somebody meant it to register, and it answers nothing at all about a
 * route no module has built.
 *
 * This generator writes that down per engine, from both sides at once: the catalog, and the engine
 * module itself, imported and bound here on a throwaway runtime exactly as the generated test will bind
 * it. Three things come out of pairing them:
 *
 *   1. The registered table — runtime.bound() — baked as it answered while this file generated. Every
 *      registered key, and no other. A built route the module does not register is not an error in this
 *      file: forty-odd of them are served outside packages/engines for now (apps/api, apps/passport), and
 *      an assertion that every built route is registered would be an assertion about work not yet done,
 *      which is the readiness overstatement this repository exists to refuse. What is asserted is the
 *      partition each engine actually draws, exactly, and that every registered key is one the catalog
 *      marks built and live.
 *   2. No proposed or withdrawn route is registered, and what the runtime does with each is proven and
 *      baked: a withdrawn key answers nothing (404 no-route, from the runtime rather than an engine — the
 *      contract's 410 route-withdrawn is the binder's refusal to register one, not an answer to a call,
 *      and nothing here pretends a request to it gets a 410), and a proposed key is answered by the
 *      development mock, which is what a route no engine has built gets.
 *   3. Refusal wiring on live routes: a caller the route does not name, a purpose it does not serve, a
 *      required field not sent, a field sent in the wrong shape, and a money or dispatch write without
 *      its idempotency key are each called against the bound engine and compared with the catalog's
 *      status and sentence, byte for byte.
 *
 * Not one expectation is typed from prose: every probe is made here, against the runtime, as this file
 * generates, and a probe that does not hold throws before anything is written. The generated test
 * re-makes each one on every run, so an engine that drifts from its contract fails the suite; a contract
 * that drifts from the engines fails this generator; and scripts/check-boundaries.mjs compares the file
 * against this generator on every build, so a stale copy cannot pass either.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { loadRuntimeContract } = await import('../packages/engines/src/runtime/contract.ts');
const { createRuntime, MEMORY, createClock } = await import('../packages/engines/src/runtime/index.ts');
const { needsIdempotencyKey } = await import('../packages/mock-api/src/mock.ts');

const CATALOG = 'packages/catalog/apis.json';
const OUTPUT = 'packages/engines/src/contract-compliance.generated.test.ts';
const MORNING = '2026-09-15T09:00:00+02:00';
/* The eleven engine modules. pulse owns no route in the catalog, so it has no module and none is bound. */
const MODULE_IDS = ['access', 'care', 'clinical', 'core', 'devices', 'medicines', 'money', 'movement', 'record', 'safety', 'trust'];
/* A role no catalog declares anywhere: a call under it proves the caller-not-allowed wiring and nothing else. */
const NOBODY = 'nobody-synthetic-0';
/* A purpose no route serves: the union lives in the gate's own contract, and this is not one of its words. */
const NOT_SERVED = 'purpose-not-served-synthetic';
const PROBE_REF = 'subject-synthetic-compliance';

const modules = {};
for (const id of MODULE_IDS) modules[id] = (await import(`../packages/engines/src/${id}/engine.ts`)).engine;

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/* A probe's field value, written as the JavaScript value it is: a wrong-value probe sends a number where
   a string belongs, and writing it as its own text would send the type the field wants and prove nothing. */
const jsLiteral = (value) => typeof value === 'string' ? quote(value)
 : typeof value === 'number' || typeof value === 'boolean' ? String(value)
 : Array.isArray(value) ? '[]'
 : '{}';
const fieldsLiteral = (fields) => {
 const entries = Object.entries(fields);
 return entries.length ? `{ ${entries.map(([name, value]) => `${name}: ${jsLiteral(value)}`).join(', ')} }` : '{}';
};
/* A record of engine -> sorted keys, written the way the generated test reads it. Empty engines are left out. */
const mapLiteral = (values) => {
 const engines = Object.keys(values).sort();
 if (!engines.length) return '{}';
 const lines = ['{'];
 for (const engine of engines) {
  lines.push(` ${engine}: [`);
  for (const entry of values[engine]) lines.push(`  ${quote(entry)},`);
  lines.push(' ],');
 }
 lines.push('}');
 return lines.join('\n');
};
const validValue = (field) => field.object ? (field.type === 'list' ? [] : {})
 : field.type === 'integer' || field.type === 'number' || field.type === 'coordinate' ? 1
 : field.type === 'boolean' ? true
 : field.type === 'list' ? []
 : field.type === 'instant' ? MORNING
 : field.type === 'iso-date' ? '2026-09-15'
 : 'synthetic-compliance';
/* A value that is sent, is not empty, and is not of the field's declared type — whatever the type is. */
const wrongValue = (field) => field.object ? 123
 : field.type === 'integer' || field.type === 'number' || field.type === 'coordinate' ? 'not-a-number'
 : field.type === 'boolean' ? 'not-a-boolean'
 : 123;

export function emitContractTests(root = '') {
 const apis = JSON.parse(readFileSync(root + CATALOG, 'utf8'));
 const engineIds = apis.engineFiles.map((file) => JSON.parse(readFileSync(root + file, 'utf8')).engine);
 for (const id of MODULE_IDS) if (!engineIds.includes(id)) throw new Error(`${CATALOG} no longer declares the engine "${id}", whose module this generator binds.`);
 for (const id of engineIds) if (!MODULE_IDS.includes(id)) {
  const routes = JSON.parse(readFileSync(root + `packages/catalog/apis/${id}.json`, 'utf8')).routes ?? [];
  if (routes.length) throw new Error(`The engine "${id}" has ${routes.length} route(s) in the catalog and no module this generator can bind.`);
 }

 const contract = loadRuntimeContract();
 const noRoute = contract.settings.refusals.find((r) => r.id === 'no-route');
 if (!noRoute) throw new Error(`${CATALOG}#engineRuntime has lost the no-route refusal, so a withdrawn route's answer could not be held.`);
 const statement = (id) => {
  const found = contract.shared.find((r) => r.id === id) ?? contract.settings.refusals.find((r) => r.id === id);
  if (!found) throw new Error(`Neither ${CATALOG}#sharedRefusals nor #engineRuntime declares the refusal "${id}".`);
  return found.statement;
 };
 const callerNotAllowed = { status: 403, error: 'caller-not-allowed', message: statement('caller-not-allowed') };
 const purposeNotAllowed = { status: 403, error: 'purpose-not-allowed', message: statement('purpose-not-allowed') };
 const keyRequired = { status: 400, error: 'idempotency-key-required', message: statement('idempotency-key-required') };
 const fieldMissing = { status: 400, error: 'required-field-missing', message: statement('required-field-missing') };
 const wrongType = { status: 400, error: 'field-of-the-wrong-type', message: statement('field-of-the-wrong-type') };
 const idempotencyField = contract.mock.idempotency.field;

 /* Every route, in the bucket its catalog line puts it in: withdrawn first — a withdrawn route keeps its
    status and loses its callers — then built, then proposed. */
 const built = {}; const proposed = {}; const withdrawn = {};
 for (const route of contract.routes) {
  const bucket = route.withdrawn ? withdrawn : route.status === 'built' ? built : route.status === 'proposed' ? proposed : null;
  if (!bucket) throw new Error(`${route.key} has status "${route.status}", which is neither built nor proposed.`);
  (bucket[route.engine] ??= []).push(route.key);
 }
 for (const bucket of [built, proposed, withdrawn]) for (const keys of Object.values(bucket)) keys.sort();

 const registered = {};
 const probes = [];
 for (const id of MODULE_IDS) {
  const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [modules[id]], dataDirectory: MEMORY, clock: createClock(MORNING) });
  try {
   const bound = [...runtime.bound()].sort();
   registered[id] = bound;
   for (const key of bound) if (!(built[id] ?? []).includes(key)) throw new Error(`${id} registers ${key}, and ${CATALOG} does not declare it built and live.`);

   const answered = (key, input) => runtime.call(key, { ...input, ref: PROBE_REF });
   for (const key of withdrawn[id] ?? []) {
    if (bound.includes(key)) throw new Error(`${id} registers the withdrawn ${key}.`);
    const answer = answered(key, { role: NOBODY, purpose: NOT_SERVED, fields: {} });
    if (answer.status !== 404 || answer.body.error !== 'no-route' || answer.body.message !== noRoute.statement || answer.answeredBy !== 'runtime')
     throw new Error(`${id}'s withdrawn ${key} was expected to answer 404 no-route from the runtime, and answered ${JSON.stringify({ status: answer.status, error: answer.body.error, answeredBy: answer.answeredBy })}.`);
   }
   for (const key of proposed[id] ?? []) {
    if (bound.includes(key)) throw new Error(`${id} registers the proposed ${key}.`);
    const answer = answered(key, { role: NOBODY, purpose: NOT_SERVED, fields: {} });
    if (answer.answeredBy !== 'mock') throw new Error(`${id}'s proposed ${key} is answered by "${answer.answeredBy}"; no engine has built it, so the mock answers it.`);
   }

   const routes = contract.routes.filter((route) => route.engine === id && bound.includes(route.key));
   routes.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
   const admissible = (role) => role && !contract.settings.binderCannotAdmit.includes(role);
   const callerOf = (route) => route.callers.find(admissible) ?? null;
   const runProbe = (route, role, purpose, fields, expect) => {
    const probe = { engine: id, key: route.key, role, purpose, fields, expect };
    const answer = answered(route.key, { role, purpose, fields });
    const got = { status: answer.status, error: answer.body.error, message: answer.body.message, answeredBy: answer.answeredBy };
    const want = { ...expect, answeredBy: 'engine' };
    if (got.status !== want.status || got.error !== want.error || got.message !== want.message || got.answeredBy !== want.answeredBy)
     throw new Error(`${id}'s probe of ${route.key} (${expect.error}) was expected to answer ${JSON.stringify(want)} and answered ${JSON.stringify(got)}.`);
    probes.push(probe);
   };

   const firstCaller = routes.find((route) => !route.callers.includes(NOBODY));
   if (firstCaller) runProbe(firstCaller, NOBODY, firstCaller.purpose[0] ?? NOT_SERVED, {}, callerNotAllowed);

   const purposeRoute = routes.find((route) => callerOf(route) && route.purpose.length);
   if (purposeRoute) runProbe(purposeRoute, callerOf(purposeRoute), NOT_SERVED, {}, purposeNotAllowed);

   const idemRoute = routes.find((route) => route.purpose.length && callerOf(route) && needsIdempotencyKey(contract.mock, route));
   if (idemRoute) runProbe(idemRoute, callerOf(idemRoute), idemRoute.purpose[0], {}, keyRequired);

   const missingRoute = routes.find((route) => route.purpose.length && callerOf(route)
    && (needsIdempotencyKey(contract.mock, route) ? route.request.some((f) => f.required && f.field !== idempotencyField) : route.request.some((f) => f.required)));
   if (missingRoute) {
    const fields = needsIdempotencyKey(contract.mock, missingRoute) ? { [idempotencyField]: 'contract-compliance-1' } : {};
    runProbe(missingRoute, callerOf(missingRoute), missingRoute.purpose[0], fields, fieldMissing);
   }

   const typeRoute = routes.find((route) => route.purpose.length && callerOf(route) && route.request.some((f) => f.required && f.field !== idempotencyField));
   if (typeRoute) {
    const wrong = typeRoute.request.find((f) => f.required && f.field !== idempotencyField);
    const fields = needsIdempotencyKey(contract.mock, typeRoute) ? { [idempotencyField]: 'contract-compliance-1' } : {};
    for (const field of typeRoute.request) if (field.required && field !== wrong) fields[field.field] = validValue(field);
    fields[wrong.field] = wrongValue(wrong);
    runProbe(typeRoute, callerOf(typeRoute), typeRoute.purpose[0], fields, wrongType);
   }

   if (runtime.faults().length) throw new Error(`${id} faulted while this generator probed it: ${runtime.faults().map((fault) => String(fault.error)).join('; ')}`);
  } finally {
   runtime.close();
  }
 }

 const probeLines = probes.map((probe) => ` { engine: ${quote(probe.engine)}, key: ${quote(probe.key)}, role: ${quote(probe.role)}, purpose: ${quote(probe.purpose)}, fields: ${fieldsLiteral(probe.fields)}, expect: { status: ${probe.expect.status}, error: ${quote(probe.expect.error)}, message: ${quote(probe.expect.message)} } },`);

 const lines = [];
 lines.push(
  `// Generated by scripts/emit-contract-tests.mjs from ${CATALOG} and the twelve packages/catalog/apis/*.json`,
  '// engine files, with every engine module bound and probed as this file was generated. Do not edit by hand —',
  '// run `npm run contract-tests`. The build fails if this file and its sources disagree, so an edit here is',
  '// lost rather than merely wrong.',
  '//',
  '// What is held, per engine:',
  '//',
  '//   1. The registered table. runtime.bound() must equal the keys baked below exactly — every route the',
  '//      engine registers, and no other — and every registered key must be one the catalog marks built. A',
  '//      built route the engine does not register is not a failure here: the twelve engines are built one',
  '//      route at a time, and some built routes are served outside packages/engines for now (apps/api and',
  '//      apps/passport). The registered/absent partition is what is pinned, exactly.',
  '//   2. Withdrawn and proposed routes are registered nowhere. A call to a withdrawn route answers nothing:',
  '//      404 no-route, from the runtime rather than an engine — the contract\'s "410 route-withdrawn" is the',
  '//      binder refusing to register one, not an answer to a request, and nothing here pretends a caller gets',
  '//      a 410. A call to a proposed route is answered by the development mock, which is what a route no',
  '//      engine has built gets; no engine answers it.',
  '//   3. Refusal wiring, on live routes: a caller the route does not name, a purpose it does not serve, a',
  '//      required field not sent, a field sent in the wrong shape and a money or dispatch write without its',
  '//      idempotency key are each called and answered with the catalog\'s status and sentence. Every',
  '//      expectation below was proven against the runtime while this file was generated.',
  '//',
  '// This file sits beside the engines because it binds all of them. Nothing here is a real service.',
  '',
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { MEMORY, createClock, createRuntime, type EngineModule, type RouteKey, type Runtime } from './runtime/index.ts';",
 );
 for (const id of MODULE_IDS) lines.push(`import { engine as ${id} } from './${id}/engine.ts';`);
 lines.push(
  '',
  `const MORNING = ${quote(MORNING)};`,
  `const NO_ROUTE_MESSAGE = ${quote(noRoute.statement)};`,
  `const ENGINES: Record<string, EngineModule> = { ${MODULE_IDS.join(', ')} };`,
  '',
  `const REGISTERED: Record<string, string[]> = ${mapLiteral(registered)};`,
  '',
  `const BUILT: Record<string, string[]> = ${mapLiteral(built)};`,
  '',
  `const WITHDRAWN: Record<string, string[]> = ${mapLiteral(withdrawn)};`,
  '',
  `const PROPOSED: Record<string, string[]> = ${mapLiteral(proposed)};`,
  '',
  'const PROBES: { engine: string; key: string; role: string; purpose: string; fields: Record<string, unknown>; expect: { status: number; error: string; message: string } }[] = [',
  ...probeLines,
  '];',
  '',
  'const world = (engine: string): Runtime => createRuntime({ env: { MYTHUSO_ENGINES: \'synthetic-data-only\' }, engines: [ENGINES[engine]!], dataDirectory: MEMORY, clock: createClock(MORNING) });',
  'type Call = { role: string; purpose: string; fields: Record<string, unknown> };',
  `const callWith = (runtime: Runtime, key: string, input: Call) => runtime.call(key as RouteKey, { ...input, ref: ${quote(PROBE_REF)} });`,
  '',
 );

 for (const id of MODULE_IDS) {
  lines.push(
   `test('${id}: the registered table is exactly the one this file was generated with', () => {`,
   ` const runtime = world(${quote(id)});`,
   ' const bound = runtime.bound().sort();',
   ` assert.deepEqual(bound, REGISTERED[${quote(id)}], 'the registered table');`,
   ` for (const key of bound) assert.ok((BUILT[${quote(id)}] ?? []).includes(key), \`\${key} is registered, and the catalog does not mark it built and live\`);`,
   ' runtime.close();',
   '});',
   '',
  );
  if ((withdrawn[id] ?? []).length) lines.push(
   `test('${id}: a withdrawn route is registered nowhere, and the runtime answers none of them', () => {`,
   ` const runtime = world(${quote(id)});`,
   ` for (const key of WITHDRAWN[${quote(id)}]!) {`,
   '  assert.ok(!runtime.bound().includes(key as RouteKey), `${key} is withdrawn and must not be registered`);',
   `  const answer = callWith(runtime, key, { role: ${quote(NOBODY)}, purpose: ${quote(NOT_SERVED)}, fields: {} });`,
   '  assert.deepEqual([answer.status, answer.body[\'error\'], answer.body[\'message\'], answer.answeredBy], [404, \'no-route\', NO_ROUTE_MESSAGE, \'runtime\'], key);',
   ' }',
   ' assert.deepEqual(runtime.faults(), []);',
   ' runtime.close();',
   '});',
   '',
  );
  if ((proposed[id] ?? []).length) lines.push(
   `test('${id}: a proposed route is registered nowhere, and the mock answers it — no engine has built it', () => {`,
   ` const runtime = world(${quote(id)});`,
   ` for (const key of PROPOSED[${quote(id)}]!) {`,
   '  assert.ok(!runtime.bound().includes(key as RouteKey), `${key} is proposed and must not be registered`);',
   `  const answer = callWith(runtime, key, { role: ${quote(NOBODY)}, purpose: ${quote(NOT_SERVED)}, fields: {} });`,
   '  assert.equal(answer.answeredBy, \'mock\', `${key} is answered by ${answer.answeredBy}`);',
   ' }',
   ' assert.deepEqual(runtime.faults(), []);',
   ' runtime.close();',
   '});',
   '',
  );
  if (probes.some((probe) => probe.engine === id)) lines.push(
   `test('${id}: the binder refuses as the catalog declares, on the routes ${id} has built', () => {`,
   ` const runtime = world(${quote(id)});`,
   ` for (const probe of PROBES.filter((entry) => entry.engine === ${quote(id)})) {`,
   '  const answer = callWith(runtime, probe.key, { role: probe.role, purpose: probe.purpose, fields: probe.fields });',
   '  assert.deepEqual([answer.status, answer.body[\'error\'], answer.body[\'message\'], answer.answeredBy], [probe.expect.status, probe.expect.error, probe.expect.message, \'engine\'], `${probe.key} (${probe.expect.error})`);',
   ' }',
   ' assert.deepEqual(runtime.faults(), []);',
   ' runtime.close();',
   '});',
   '',
  );
 }

 return [{ path: OUTPUT, content: lines.join('\n') }];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitContractTests()) {
  writeFileSync(file.path, file.content);
  console.log(`contract-tests → ${file.path}`);
 }
}
