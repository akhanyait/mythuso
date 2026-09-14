/**
 * The service refuses to start anywhere it should not, and refuses a key it shares with identity.
 *
 * The last test runs the real entry point in a child process, because a refusal that only exists in
 * loadPassportConfig() and not at the door of the process is a refusal nobody running the service meets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadPassportConfig } from '../src/config.ts';
import { sentence } from './harness.ts';

const KEY = randomBytes(32).toString('hex');
const DEV = { MYTHUSO_PASSPORT_DEVELOPMENT: 'synthetic-data-only', MYTHUSO_PASSPORT_MASTER_KEY: KEY };
const refusedWith = (env: Record<string, string>, id: string) =>
 assert.throws(() => loadPassportConfig(env as NodeJS.ProcessEnv), { message: sentence(id) });

describe('development only', () => {
 test('no development flag, no start', () => refusedWith({ MYTHUSO_PASSPORT_MASTER_KEY: KEY }, 'not-development'));
 test('a flag set to anything but the phrase is not the flag', () => refusedWith({ ...DEV, MYTHUSO_PASSPORT_DEVELOPMENT: 'true' }, 'not-development'));
 test('a production environment is refused even with the flag set', () => {
  refusedWith({ ...DEV, MYTHUSO_ENV: 'production' }, 'production-environment');
  refusedWith({ ...DEV, NODE_ENV: 'production' }, 'production-environment');
 });
 test('the loopback and only the loopback', () => refusedWith({ ...DEV, MYTHUSO_PASSPORT_HOST: '0.0.0.0' }, 'not-loopback'));
});

describe('its own key, and its own store', () => {
 test('no key of its own, no start', () => {
  refusedWith({ MYTHUSO_PASSPORT_DEVELOPMENT: 'synthetic-data-only' }, 'no-master-key');
  refusedWith({ ...DEV, MYTHUSO_PASSPORT_MASTER_KEY: 'too-short' }, 'no-master-key');
 });

 test('the identity service\'s protection key is refused', () => {
  refusedWith({ ...DEV, MYTHUSO_PROTECTION_KEYS: `1:${KEY}` }, 'shared-key');
  refusedWith({ ...DEV, MYTHUSO_PROTECTION_KEYS: `1:${randomBytes(32).toString('hex')},2:${KEY}` }, 'shared-key');
  refusedWith({ ...DEV, MYTHUSO_ENCRYPTION_KEY: KEY }, 'shared-key');
  refusedWith({ ...DEV, MYTHUSO_AUTH_PEPPER: `pepper-${KEY}` }, 'shared-key');
 });

 test('a key derived from the identity service\'s key the obvious ways is refused', () => {
  const identity = randomBytes(32);
  const env = { MYTHUSO_PASSPORT_DEVELOPMENT: 'synthetic-data-only', MYTHUSO_PROTECTION_KEYS: `1:${identity.toString('hex')}` };
  for (const derived of [
   createHash('sha256').update(identity).digest(),
   createHmac('sha256', identity).update('passport').digest(),
   Buffer.from(hkdfSync('sha256', identity, Buffer.alloc(0), 'passport', 32)),
   Buffer.from(hkdfSync('sha256', identity, Buffer.alloc(0), 'mythuso-passport', 32))
  ]) refusedWith({ ...env, MYTHUSO_PASSPORT_MASTER_KEY: derived.toString('hex') }, 'shared-key');
 });

 test('an unrelated key starts, on the contract\'s port, on the loopback', () => {
  const config = loadPassportConfig({ ...DEV, MYTHUSO_PROTECTION_KEYS: `1:${randomBytes(32).toString('hex')}` } as NodeJS.ProcessEnv);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8797);
  assert.equal(config.masterKey.toString('hex'), KEY);
 });

 test('the identity service\'s database file is refused', () => {
  refusedWith({ ...DEV, MYTHUSO_DB: '/tmp/synthetic-identity.db', MYTHUSO_PASSPORT_DB: '/tmp/synthetic-identity.db' }, 'shared-database');
 });
});

describe('the process at the door', () => {
 test('started without the development flag, the service exits before a socket opens and says why', async () => {
  const entry = fileURLToPath(new URL('../src/server.ts', import.meta.url));
  const child = spawn(process.execPath, [entry], { env: { PATH: process.env.PATH ?? '', MYTHUSO_PASSPORT_MASTER_KEY: KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const code = await new Promise<number | null>(resolve => child.on('exit', resolve));
  assert.equal(code, 1);
  assert.ok(stderr.includes(sentence('not-development')), stderr);
  assert.equal(stdout.includes('http://'), false);
 });
});
