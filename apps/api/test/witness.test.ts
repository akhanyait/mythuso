/**
 * The one question a hash chain cannot answer about itself.
 *
 * audit.ts has said since it was written that an empty log verifies, because there is nothing left
 * to contradict it, and that `head()` exists so the head can be copied somewhere the database cannot
 * reach. Nothing took one back. These tests are the taking back: a statement made when the chain was
 * four entries long, and the chain afterwards, truncated in each of the ways somebody with the
 * database file and no key could truncate it.
 *
 * They do not test publication. Nothing publishes anything; that needs a second organisation and it
 * is still absent, which is written into the module and into the answer the route gives.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { HashChainAudit, sqliteAuditStore } from '../src/protection/audit.ts';
import { EMPTY_HEAD, parseWitness, renderWitness, stillExtends, witnessStatement } from '../src/protection/index.ts';

const key = randomBytes(32);
const LOG = 'protected_access_log';
const entry = (n: number) => ({
  event: 'access.allowed', actorId: `nurse-${n}`, actorRole: 'nurse', capability: 'view-clinical-record',
  purpose: 'treatment', recordType: 'consultation', recordId: `C-${n}`, subjectId: 'patient-1', allowed: true
});

/** A chain, and the two things a witness check needs of it: its state, and one hash by position. */
function chained(entries: number) {
  const db = new DatabaseSync(':memory:');
  const store = sqliteAuditStore(db);
  const chain = new HashChainAudit(store, key, () => Date.UTC(2026, 8, 10, 9, 0, 0));
  for (let i = 1; i <= entries; i += 1) chain.append(entry(i));
  const state = () => {
    const verified = chain.verify();
    return { intact: verified.intact, length: verified.length, head: verified.intact ? verified.head : chain.head() };
  };
  const hashAt = (position: number) => store.all()[position - 1]?.hash ?? null;
  return { db, chain, store, state, hashAt };
}

describe('a statement somebody could actually hold', () => {
  test('it renders as something a person can read down a telephone, and parses back', () => {
    const { state } = chained(4);
    const witness = witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z');
    const text = renderWitness(witness);
    assert.match(text, /entries: 4/);
    assert.match(text, /^head: [0-9a-f]{64}$/m);
    assert.deepEqual(parseWitness(text), witness);
  });
  test('it says on its face what it is worth', () => {
    /* A statement that does not say what it is worth will be filed by somebody who thinks it is
       worth more. This is the whole of the honesty in this file and it is checked rather than
       trusted, because it is a sentence and sentences get tidied. */
    const { state } = chained(2);
    const text = renderWitness(witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z'));
    assert.match(text, /nothing if MyThuso holds the only copy/);
  });
  test('anything that is not one is refused rather than half-read', () => {
    for (const text of ['', 'head: nope', 'MyThuso chain witness — x\nentries: 4\nat: now', `MyThuso chain witness — x\nentries: -1\nhead: ${'a'.repeat(64)}\nat: now`]) {
      assert.equal(parseWitness(text), null, JSON.stringify(text.slice(0, 30)));
    }
  });
  test('a head that is not a head is refused at the point of making the statement', () => {
    assert.throws(() => witnessStatement(LOG, { length: 1, head: 'not-a-hash' }, 'now'), /sixty-four hex characters/);
  });
});

describe('what a held statement catches that verify() cannot', () => {
  test('a chain that has simply grown still holds, and says by how much', () => {
    const { chain, state, hashAt } = chained(4);
    const witness = witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z');
    chain.append(entry(5));
    chain.append(entry(6));
    assert.deepEqual(stillExtends(state(), hashAt, witness), { holds: true, grownBy: 2 });
  });
  test('truncated to nothing — the case verify() calls intact', () => {
    /* The failure this whole file exists for. An empty log verifies, because there is nothing left
       to contradict it, and a health check that only asks verify() reports a clean bill on a
       database somebody has emptied. */
    const { db, state, hashAt } = chained(4);
    const witness = witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z');
    db.prepare(`DELETE FROM ${LOG}`).run();
    const now = state();
    assert.equal(now.intact, true, 'the premise of this test has changed: an empty chain no longer verifies');
    assert.equal(now.head, EMPTY_HEAD);
    const verdict = stillExtends(now, hashAt, witness);
    assert.equal(verdict.holds, false);
    assert.match(verdict.because, /Entries that somebody else has a record of have gone/);
  });
  test('truncated to a prefix and grown again with real entries', () => {
    /* The subtle one. The chain is intact, it is longer than it was witnessed at, and it is not the
       same chain: entries two, three and four were replaced. Only the hash at the witnessed position
       shows it. */
    const { db, chain, state, hashAt } = chained(4);
    const witness = witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z');
    db.prepare(`DELETE FROM ${LOG} WHERE seq > 1`).run();
    for (let i = 20; i < 26; i += 1) chain.append(entry(i));
    const now = state();
    assert.equal(now.intact, true, 'the rebuilt chain does not verify, so this is not the case under test');
    assert.ok(now.length > witness.length);
    const verdict = stillExtends(now, hashAt, witness);
    assert.equal(verdict.holds, false);
    assert.match(verdict.because, /a different chain wearing the same length/);
  });
  test('edited anywhere at all — refused before the length is even looked at', () => {
    const { db, state, hashAt } = chained(4);
    const witness = witnessStatement(LOG, state(), '2026-09-10T09:00:00.000Z');
    db.prepare(`UPDATE ${LOG} SET reason = ? WHERE seq = 2`).run('routine review');
    const verdict = stillExtends(state(), hashAt, witness);
    assert.equal(verdict.holds, false);
    assert.match(verdict.because, /does not verify against itself/);
  });
  test('a statement made over an empty chain vouches for nothing, and is not blessed', () => {
    /* Answering "yes, still extends" to a witness over an empty log would make the easiest statement
       to obtain the one that proves the most, which is the wrong way round. */
    const { state, hashAt } = chained(3);
    const empty = { log: LOG, length: 0, head: EMPTY_HEAD, at: '2026-09-10T09:00:00.000Z' };
    const verdict = stillExtends(state(), hashAt, empty);
    assert.equal(verdict.holds, false);
    assert.match(verdict.because, /vouches for nothing/);
  });
});

describe('what it is not', () => {
  test('the module does not publish, and holds no recipient to publish to', async () => {
    /* Read out of the source rather than asserted in prose, because the failure would be somebody
       adding a `publishTo` and the file continuing to say it publishes nothing. */
    const source = await (await import('node:fs/promises')).readFile(new URL('../src/protection/witness.ts', import.meta.url), 'utf8');
    /* Code-shaped tokens only. The prose above says the words "publish" and "upload" a good many
       times, saying that neither happens, and a check that tripped on those would be a check that
       fires on the sentence promising it does not. */
    for (const forbidden of ['fetch(', 'http.request', 'publishTo', 'upload(', 'node:http', 'node:net']) {
      assert.ok(!source.includes(forbidden), `witness.ts has grown a "${forbidden}" — it does not publish, and the thing that is absent is the recipient`);
    }
    assert.match(source, /Nothing in this file publishes anything/);
  });
});
