/**
 * The development mock: every route in packages/catalog/apis, answered from the contract itself.
 *
 * ── Why a mock, and why this strict ─────────────────────────────────────────────────────────────────
 *
 * Wave 2 freezes the API contract for all twelve engines before any of them is built past the identity
 * service and the Passport P0. Screens are built against the contract in the meantime, so something has
 * to answer — and a mock that says yes to everything teaches every screen that nothing is ever refused.
 * This one refuses exactly as the contract says each route will: a role that is not a caller, a purpose
 * the route does not serve, a missing required field, a money or dispatch write without an idempotency
 * key, a path it cannot decode, and — when a test asks for it by id in the refusal header — each of the
 * route's own refusals, with the status and the sentence the contract declares.
 *
 * ── What it never does ───────────────────────────────────────────────────────────────────────────────
 *
 * It holds nothing. Fixtures are made from the response fields' types on every call, idempotent replays
 * are kept in memory for the life of the process, and nothing is written anywhere. It does not decide
 * anything a real engine would decide — it cannot tell a valid visit code from an invalid one — which is
 * why refusals are asked for by id rather than simulated. The answers are synthetic and say so in a
 * header.
 *
 * ── Why the flag is checked here as well as in the server ────────────────────────────────────────────
 *
 * The third review found that the flag was the server's refusal only, so anything importing this
 * library could answer every route without saying what it serves. createMock() refuses without
 * MYTHUSO_MOCK=synthetic-data-only itself, and the server calls it.
 */
import { readFileSync } from 'node:fs';

export type Field = { field: string; type: string; required: boolean; why: string; object?: boolean };
export type Refusal = { id: string; status: number; statement: string; why: string };
export type Route = {
 method: string; path: string; version: number; summary: string; callers: string[]; purpose: string[];
 request: Field[]; response: Field[]; refusals: Refusal[]; idempotent: boolean; reads?: boolean; status: string;
 engine: string; mountedPath: string; withdrawn?: unknown;
};
export type MockContract = {
 routes: Route[];
 shared: Refusal[];
 idempotency: { field: string; appliesToEngines: string[]; appliesToPurposes: string[]; appliesToMethods: string[] };
 mock: { flag: string; flagValue: string; roleHeader: string; purposeHeader: string; refusalHeader: string; loopbackHosts: string[] };
};
export type MockRequest = { method: string; path: string; headers: Record<string, string | undefined>; query: Record<string, string>; body: Record<string, unknown> };
export type MockAnswer = { status: number; body: Record<string, unknown> };
export type MockOptions = { env: Record<string, string | undefined>; contract?: MockContract; now?: () => Date };

export class MockRefusedToStart extends Error {}

const root = new URL('../../../', import.meta.url);
const readJson = (file: string): any => JSON.parse(readFileSync(new URL(file, root), 'utf8'));

/** Every engine file's routes, with the engine and the path a client calls. Withdrawn routes are not answered. */
export function loadContract(): MockContract {
 const apis = readJson('packages/catalog/apis.json');
 const passport = apis.conventions.passportPaths;
 const routes: Route[] = [];
 for (const file of apis.engineFiles as string[]) {
  const doc = readJson(file);
  for (const route of doc.routes as Route[]) {
   if (route.withdrawn) continue;
   routes.push({ ...route, engine: doc.engine, mountedPath: passport.paths.includes(route.path) ? passport.mount + route.path : route.path });
  }
 }
 return { routes, shared: apis.sharedRefusals, idempotency: apis.conventions.idempotency, mock: apis.mock };
}

export const needsIdempotencyKey = (contract: MockContract, route: Route): boolean =>
 route.reads !== true
 && contract.idempotency.appliesToMethods.includes(route.method)
 && (contract.idempotency.appliesToEngines.includes(route.engine) || route.purpose.some(p => contract.idempotency.appliesToPurposes.includes(p)));

const segmentsOf = (path: string): string[] => path.split('/').filter(Boolean);
const paramsIn = (path: string): string[] => [...path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!);

/* A path whose escapes do not decode is not a path to any route. It used to throw out of the request
   handler — an unhandled rejection that could take the process down — and now it is a refusal. */
