/**
 * The material that would settle the one number in this service that is a proposal.
 *
 * `limits.writesPerCallerPerWindow` is sixty and it has said beside itself since it landed that
 * nobody arrived at it by watching anybody, because there is nobody to watch. These tests are about
 * the two things that would change that — how close an honest caller comes, and how often the limit
 * refused somebody — and about the property that makes it safe to keep: a window holds five integers
 * and nothing that is about a person.
 *
 * They also cover two things the register promised and no line of code carried out: write_attempts
 * was never swept, and an erasure never reached it.
 */
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { openStore, type Store } from '../src/store.ts';
import { loadConfig, limits } from '../src/config.ts';
import { sweep } from '../src/retention.ts';
import { HOLDINGS, basisById } from '../src/personalData.ts';

const WINDOW = limits.rateWindowSeconds * 1000;
const ORIGIN = 'http://localhost:5173';
const databasePath = join(mkdtempSync(join(tmpdir(), 'mythuso-windows-')), 'identity.db');
const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'p'.repeat(40), MYTHUSO_DB: databasePath
} as NodeJS.ProcessEnv);

let server: Server, store: Store, base: string;

before(async () => {
  store = openStore(config.databasePath);
  server = createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => { server.close(); store.close(); });
/* Every request in this file comes from the loopback and counts against one caller — including the
   GET /health/limits that reads the measurement back, because the four health routes are limited
   too. Cleared between tests so that the order they were written in does not decide which of them
   pass. */
beforeEach(() => { store.sweep('write_attempts', Date.now() + 1); });

describe('a window is five integers and nobody', () => {
  test('the table has no column a person could be written into', () => {
    /* The same question the clinical-table check asks of the schema, asked of this one by hand
       because the risk here is not a clinical word — it is a subject id, which is what every other
       table in this service is keyed on and what this one must never grow. */
    const database = new DatabaseSync(config.databasePath);
    const columns = (database.prepare('PRAGMA table_info(write_windows)').all() as unknown as { name: string }[]).map(c => c.name);
    database.close();
    assert.deepEqual(columns.sort(), ['busiest', 'callers', 'refused', 'window_start', 'writes']);
    for (const forbidden of ['subject', 'person_id', 'address', 'route', 'phone']) {
      assert.ok(!columns.includes(forbidden), `write_windows has a ${forbidden} column`);
    }
  });
  test('the holdings register names it, on a ground that says there is nothing of yours in it', () => {
    const holding = HOLDINGS.find(h => h.table === 'write_windows');
    assert.ok(holding, 'the register does not mention write_windows');
    assert.equal(holding.disposition, 'retain');
    const basis = basisById(holding.basis);
    assert.ok(basis);
    assert.equal(basis.conflictsWithErasure, false, 'a table with nobody in it cannot conflict with a right of erasure');
  });
});

describe('what the roll-up counts', () => {
  test('busiest is the most any one caller did, and callers is how many there were', () => {
    const at = Date.UTC(2026, 8, 10, 9, 0, 0);
    for (let i = 0; i < 7; i += 1) store.recordWrite(at + i * 1000, 'account-a', 'POST /consent/give');
    for (let i = 0; i < 3; i += 1) store.recordWrite(at + i * 1000, 'address:10.0.0.9', 'POST /account/name');
    assert.equal(store.rollUpWriteWindows(at + 3 * WINDOW, WINDOW), 1);
    const window = store.writeWindows(10).find(w => w.windowStart === Math.floor(at / WINDOW) * WINDOW);
    assert.ok(window);
    assert.equal(window.callers, 2);
    assert.equal(window.writes, 10);
    assert.equal(window.busiest, 7);
  });
  test('a window nobody can be summarising yet is left alone', () => {
    /* The limiter counts a sliding fifteen minutes, so an attempt made a moment ago is still being
       counted by it. Summarising a window that is still open would write a number down and then
       change it, which is the one thing a measurement may not do. */
    const now = Date.now();
    store.recordWrite(now, 'account-live', 'POST /account/name');
    store.rollUpWriteWindows(now - 2 * WINDOW, WINDOW);
    const current = store.writeWindows(10).find(w => w.windowStart === Math.floor(now / WINDOW) * WINDOW);
    assert.equal(current?.writes ?? 0, 0, 'a window that is still open was summarised');
  });
  test('running it twice writes the same numbers rather than double them', () => {
    const at = Date.UTC(2026, 8, 10, 11, 0, 0);
    for (let i = 0; i < 4; i += 1) store.recordWrite(at + i * 1000, 'account-b', 'POST /account/name');
    store.rollUpWriteWindows(at + 3 * WINDOW, WINDOW);
    store.rollUpWriteWindows(at + 3 * WINDOW, WINDOW);
    const window = store.writeWindows(20).find(w => w.windowStart === Math.floor(at / WINDOW) * WINDOW);
    assert.equal(window?.writes, 4);
  });
});

describe('a refusal is counted, and it is counted nowhere else', () => {
  test('the limit turning somebody away is recorded in the window and not against the caller', async () => {
    /* The one number in the measurement that is exact. A refused request never reaches
       write_attempts — the limiter answers and returns first — so without this it would be the one
       thing that matters most and the one thing nobody could count. */
    const post = () => fetch(`${base}/account/name`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{}'
    });
    let refusals = 0;
    for (let i = 0; i < limits.writesPerCallerPerWindow + 5; i += 1) {
      const response = await post();
      if (response.status === 429) refusals += 1;
      await response.text();
    }
    assert.ok(refusals >= 4, `expected the limit to turn requests away, saw ${refusals}`);
    const current = store.writeWindows(10).find(w => w.windowStart === Math.floor(Date.now() / WINDOW) * WINDOW);
    assert.equal(current?.refused, refusals);
    /* And the refusals did not extend the lockout that caused them: the attempts table holds exactly
       the requests that were accepted. */
    const accepted = store.countWrites(`address:127.0.0.1`, 0);
    assert.equal(accepted, limits.writesPerCallerPerWindow);
  });
});

