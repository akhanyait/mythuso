import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AuditEntryRefused, GENESIS, HashChainAudit, memoryAuditStore, sqliteAuditStore, type AuditRow } from '../src/protection/audit.ts';

const key = randomBytes(32);
const entry = (n: number) => ({
 event: 'access.allowed', actorId: `nurse-${n}`, actorRole: 'nurse', capability: 'view-clinical-record',
 purpose: 'treatment', recordType: 'consultation', recordId: `C-${n}`, subjectId: 'patient-1', allowed: true
});

/** The database is opened in the test as well as in the store, because the tampering under test is
    somebody with the file doing exactly that. */
function chained(entries = 4) {
 const db = new DatabaseSync(':memory:');
 const chain = new HashChainAudit(sqliteAuditStore(db), key, () => Date.UTC(2026, 8, 6, 9, 0, 0));
 const links = Array.from({ length: entries }, (_, i) => chain.append(entry(i + 1)));
 return { db, chain, links };
}

describe('the chain', () => {
 test('an empty log verifies, and says so honestly', () => {
  const chain = new HashChainAudit(memoryAuditStore(), key);
  assert.deepEqual(chain.verify(), { intact: true, length: 0, head: GENESIS });
  assert.equal(chain.head(), GENESIS);
 });
 test('every entry carries the one before it', () => {
  const { chain, links } = chained();
  assert.equal(links[0]!.previousHash, GENESIS);
  for (let i = 1; i < links.length; i += 1) assert.equal(links[i]!.previousHash, links[i - 1]!.hash);
  const verified = chain.verify();
  assert.ok(verified.intact);
  assert.equal(verified.length, 4);
  assert.equal(verified.head, links[3]!.hash);
  assert.equal(chain.head(), links[3]!.hash);
 });
 test('two identical entries do not produce the same hash', () => {
  /* If they did, two rows could be swapped without breaking anything, and a repeated read would be
     indistinguishable from one read written down twice. */
  const chain = new HashChainAudit(memoryAuditStore(), key, () => Date.UTC(2026, 8, 6));
  const first = chain.append(entry(1));
  const second = chain.append(entry(1));
  assert.notEqual(first.hash, second.hash);
 });
 test('the same log under a different key does not verify', () => {
  const store = memoryAuditStore();
  new HashChainAudit(store, key).append(entry(1));
  assert.equal(new HashChainAudit(store, randomBytes(32)).verify().intact, false);
 });
 test('a key too short to be a key is refused rather than used', () => {
  assert.throws(() => new HashChainAudit(memoryAuditStore(), randomBytes(8)), /at least 32 bytes/);
 });
});

