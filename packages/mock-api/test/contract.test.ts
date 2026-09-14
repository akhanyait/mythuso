/**
 * The contract test suite the build plan's Wave 2 exit test names: every route once with a valid call
 * and once with an invalid one, and every refusal every route declares returned with the status and the
 * sentence the contract gives it. Plus what keeps the mock from being a service: the library and the
 * server both refuse without the flag, the server binds to loopback and refuses a request addressed to
 * any other host, a path that does not decode is refused in words rather than thrown, and every answer
 * says it is synthetic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MockRefusedToStart, createMock, loadContract, needsIdempotencyKey, type Field, type Route } from '../src/mock.ts';
import { startMock } from '../src/server.ts';

const contract = loadContract();
const FLAG = { [contract.mock.flag]: contract.mock.flagValue };
const mock = createMock({ env: FLAG, contract, now: () => new Date('2026-09-14T09:00:00+02:00') });

const valueFor = (field: Field): unknown => {
 if (field.object) return field.type === 'list' ? [] : {};
 switch (field.type) {
  case 'integer': return 7;
  case 'number': case 'coordinate': return -26.2;
  case 'boolean': return true;
  case 'list': return ['synthetic'];
  default: return `synthetic-${field.field}`;
 }
};

function validCall(route: Route) {
 const given: Record<string, unknown> = {};
 for (const field of route.request) given[field.field] = valueFor(field);
 if (needsIdempotencyKey(contract, route)) given[contract.idempotency.field] = `key-${route.method}-${route.path}`;
 const path = route.mountedPath.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(given[name] ?? 'synthetic')));
 const headers = { [contract.mock.roleHeader]: route.callers[0], [contract.mock.purposeHeader]: route.purpose[0] };
 const query = route.method === 'GET' ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, String(v)])) : {};
 return { method: route.method, path, headers, query, body: route.method === 'GET' ? {} : given };
}

const typeOk = (field: Field, value: unknown): boolean => {
 if (field.object) return field.type === 'list' ? Array.isArray(value) : typeof value === 'object' && value !== null && !Array.isArray(value);
 switch (field.type) {
  case 'integer': return Number.isInteger(value);
  case 'number': case 'coordinate': return typeof value === 'number';
  case 'boolean': return typeof value === 'boolean';
  case 'list': return Array.isArray(value);
  default: return typeof value === 'string';
 }
};

function send(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown>; mockHeader: string | undefined }> {
 return new Promise((resolve, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers }, res => {
   let text = '';
   res.on('data', chunk => { text += chunk; });
   res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text || '{}'), mockHeader: res.headers['x-mythuso-mock'] as string | undefined }));
  });
  req.on('error', reject);
  req.end();
 });
}

test('the contract has routes to test', () => {
 assert.ok(contract.routes.length > 100, `only ${contract.routes.length} routes were loaded`);
});

for (const route of contract.routes) {
 const name = `${route.method} ${route.mountedPath}@${route.version}`;

 test(`${name} answers a valid call in its declared shape`, () => {
  const answer = mock.handle(validCall(route));
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  for (const field of route.response) {
   if (field.required) assert.ok(field.field in answer.body, `${field.field} is missing`);
   if (field.field in answer.body) assert.ok(typeOk(field, answer.body[field.field]), `${field.field} is not a ${field.type}${field.object ? ' object' : ''}`);
  }
 });

 test(`${name} refuses a caller it does not name`, () => {
  const call = validCall(route);
  const answer = mock.handle({ ...call, headers: { ...call.headers, [contract.mock.roleHeader]: 'nobody-the-contract-names' } });
  assert.equal(answer.status, 403);
  assert.equal(answer.body.error, 'caller-not-allowed');
 });

 test(`${name} returns every refusal it declares, exactly`, () => {
  for (const refusal of route.refusals) {
   const call = validCall(route);
   const answer = mock.handle({ ...call, headers: { ...call.headers, [contract.mock.refusalHeader]: refusal.id } });
   assert.equal(answer.status, refusal.status, refusal.id);
   assert.deepEqual(answer.body, { error: refusal.id, message: refusal.statement });
  }
 });
}

test('a purpose the route does not serve is refused', () => {
 const route = contract.routes.find(r => r.purpose.length && !r.purpose.includes('billing'))!;
 const call = validCall(route);
 const answer = mock.handle({ ...call, headers: { ...call.headers, [contract.mock.purposeHeader]: 'billing' } });
 assert.equal(answer.body.error, 'purpose-not-allowed');
});

test('a missing required field is refused', () => {
 const route = contract.routes.find(r => r.method !== 'GET' && r.request.some(f => f.required && !r.path.includes(`{${f.field}}`) && f.field !== contract.idempotency.field))!;
 const field = route.request.find(f => f.required && !route.path.includes(`{${f.field}}`) && f.field !== contract.idempotency.field)!;
 const call = validCall(route);
 const body = { ...call.body };
 delete body[field.field];
 assert.equal(mock.handle({ ...call, body }).body.error, 'required-field-missing');
});

test('every money and dispatch write refuses a call without an idempotency key, and replays one with it', () => {
 const writes = contract.routes.filter(route => needsIdempotencyKey(contract, route));
 assert.ok(writes.length > 10);
 for (const route of writes) {
  const call = validCall(route);
  const body = { ...call.body };
  delete body[contract.idempotency.field];
  assert.equal(mock.handle({ ...call, body }).body.error, 'idempotency-key-required', `${route.method} ${route.path}`);
  assert.equal(mock.handle(call), mock.handle(call), `${route.method} ${route.path} did not replay`);
 }
});

test('a path that does not decode is refused with the declared refusal, not thrown', () => {
 const answer = mock.handle({ method: 'GET', path: '/v1/trust/parties/%E0%A4%A', headers: {}, query: {}, body: {} });
 const declared = contract.shared.find(r => r.id === 'malformed-path')!;
 assert.equal(answer.status, declared.status);
 assert.deepEqual(answer.body, { error: declared.id, message: declared.statement });
});

test('the library refuses to answer anything without the flag, and refuses a flag that says anything else', () => {
 assert.throws(() => createMock({ env: {} }), MockRefusedToStart);
 assert.throws(() => createMock({ env: { [contract.mock.flag]: 'yes' } }), MockRefusedToStart);
 assert.throws(() => startMock({}), MockRefusedToStart);
});

test('the server binds to loopback, refuses a request addressed to another host, survives a bad path and labels every answer synthetic', async () => {
 const server = startMock({ ...FLAG, MYTHUSO_MOCK_PORT: '0' });
 await new Promise(resolve => server.on('listening', resolve));
 const address = server.address() as AddressInfo;
 assert.equal(address.address, '127.0.0.1');
 const route = contract.routes.find(r => r.method === 'GET' && !r.request.length)!;
 const headers = { [contract.mock.roleHeader]: route.callers[0]!, [contract.mock.purposeHeader]: route.purpose[0]! };

 const rebound = await send(address.port, route.mountedPath, { ...headers, host: 'evil.example' });
 assert.equal(rebound.status, 403);
 assert.equal(rebound.body.error, 'not-loopback');

 const malformed = await send(address.port, '/v1/trust/parties/%E0%A4%A', { host: `127.0.0.1:${address.port}` });
 assert.equal(malformed.status, 400);
 assert.equal(malformed.body.error, 'malformed-path');

 const ok = await send(address.port, route.mountedPath, { ...headers, host: `localhost:${address.port}` });
 assert.equal(ok.status, 200);
 assert.equal(ok.mockHeader, 'synthetic-data-only');
 await new Promise(resolve => server.close(resolve));
});