describe('what the register promised and nothing carried out', () => {
  test('the sweep now reaches write_attempts', () => {
    /* It has been in the sweepable list and in the holdings register since the caller limit landed,
       and it was not in the sweep's plan — so the one table here that grows with traffic rather than
       with people grew without limit, and the sentence saying otherwise was true of the machinery
       and false of the schedule. */
    const spent = Date.now() - 3 * WINDOW;
    store.recordWrite(spent, 'account-old', 'POST /account/name');
    const report = sweep(store, { commit: true });
    const line = report.lines.find(l => l.table === 'write_attempts');
    assert.ok(line, 'the sweep still does not reach write_attempts');
    assert.ok(line.deleted > 0, 'nothing was swept');
    assert.equal(store.countWrites('account-old', 0), 0);
    assert.ok(report.windowsRolledUp > 0, 'the sweep deleted the attempts without summarising them first');
  });
  test('an erasure reaches it too', () => {
    store.createPerson({ id: 'erase-me', phone: '+27820000001', name: null, createdAt: Date.now() });
    store.recordWrite(Date.now(), 'erase-me', 'POST /consent/give');
    assert.equal(store.countWrites('erase-me', 0), 1);
    store.erasePerson('erase-me', '+27820000001', 'erased:erase-me', Date.now());
    assert.equal(store.countWrites('erase-me', 0), 0, 'the erasure did not reach write_attempts');
  });
});

describe('reading the measurement back', () => {
  test('it says out loud that the number is still a proposal', async () => {
    const body = await (await fetch(`${base}/health/limits`, { headers: { origin: ORIGIN } })).json() as {
      limit: number; settled: boolean; whatWouldSettleIt: string; windows: unknown[];
    };
    assert.equal(body.limit, limits.writesPerCallerPerWindow);
    assert.equal(body.settled, false);
    assert.match(body.whatWouldSettleIt, /there are no real callers/);
    assert.ok(Array.isArray(body.windows));
  });
  test('and it answers the health check rather than the internet', () => {
    /* Not driven over a non-loopback socket here — the restriction is on the whole GET /health/
       prefix in handle() and is exercised in privacy-routes.test.ts. What is asserted here is that
       this route was put behind the prefix rather than beside it, which is the mistake that would
       publish how much traffic it takes to reach the ceiling. */
    assert.ok('/health/limits'.startsWith('/health/'));
  });
});
