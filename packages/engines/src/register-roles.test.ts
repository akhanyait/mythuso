/**
 * The carer and the Head of Operations on the engine runtime, across every engine built on it.
 *
 * A role on the vetting register reaches a route only where the contract names it, and the binder admits
 * nothing else. So the carer, who holds nothing clinical, is refused on every live built route that serves
 * treatment, diagnostics or dispensing, whatever it is sent; and no such route in the contract names the
 * carer at all, built or proposed. And the Core versions the two roles made wrong are withdrawn: the binder
 * refuses a module that registers one, and the runtime answers none of them. Nothing here is a real service,
 * and every call is synthetic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import apis from '../../catalog/apis.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { BindingRefused, MEMORY, createClock, createRuntime, defineEngine, ok, type EngineModule, type RouteKey } from './runtime/index.ts';
import { engine as access } from './access/engine.ts';
import { engine as care } from './care/engine.ts';
import { engine as core } from './core/engine.ts';
import { engine as money } from './money/engine.ts';
import { engine as safety } from './safety/engine.ts';
import { engine as devices } from './devices/engine.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };
const START = '2026-09-15T09:00:00+02:00';
const CARER = 'carer';
const CLINICAL = new Set(['treatment', 'diagnostics', 'dispensing']);
const ENGINES: EngineModule[] = [access, care, core, money, safety, devices];

type Route = { method: string; path: string; version: number; callers: string[]; purpose: string[]; status: string; withdrawn?: unknown; evidence?: { file: string } };
const routes = apis.engineFiles.flatMap(file => (JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')) as { routes: Route[] }).routes);
const keyOf = (r: Route) => `${r.method} ${r.path}@${r.version}` as RouteKey;
const clinical = (r: Route) => r.purpose.some(p => CLINICAL.has(p));

test('no route that serves treatment, diagnostics or dispensing names the carer, built or proposed, live or withdrawn', () => {
 const naming = routes.filter(r => clinical(r) && r.callers.includes(CARER)).map(keyOf);
 assert.deepEqual(naming, [], 'a carer holds nothing clinical, so no clinical route may take her calls');
});

test('a carer is refused on every live clinical route built on the runtime, before anything she sends is read', () => {
 const runtime = createRuntime({ env: FLAG, engines: ENGINES, dataDirectory: MEMORY, clock: createClock(START) });
 const bound = new Set(runtime.bound());
 const built = routes.filter(r => !r.withdrawn && r.status === 'built' && clinical(r) && r.evidence?.file.startsWith('packages/engines/src/'));
 assert.ok(built.length >= 5, `expected the runtime's clinical routes, found ${built.length}`);
 for (const route of built) {
  const key = keyOf(route);
  assert.ok(bound.has(key), `${key} is marked built and not bound`);
  for (const purpose of route.purpose) {
   const answer = runtime.call(key, { role: CARER, ref: 'party-synthetic-carer', purpose, fields: {} });
   assert.equal(answer.body['error'], 'caller-not-allowed', `${key} for ${purpose} answered a carer with ${JSON.stringify(answer.body)}`);
  }
 }
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the Core versions the new roles made wrong are withdrawn: not bound, not answered, and refused if a module registers one', () => {
 const withdrawn = ['POST /v1/core/loops/{loopRef}/acknowledge@2', 'POST /v1/core/loops/{loopRef}/escalate@2', 'POST /v1/core/loops/{loopRef}/close@1'] as RouteKey[];
 const runtime = createRuntime({ env: FLAG, engines: [core], dataDirectory: MEMORY, clock: createClock(START) });
 for (const key of withdrawn) {
  assert.ok(!runtime.bound().includes(key), `${key} is still bound`);
  assert.equal(runtime.call(key, { role: 'operator', ref: 'O-801', purpose: 'emergency', fields: {} }).body['error'], 'no-route', `${key} was answered`);
 }
 runtime.close();
 for (const key of withdrawn) {
  let refusal: string | null = null;
  try {
   createRuntime({ env: FLAG, engines: [defineEngine({ ...core, routes: { ...core.routes, [key]: () => ok({}) } })], dataDirectory: MEMORY, clock: createClock(START) });
  } catch (error) {
   refusal = (error as BindingRefused).refusal;
  }
  assert.equal(refusal, 'route-withdrawn', `a module registering ${key} was bound`);
 }
});
