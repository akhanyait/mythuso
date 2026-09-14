/**
 * The ingestion boundary, over a socket.
 *
 * The point of these tests is not that the routes work — nothing works, deliberately. It is that the
 * refusals work, that they are the *same* refusals every time, and that nothing a stranger typed
 * survives the door. A seam is worth having only if its refusal is exercised, because the refusal is
 * the entire product until a vendor is contracted.
 *
 * Driven through a real server rather than by calling `decide`, for the reason the privacy document
 * gives about every other control here: a library with a test suite is not a running control.
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
import { FEEDS, capabilityFor, decide, describe as describeFeed, canonical } from '../src/feeds/index.ts';

const ORIGIN = 'http://localhost:5173';
const databasePath = join(mkdtempSync(join(tmpdir(), 'mythuso-feeds-')), 'identity.db');
const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'p'.repeat(40),
  MYTHUSO_PROTECTION_KEYS: `1:${'d7'.repeat(32)}`, MYTHUSO_PROTECTION_INDEX_VERSION: '1',
  MYTHUSO_DB: databasePath
} as NodeJS.ProcessEnv);

let server: Server, store: Store, base: string;

const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body)
});
const get = (path: string) => fetch(`${base}${path}`, { headers: { origin: ORIGIN } });

/** A payload that satisfies a feed's declared schema exactly, built from the contract itself. */
function wellFormed(feed: typeof FEEDS[number]): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const accepted of feed.accepts) {
    if (!accepted.required) continue;
    sample[accepted.field] =
      accepted.type === 'integer' ? 1
      : accepted.type === 'number' || accepted.type === 'coordinate' ? -26.15
      : accepted.type === 'boolean' ? true
      : accepted.type === 'list' ? ['one']
      : accepted.type === 'instant' ? '2026-09-10T14:32:07+02:00'
      : accepted.type === 'iso-date' ? '2026-09-10'
      : 'value';
  }
  return sample;
}

const positions = FEEDS.find(feed => feed.id === 'nurse-position')!;