describe('tampering, by somebody holding the database file', () => {
 test('an edited entry is caught, and named', () => {
  const { db, chain, links } = chained();
  db.prepare('UPDATE protected_access_log SET reason = ? WHERE seq = 2').run('routine review');
  const verified = chain.verify();
  assert.equal(verified.intact, false);
  assert.ok(!verified.intact && verified.brokenAt === links[1]!.id);
 });
 test('a deleted entry is caught at the entry that followed it', () => {
  const { db, chain, links } = chained();
  db.prepare('DELETE FROM protected_access_log WHERE seq = 2').run();
  const verified = chain.verify();
  assert.ok(!verified.intact);
  assert.equal(verified.brokenAt, links[2]!.id, 'the third entry no longer follows the first');
  assert.equal(verified.length, 3);
 });
 test('a re-ordered entry is caught', () => {
  const { db, chain, links } = chained();
  db.prepare('UPDATE protected_access_log SET seq = 99 WHERE seq = 2').run();
  db.prepare('UPDATE protected_access_log SET seq = 2 WHERE seq = 3').run();
  db.prepare('UPDATE protected_access_log SET seq = 3 WHERE seq = 99').run();
  const verified = chain.verify();
  assert.ok(!verified.intact);
  assert.equal(verified.brokenAt, links[2]!.id);
  assert.equal(verified.length, 4, 'nothing was removed — only the order was changed');
 });
 test('an entry appended by somebody without the key is caught', () => {
  /* The whole reason for an HMAC rather than a plain hash. An attacker who can write rows can
     compute SHA-256 all day; they cannot compute this one without the key, which lives in the
     service environment rather than in the file they are holding. */
  const { db, chain } = chained();
  const forged = randomUUID();
  const body = JSON.stringify({ id: forged, previousHash: chain.head() });
  db.prepare(`INSERT INTO protected_access_log (id, at, event, actor_id, allowed, previous_hash, hash, seq)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
   .run(forged, new Date(Date.UTC(2026, 8, 6, 10)).toISOString(), 'access.allowed', 'nurse-1', 1,
    chain.head(), createHash('sha256').update(body).digest('hex'), 5);
  const verified = chain.verify();
  assert.ok(!verified.intact);
  assert.equal(verified.brokenAt, forged);
 });
 test('the chain cannot say anything about a log emptied completely', () => {
  /* Said out loud rather than left for somebody to discover. head() exists so the head can be
     copied somewhere the database cannot reach; without that anchor, nothing here notices. */
  const { db, chain } = chained();
  db.prepare('DELETE FROM protected_access_log').run();
  assert.deepEqual(chain.verify(), { intact: true, length: 0, head: GENESIS });
 });
});

describe('what an entry may hold', () => {
 test('the value that was read is refused, by name', () => {
  const chain = new HashChainAudit(memoryAuditStore(), key);
  assert.throws(() => chain.append({ ...entry(1), value: 'HIV positive' }), AuditEntryRefused);
  assert.throws(() => chain.append({ ...entry(1), plaintext: 'B negative' }), /never the value that was read/);
 });
 test('the refusal does not repeat what it refused', () => {
  const chain = new HashChainAudit(memoryAuditStore(), key);
  try {
   chain.append({ ...entry(1), diagnosis: 'a thing nobody should copy' });
   assert.fail('the entry should have been refused');
  } catch (error) {
   assert.ok(error instanceof AuditEntryRefused);
   assert.ok(error.message.includes('diagnosis'));
   assert.ok(!error.message.includes('nobody should copy'), 'a refusal that quotes the value is another copy of it');
  }
 });
 test('a field of the wrong shape is refused rather than coerced', () => {
  const chain = new HashChainAudit(memoryAuditStore(), key);
  assert.throws(() => chain.append({ allowed: 'yes' }), AuditEntryRefused);
  assert.throws(() => chain.append({ blockedBy: 'capability' }), AuditEntryRefused);
  assert.throws(() => chain.append({ reason: 42 }), AuditEntryRefused);
 });
});

describe('the SQLite store', () => {
 test('what goes in comes back out, in order, unchanged', () => {
  const db = new DatabaseSync(':memory:');
  const store = sqliteAuditStore(db);
  const rows: AuditRow[] = [
   { ...entry(1), id: 'a', at: '2026-09-06T09:00:00.000Z', previousHash: GENESIS, hash: 'h1', blockedBy: undefined },
   { event: 'access.refused', actorId: 'nurse-2', allowed: false, broke: true, reason: 'no', blockedBy: ['capability', 'view-billing'], id: 'b', at: '2026-09-06T09:01:00.000Z', previousHash: 'h1', hash: 'h2' }
  ];
  for (const row of rows) store.append(row);
  const back = store.all();
  assert.equal(back.length, 2);
  assert.equal(back[0]!.allowed, true);
  assert.equal(back[0]!.broke, undefined, 'an absent field stays absent rather than becoming false');
  assert.equal(back[1]!.allowed, false);
  assert.equal(back[1]!.broke, true);
  assert.deepEqual(back[1]!.blockedBy, ['capability', 'view-billing']);
  assert.equal(store.last()!.id, 'b');
 });
 test('it survives being reopened, because a chain that only lives in memory proves nothing', () => {
  const db = new DatabaseSync(':memory:');
  const chain = new HashChainAudit(sqliteAuditStore(db), key);
  chain.append(entry(1));
  chain.append(entry(2));
  const reopened = new HashChainAudit(sqliteAuditStore(db), key);
  assert.ok(reopened.verify().intact);
  assert.equal(reopened.head(), chain.head());
 });
});
