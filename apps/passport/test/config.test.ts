/**
 * The service refuses to start anywhere it should not, and refuses a key or a file it shares with
 * identity — and createPassport() and the gateway refuse exactly as the process does.
 *
 * The last test runs the real entry point in a child process, because a refusal that only exists in
 * loadPassportConfig() and not at the door of the process is a refusal nobody running the service meets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPassportConfig } from '../src/config.ts';
import { PassportGateway } from '../src/gateway.ts';
import { createPassport } from '../src/server.ts';
import { PassportStore } from '../src/store.ts';
import { sentence } from './harness.ts';

const KEY = randomBytes(32).toString('hex');
const DEV = { MYTHUSO_PASSPORT_DEVELOPMENT: 'synthetic-data-only', MYTHUSO_PASSPORT_MASTER_KEY: KEY };
const refusedWith = (env: Record<string, string>, id: string) =>
 assert.throws(() => loadPassportConfig(env as NodeJS.ProcessEnv), { message: sentence(id) });

describe('development only', () => {
 test('no development flag, no start', () => refusedWith({ MYTHUSO_PASSPORT_MASTER_KEY: KEY }, 'not-development'));
 test('a flag set to anything but the phrase is not the flag', () => refusedWith({ ...DEV, MYTHUSO_PASSPORT_DEVELOPMENT: 'true' }, 'not-development'));
 test('finding 12: a production environment is refused in any spelling, even with the flag set', () => {
  for (const value of ['production', 'Production', 'PRODUCTION', ' production ', 'prod', 'live', 'staging']) {
   refusedWith({ ...DEV, MYTHUSO_ENV: value }, 'production-environment');
   refusedWith({ ...DEV, NODE_ENV: value }, 'production-environment');
  }
  for (const value of ['development', 'Development', 'test']) assert.ok(loadPassportConfig({ ...DEV, MYTHUSO_ENV: value } as NodeJS.ProcessEnv));
 });
 test('the loopback and only the loopback', () => refusedWith({ ...DEV, MYTHUSO_PASSPORT_HOST: '0.0.0.0' }, 'not-loopback'));
 test('finding 12: createPassport() and the gateway ask the same questions, so importing them skips nothing', () => {
  assert.throws(() => createPassport({ MYTHUSO_PASSPORT_MASTER_KEY: KEY } as NodeJS.ProcessEnv), { message: sentence('not-development') });
  assert.throws(() => createPassport({ ...DEV, MYTHUSO_PROTECTION_KEYS: `1:${KEY}` } as NodeJS.ProcessEnv), { message: sentence('shared-key') });
  const handBuilt = { port: 8797, host: '127.0.0.1', databasePath: ':memory:', masterKey: Buffer.from(KEY, 'hex') };
  assert.throws(() => new PassportGateway({ config: handBuilt, store: new PassportStore(':memory:') }), { message: sentence('not-development') });
 });
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

 test('finding 12: the identity service\'s database is refused however it is spelled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'passport-synthetic-'));
  const identity = join(dir, 'identity.db');
  writeFileSync(identity, '');
  const link = join(dir, 'looks-different.db');
  symlinkSync(identity, link);
  refusedWith({ ...DEV, MYTHUSO_DB: identity, MYTHUSO_PASSPORT_DB: identity }, 'shared-database');
  refusedWith({ ...DEV, MYTHUSO_DB: identity, MYTHUSO_PASSPORT_DB: relative(process.cwd(), identity) }, 'shared-database');
  refusedWith({ ...DEV, MYTHUSO_DB: identity, MYTHUSO_PASSPORT_DB: link }, 'shared-database');
  refusedWith({ ...DEV, MYTHUSO_DB: `${dir}/./identity.db`, MYTHUSO_PASSPORT_DB: identity }, 'shared-database');
  refusedWith({ ...DEV, MYTHUSO_PASSPORT_DB: '/var/lib/mythuso/identity.db' }, 'shared-database');
  assert.ok(loadPassportConfig({ ...DEV, MYTHUSO_DB: identity, MYTHUSO_PASSPORT_DB: join(dir, 'passport.db') } as NodeJS.ProcessEnv));
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