before(async () => {
  store = openStore(config.databasePath);
  server = createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => { server.close(); store.close(); });
/* Every request in this file comes from the loopback, so they all count against one caller. That is
   the limiter working, and it is asserted at the foot of the file — but it would otherwise make the
   order of the tests above matter, which is a way of having tests that pass in the order somebody
   happened to write them. Swept between tests instead: it is spent material and the sweep is the
   operation that already exists for it. */
beforeEach(() => { store.sweep('write_attempts', Date.now() + 1); });

describe('the seam is a seam and not an integration', () => {
  test('every feed refuses a payload that is exactly what it asked for', async () => {
    /* The one that matters most. A well-formed payload is the case an integration would accept, and
       this service has no integration, so the correct answer is still no — the same no, every time,
       with the capability's own sentence attached. */
    for (const feed of FEEDS) {
      const response = await post(`/feeds/${feed.id}`, wellFormed(feed));
      assert.equal(response.status, 503, feed.id);
      const body = await response.json() as Record<string, string>;
      assert.equal(body.error, 'not-connected', feed.id);
      assert.equal(body.notice, capabilityFor(feed).notice, `${feed.id} must answer with the capability's own sentence`);
    }
  });
  test('not one capability behind a feed is connected', () => {
    for (const feed of FEEDS) assert.equal(describeFeed(feed).connected, false, feed.id);
  });
  test('a connected capability makes the route throw rather than start accepting', () => {
    /* If somebody flips the boolean while these routes are the whole of the integration, the honest
       failure is a service that will not answer — not one that quietly begins taking a supplier's
       payloads into a product with no adapter behind them. */
    const pretend = { ...positions, whileAbsent: { ...positions.whileAbsent, noticeFrom: 'pretend-connected' } };
    assert.throws(() => decide(pretend, {}), /does not have/);
  });
});

describe('what must never arrive', () => {
  test('a patient id in a position feed is refused, and named by the contract rather than by the sender', async () => {
    const response = await post('/feeds/nurse-position', { ...wellFormed(positions), patientId: 'P-1' });
    assert.equal(response.status, 422);
    const body = await response.json() as { error: string; forbidden: { field: string; refusal: string } };
    assert.equal(body.error, 'forbidden-field');
    assert.equal(body.forbidden.field, 'patientId');
    assert.match(body.forbidden.refusal, /may not carry a patient id/);
  });
  test('it does not matter how the sender spelled it', async () => {
    for (const spelling of ['patient_id', 'PATIENT-ID', 'Patient Id', 'patientRef', 'subjectId', 'memberId']) {
      const response = await post('/feeds/nurse-position', { ...wellFormed(positions), [spelling]: 'P-1' });
      const body = await response.json() as { error: string; forbidden: { field: string } };
      assert.equal(body.error, 'forbidden-field', spelling);
      assert.equal(body.forbidden.field, 'patientId', spelling);
    }
  });
  test('nesting it inside a wrapper or a list does not get it past the door', async () => {
    for (const payload of [
      { ...wellFormed(positions), meta: { source: { patient_id: 'P-1' } } },
      { ...wellFormed(positions), extra: [{ ok: 1 }, { patientId: 'P-1' }] }
    ]) {
      const response = await post('/feeds/nurse-position', payload);
      const body = await response.json() as { error: string; forbidden: { field: string } };
      assert.equal(body.error, 'forbidden-field');
      assert.equal(body.forbidden.field, 'patientId');
    }
  });
  test('a forbidden field is refused before a missing one is noticed', async () => {
    /* Both are wrong. A payload carrying a patient id is a more interesting fact than a payload with
       a missing timestamp, and if the shape were checked first the interesting one would be lost
       behind it. */
    const response = await post('/feeds/nurse-position', { patientId: 'P-1' });
    const body = await response.json() as { error: string; missing?: string[] };
    assert.equal(body.error, 'forbidden-field');
    assert.equal(body.missing, undefined);
  });
  test('every feed refuses every one of its own forbidden fields', async () => {
    for (const feed of FEEDS) {
      for (const never of feed.neverAccepts) {
        const response = await post(`/feeds/${feed.id}`, { ...wellFormed(feed), [never.field]: 'x' });
        const body = await response.json() as { error: string; forbidden: { field: string } };
        assert.equal(body.error, 'forbidden-field', `${feed.id}/${never.field}`);
        assert.equal(body.forbidden.field, never.field, `${feed.id}/${never.field}`);
      }
    }
  });
  test('no forbidden spelling collides with a field the same feed accepts', () => {
    /* The tripwire and the schema share a namespace. A forbidden spelling that matched an accepted
       field would refuse every honest payload, and it would do it with a sentence about a patient
       id, which is the most confusing possible way to be wrong. */
    for (const feed of FEEDS) {
      const accepted = new Set(feed.accepts.map(field => canonical(field.field)));
      for (const never of feed.neverAccepts) {
        for (const spelling of [never.field, ...never.also]) {
          assert.ok(!accepted.has(canonical(spelling)), `${feed.id}: "${spelling}" is both refused and accepted`);
        }
      }
    }
  });
});

describe('nothing a stranger typed is written down', () => {
  test('an undeclared field is counted, never named, and never echoed', async () => {
    /* The sharpest rule in the module. A key in a JSON object is a string somebody else chose, and a
       refusal that copied it back would be a service reflecting whatever a vendor typed — into a
       response, and from there into whatever logs the response. */
    const smuggled = 'BP 180 over 110 mmHg, patient is Lerato Molefe';
    const response = await post('/feeds/nurse-position', { ...wellFormed(positions), [smuggled]: 1, alsoNotAsked: 2 });
    const text = await response.text();
    assert.equal(response.status, 422);
    assert.equal(JSON.parse(text).error, 'wrong-shape');
    assert.equal(JSON.parse(text).undeclaredFields, 2);
    assert.ok(!text.includes('180'), 'the key a stranger chose came back in the response');
    assert.ok(!text.includes('Lerato'), 'the key a stranger chose came back in the response');
  });
  test('and it does not reach the audit chain either', () => {
    /* Every column an entry can hold *words* in. The two hash columns are deliberately left out:
       they are sixty-four hex characters, and searching them for a digit finds one every time. */
    const database = new DatabaseSync(config.databasePath);
    const rows = database.prepare(
      'SELECT event, actor_id, actor_role, capability, purpose, record_type, record_id, subject_id, field, reason, blocked_by FROM protected_access_log'
    ).all() as unknown as Record<string, unknown>[];
    database.close();
    const written = JSON.stringify(rows);
    assert.ok(written.includes('feed.refused'), 'the refusals were not recorded at all');
    for (const smuggled of ['180', 'mmHg', 'Lerato', 'P-1', 'alsoNotAsked']) {
      assert.ok(!written.includes(smuggled), `"${smuggled}" — something a stranger typed reached the chain`);
    }
  });
  test('a refused forbidden field is recorded by the contract name and marked refused', () => {
    const database = new DatabaseSync(config.databasePath);
    const rows = database.prepare(
      "SELECT field, allowed, record_id FROM protected_access_log WHERE event = 'feed.refused' AND field IS NOT NULL"
    ).all() as unknown as { field: string; allowed: number; record_id: string }[];
    database.close();
    assert.ok(rows.length > 0);
    assert.ok(rows.some(row => row.field === 'patientId' && row.record_id === 'nurse-position'));
    for (const row of rows) assert.equal(row.allowed, 0, 'a feed refusal was recorded as allowed');
  });
});

describe('the shape is closed', () => {
  test('a missing required field is named — and the name is ours', async () => {
    const response = await post('/feeds/nurse-position', { partyId: 'N-205' });
    const body = await response.json() as { error: string; missing: string[] };
    assert.equal(body.error, 'wrong-shape');
    assert.deepEqual(body.missing.sort(), ['accuracyMetres', 'lat', 'lng', 'reportedAt']);
  });
  test('accuracy is required, because a coordinate without one is a false precision', async () => {
    const { accuracyMetres, ...withoutAccuracy } = wellFormed(positions) as Record<string, unknown>;
    void accuracyMetres;
    const response = await post('/feeds/nurse-position', withoutAccuracy);
    const body = await response.json() as { missing: string[] };
    assert.deepEqual(body.missing, ['accuracyMetres']);
  });
  test('a wrong type is named and its value is not', async () => {
    const response = await post('/feeds/nurse-position', { ...wellFormed(positions), lat: '-26.150' });
    const text = await response.text();
    assert.deepEqual(JSON.parse(text).wrongType, ['lat']);
    assert.ok(!text.includes('-26.150'), 'the value came back with the refusal');
  });
  test('an instant with no offset is not an instant', async () => {
    /* One country, one offset, which is exactly the circumstance in which a missing one is never
       noticed until a supplier runs on UTC. */
    const response = await post('/feeds/nurse-position', { ...wellFormed(positions), reportedAt: '2026-09-10T14:32:07' });
    const body = await response.json() as { wrongType: string[] };
    assert.deepEqual(body.wrongType, ['reportedAt']);
    const good = await post('/feeds/nurse-position', { ...wellFormed(positions), reportedAt: '2026-09-10T12:32:07Z' });
    assert.equal(good.status, 503);
  });
  test('a payload that is not an object at all is refused for its shape', async () => {
    const response = await fetch(`${base}/feeds/nurse-position`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '["nurse", -26.1]'
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json() as { error: string }).error, 'wrong-shape');
  });
});