export function match(routes: Route[], method: string, path: string): { route: Route; params: Record<string, string> } | 'malformed' | null {
 let asked: string[];
 try {
  asked = segmentsOf(path).map(segment => decodeURIComponent(segment));
 } catch {
  return 'malformed';
 }
 for (const route of routes) {
  if (route.method !== method) continue;
  const declared = segmentsOf(route.mountedPath);
  if (declared.length !== asked.length) continue;
  const params: Record<string, string> = {};
  let ok = true;
  declared.forEach((segment, i) => {
   const param = segment.match(/^\{(.+)\}$/);
   if (param) params[param[1]!] = asked[i]!;
   else if (segment !== asked[i]) ok = false;
  });
  if (ok) return { route, params };
 }
 return null;
}

/** A value of the field's declared shape. Synthetic, and never anything a person could mistake for data. */
export function fixtureValue(field: Field, now: Date): unknown {
 if (field.object) return field.type === 'list' ? [] : {};
 switch (field.type) {
  case 'integer': return 1;
  case 'number': return 1.5;
  case 'boolean': return true;
  case 'instant': return now.toISOString().replace('Z', '+00:00');
  case 'iso-date': return now.toISOString().slice(0, 10);
  case 'coordinate': return field.field.toLowerCase().includes('lng') ? 28.0473 : -26.2041;
  case 'list': return [];
  default: return `synthetic-${field.field}`;
 }
}

const refuse = (refusal: Refusal): MockAnswer => ({ status: refusal.status, body: { error: refusal.id, message: refusal.statement } });

export function createMock(options: MockOptions) {
 const contract = options.contract ?? loadContract();
 if (options.env[contract.mock.flag] !== contract.mock.flagValue) throw new MockRefusedToStart(`The mock answers with synthetic data only, and answers nothing until ${contract.mock.flag}=${contract.mock.flagValue} says so.`);
 const now = options.now ?? (() => new Date());
 const replays = new Map<string, MockAnswer>();
 const shared = (id: string): Refusal => {
  const refusal = contract.shared.find(r => r.id === id);
  if (!refusal) throw new Error(`packages/catalog/apis.json has lost the shared refusal ${id}`);
  return refusal;
 };

 function handle(request: MockRequest): MockAnswer {
  const found = match(contract.routes, request.method, request.path);
  if (found === 'malformed') return refuse(shared('malformed-path'));
  if (!found) return { status: 404, body: { error: 'no-route', message: 'No route in the contract answers that method and path.' } };
  const { route, params } = found;
  const role = request.headers[contract.mock.roleHeader];
  if (!role || !route.callers.includes(role)) return refuse(shared('caller-not-allowed'));
  const purpose = request.headers[contract.mock.purposeHeader];
  if (!purpose || !route.purpose.includes(purpose)) return refuse(shared('purpose-not-allowed'));

  const given: Record<string, unknown> = { ...(route.method === 'GET' ? request.query : request.body), ...params };
  /* The key is asked for before the other fields, because it is one of them: a write without it would
     otherwise be told a field is missing rather than which field, and why it matters. */
  const key = given[contract.idempotency.field];
  if (needsIdempotencyKey(contract, route) && (typeof key !== 'string' || !key)) return refuse(shared('idempotency-key-required'));
  for (const field of route.request) {
   if (field.required && (given[field.field] === undefined || given[field.field] === null || given[field.field] === '')) return refuse(shared('required-field-missing'));
  }

  const asked = request.headers[contract.mock.refusalHeader];
  if (asked) {
   const refusal = route.refusals.find(r => r.id === asked);
   return refusal ? refuse(refusal) : { status: 400, body: { error: 'no-such-refusal', message: 'This route declares no refusal with that id.' } };
  }

  const replayKey = typeof key === 'string' && route.idempotent ? `${route.method} ${request.path} ${key}` : null;
  if (replayKey && replays.has(replayKey)) return replays.get(replayKey)!;
  const at = now();
  const body: Record<string, unknown> = {};
  for (const field of route.response) body[field.field] = fixtureValue(field, at);
  const answer = { status: 200, body };
  if (replayKey) replays.set(replayKey, answer);
  return answer;
 }

 return { routes: contract.routes, contract, handle, paramsIn };
}
