/**
 * The engines' HTTP door, tested over a real socket: development only, synthetic data only, loopback
 * only. The runtime suite proves what the binder and the bus refuse; this proves the door in front of
 * them refuses what a mock's door refuses — no flag, no port, a request addressed to another host even
 * when it arrived on loopback, a body that is not a JSON object — and that every answer says it is
 * synthetic and which of the engine, the mock or the runtime gave it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MEMORY, RuntimeRefusedToStart, createClock, createRuntime } from './runtime/index.ts';
import { enginesConfig, serveEngines, startEngines } from './server.ts';

const FLAG = { MYTHUSO_ENGINES: 'synthetic-data-only' };

type Reply = { status: number; body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };

function send(port: number, options: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Reply> {
 return new Promise((resolve, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, path: options.path, method: options.method ?? 'GET', headers: options.headers ?? {} }, res => {
   let text = '';
   res.on('data', chunk => { text += chunk; });
   res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text || '{}'), headers: res.headers }));
  });
  req.on('error', reject);
  if (options.body !== undefined) req.write(options.body);
  req.end();
 });
}

async function listening(): Promise<{ server: Server; port: number }> {
 const runtime = createRuntime({ env: FLAG, engines: [], dataDirectory: MEMORY, clock: createClock('2026-09-14T09:00:00+02:00') });
 const server = serveEngines(runtime, { ...FLAG, MYTHUSO_ENGINES_PORT: '0' });
 await once(server, 'listening');
 return { server, port: (server.address() as AddressInfo).port };
}

test('the server refuses to start without the synthetic-data flag, because the factory does', async () => {
 await assert.rejects(() => startEngines({}), RuntimeRefusedToStart);
 await assert.rejects(() => startEngines({ MYTHUSO_ENGINES: 'yes' }), RuntimeRefusedToStart);
});

test('a port that is not a port is refused before anything binds', () => {
 assert.throws(() => enginesConfig({ MYTHUSO_ENGINES_PORT: 'eighty' }), RuntimeRefusedToStart);
 assert.throws(() => enginesConfig({ MYTHUSO_ENGINES_PORT: '70000' }), RuntimeRefusedToStart);
});

test('the server binds to 127.0.0.1, and every answer says it is synthetic and who gave it', async () => {
 const { server, port } = await listening();
 try {
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');
  const reply = await send(port, { path: '/v1/core/protocols/injection-administration%401', headers: { 'x-mythuso-role': 'nurse', 'x-mythuso-purpose': 'treatment' } });
  assert.equal(reply.status, 200);
  assert.equal(reply.headers['x-mythuso-engines'], 'synthetic-data-only');
  assert.equal(reply.headers['x-mythuso-answered-by'], 'mock', 'no engine is bound, so the contract mock answered');
 } finally {
  server.close();
 }
});

test('a request that arrived on loopback but is addressed to another host is refused', async () => {
 const { server, port } = await listening();
 try {
  const reply = await send(port, { path: '/v1/core/protocols/injection-administration%401', headers: { host: 'evil.example', 'x-mythuso-role': 'nurse', 'x-mythuso-purpose': 'treatment' } });
  assert.equal(reply.status, 403);
  assert.equal(reply.body.error, 'not-loopback');
 } finally {
  server.close();
 }
});

test('a body that is not a JSON object is refused in words, not thrown', async () => {
 const { server, port } = await listening();
 try {
  const reply = await send(port, { method: 'POST', path: '/v1/core/loops', headers: { 'content-type': 'application/json', 'x-mythuso-role': 'engine:care', 'x-mythuso-purpose': 'treatment' }, body: '[1, 2, 3]' });
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error, 'unreadable-body');
 } finally {
  server.close();
 }
});
