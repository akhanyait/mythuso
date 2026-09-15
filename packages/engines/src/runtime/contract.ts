/* The contracts the runtime enforces, read from where they live and nowhere else: routes from
   packages/catalog/apis, events from the sources events.json lists, grant routing from consent.json,
   purposes from the gate's Purpose union. The mock's loader is imported rather than copied, so the
   runtime's idea of a live route and the mock's cannot drift apart. */
import { readFileSync } from 'node:fs';
import { loadContract as loadMockContract, type Field, type MockContract, type Refusal, type Route } from '../../../mock-api/src/mock.ts';
import type { RouteKey } from './types.ts';

export type { Field, Refusal };
/* A response field the runtime must never keep, and the sentence a replay answers with in its place. */
export type SecretResponseField = { field: string; shownOnce: string };
/* The refusals that keep the writes a handler recorded for them, and the only tables those writes may touch. */
export type KeptOnRefusal = { refusals: string[]; tables: string[]; why: string };
export type ContractRoute = Route & {
 key: RouteKey; file: string; callerJustifications?: Record<string, string>;
 secretResponseFields?: SecretResponseField[]; keptOnRefusal?: KeptOnRefusal;
};
export type EventField = { field: string; type: string; required: boolean };
export type ContractEvent = {
 type: string; version: number; owner: string; payload: EventField[]; neverCarries?: { field: string }[];
 subscribers: string[]; withdrawn?: unknown; routing?: { by: string }; alert?: boolean; source: string;
};
export type NeverEntry = { field: string; names: string[]; match: 'ending' | 'anywhere'; why: string };
export type RuntimeSettings = {
 package: string; flag: string; flagValue: string; portVariable: string; defaultPort: number; dataVariable: string;
 defaultDataDirectory: string; callerRefHeader: string; mechanism: string; binderCannotAdmit: string[]; refusals: Refusal[];
};
export type RuntimeContract = {
 routes: ContractRoute[];
 byKey: Map<string, ContractRoute>;
 engineRefusals: Map<string, Refusal[]>;
 shared: Refusal[];
 settings: RuntimeSettings;
 mock: MockContract;
 engines: Set<string>;
 events: Map<string, ContractEvent>;
 neverOnBus: NeverEntry[];
 servingEngine: Map<string, string>;
 moneyEngine: string;
 moneyHears: Set<string>;
 purposes: Set<string>;
 busRefusals: Refusal[];
};

const root = new URL('../../../../', import.meta.url);
const readJson = (file: string): any => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
export const repositoryRoot = root;

export const routeKeyOf = (route: { method: string; path: string; version: number }): RouteKey => `${route.method} ${route.path}@${route.version}` as RouteKey;

/* The keys a catalogue section allows, for a field whose inside that section decides (shapeFrom): a list of
   { key } entries, or an object of lists of key names. A section of any other shape decides a kind rather
   than a set of keys, and gives none; the build refuses a pointer that resolves to nothing. */
const sectionKeys = new Map<string, Set<string> | null>();
export function keysAllowedBy(pointer: string): Set<string> | null {
 if (!sectionKeys.has(pointer)) {
  const [file, path] = pointer.split('#');
  let section: unknown = file?.startsWith('packages/catalog/') && path ? readJson(file) : undefined;
  for (const key of (path ?? '').split('.')) section = section && typeof section === 'object' ? (section as Record<string, unknown>)[key] : undefined;
  const entries = Array.isArray(section) ? section as { key?: unknown }[] : null;
  const lists = section && typeof section === 'object' && !Array.isArray(section) ? Object.values(section).filter(Array.isArray) : [];
  sectionKeys.set(pointer, entries?.length && entries.every(entry => typeof entry?.key === 'string') ? new Set(entries.map(entry => entry.key as string))
   : lists.length ? new Set(lists.flat().filter((name): name is string => typeof name === 'string'))
   : null);
 }
 return sectionKeys.get(pointer)!;
}

let cached: RuntimeContract | null = null;

export function loadRuntimeContract(): RuntimeContract {
 if (cached) return cached;
 const apis = readJson('packages/catalog/apis.json');
 const passport = apis.conventions.passportPaths;
 const routes: ContractRoute[] = [];
 const engineRefusals = new Map<string, Refusal[]>();
 for (const file of apis.engineFiles as string[]) {
  const doc = readJson(file);
  engineRefusals.set(doc.engine, doc.refusals ?? []);
  for (const route of doc.routes as Route[]) {
   routes.push({ ...route, engine: doc.engine, file, key: routeKeyOf(route), mountedPath: passport.paths.includes(route.path) ? passport.mount + route.path : route.path });
  }
 }
 const eventsContract = readJson('packages/catalog/events.json');
 const events = new Map<string, ContractEvent>();
 for (const source of eventsContract.sources as string[]) {
  let declared: ContractEvent[] | undefined;
  try { declared = readJson(source).events; } catch { declared = undefined; }
  for (const event of declared ?? []) events.set(`${event.type}@${event.version}`, { ...event, source });
 }
 const grants = readJson('packages/catalog/consent.json').grants.recipientRoles as { id: string; engine: string; identifiable?: boolean }[];
 const purposeSource = readFileSync(new URL('apps/api/src/protection/contract.ts', root), 'utf8');
 const purposes = new Set([...((purposeSource.match(/export type Purpose =([^;]+);/) ?? [])[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]!));
 if (!purposes.size) throw new Error('The runtime can no longer read the gate\'s Purpose union, so no event\'s purpose could be checked.');
 const core = readJson('packages/catalog/apis/core.json');
 const eventsRoute = (core.routes as Route[]).find(r => r.method === 'POST' && r.path === '/v1/core/events' && !r.withdrawn);
 if (!eventsRoute) throw new Error('packages/catalog/apis/core.json has lost POST /v1/core/events, whose refusals are the bus\'s.');
 cached = {
  routes,
  byKey: new Map(routes.map(r => [r.key, r])),
  engineRefusals,
  shared: apis.sharedRefusals,
  settings: apis.engineRuntime,
  mock: loadMockContract(),
  engines: new Set((eventsContract.engines as { id: string }[]).map(e => e.id)),
  events,
  neverOnBus: (eventsContract.neverInEnvelope as { field: string; aliases?: string[]; match?: 'anywhere'; why: string }[])
   .map(b => ({ field: b.field, names: [b.field, ...(b.aliases ?? [])], match: b.match ?? 'ending', why: b.why })),
  servingEngine: new Map(grants.filter(r => r.identifiable !== false).map(r => [r.id, r.engine])),
  moneyEngine: eventsContract.moneyHears.engine,
  moneyHears: new Set((eventsContract.moneyHears.events as { type: string }[]).map(e => e.type)),
  purposes,
  busRefusals: [...eventsRoute.refusals, ...(core.refusals as Refusal[]), ...(eventsContract.refusals as Refusal[])],
 };
 return cached;
}

/* A field is refused when its name ends in a refused name, as whole words or as letters, or — for an
   entry marked anywhere, the score — when the words appear anywhere in it. The same reading the
   boundary check gives the contract at build time, applied here to what a publisher actually sends. */
const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function namedLike(field: string, name: string, match: 'ending' | 'anywhere' = 'ending'): boolean {
 const f = words(field), n = words(name);
 if (match === 'anywhere' && f.some((_, i) => n.every((w, j) => f[i + j] === w))) return true;
 return (n.length <= f.length && n.every((w, j) => f[f.length - n.length + j] === w)) || norm(field).endsWith(norm(name));
}