describe('what a vendor is handed', () => {
  test('GET /feeds describes all eleven and admits it holds nothing', async () => {
    const body = await (await get('/feeds')).json() as { holds: string; feeds: { id: string; connected: boolean }[]; noSeam: unknown[] };
    assert.match(body.holds, /refuses every payload/);
    assert.equal(body.feeds.length, FEEDS.length);
    for (const feed of body.feeds) assert.equal(feed.connected, false, feed.id);
    assert.equal(body.noSeam.length, 2);
  });
  test('a feed describes what would have to arrive and what never may', async () => {
    const body = await (await get('/feeds/nurse-position')).json() as {
      accepts: { field: string }[]; neverAccepts: { field: string; also?: string[] }[]; beforeSwitchOn: { met: boolean }[];
    };
    assert.ok(body.accepts.some(field => field.field === 'accuracyMetres'));
    assert.ok(body.neverAccepts.some(field => field.field === 'patientId'));
    for (const condition of body.beforeSwitchOn) assert.equal(condition.met, false);
  });
  test('the aliases are not published, because a list of the spellings that are caught is a list of the ones that are not', async () => {
    const text = await (await get('/feeds/nurse-position')).text();
    assert.ok(!text.includes('breadcrumbs'), 'the alias list was published');
  });
});

describe('the door is limited like every other write', () => {
  test('a retry loop against a route that will never accept anything is still refused for volume', async () => {
    /* Nothing here is special-cased: the feeds are POSTs and they are not in SELF_LIMITED, so the
       caller limit in handle() already holds them by address. The assertion is that nobody has
       exempted them for being harmless — a route nobody thought about is exactly the one that is
       still unlimited a year later. */
    let sawLimit = false;
    for (let i = 0; i <= limits.writesPerCallerPerWindow + 1; i += 1) {
      const response = await post('/feeds/message-delivery', {});
      if (response.status === 429) { sawLimit = true; await response.text(); break; }
      await response.text();
    }
    assert.ok(sawLimit, 'the feed routes are not held by the caller limit');
  });
});
