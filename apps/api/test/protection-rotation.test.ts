import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createProtectionModule, mintBootstrapAuthorisation } from '../src/protection/index.ts';
import { SEALED_COLUMNS, VettingVault, openVettingStore, roleChecks, vettingSource, type Actor } from '../src/vetting/index.ts';

const START = Date.UTC(2026, 8, 7, 8, 0, 0);
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
const KEY_1 = `1:${randomBytes(32).toString('hex')}`;
const KEY_2 = `2:${randomBytes(32).toString('hex')}`;
const KEY_3 = `3:${randomBytes(32).toString('hex')}`;

const themselves = (id: string, role: string): Actor => ({ id, role, purpose: 'subject-access' });
const reviewer = (id: string): Actor => ({ id, role: 'admin', purpose: 'vetting' });

/**
 * One database, opened again under a different key ring.
 *
 * That is the whole shape of a rotation: nothing about the data changes, the environment does. So
 * the fixture keeps the DatabaseSync and rebuilds the module around it, exactly as `systemctl
 * restart` would after step 4 of the procedure.
 */
function wire(db: DatabaseSync, keys: string, current?: string) {
 const store = openVettingStore(db);
 const config = {
  environment: 'development' as const, protectionKeys: keys,
  ...(current ? { protectionKeyCurrent: current } : {}), protectionIndexVersion: '1'
 };
 const protection = createProtectionModule(config, db, { vetting: vettingSource(store), releases: { find: () => null }, sealedColumns: SEALED_COLUMNS, now: () => START })!;
 return {
  store, protection, config,
  vault: new VettingVault({ gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store, now: () => START }),
  /* The console act, minted against this ring. A rotation fixture needs real sealed documents, and
     the only way to a real sealed document is through a bootstrap that was properly authorised. */
  authorise: () => mintBootstrapAuthorisation(config, {
   parties: [{ id: 'admin-1', roleId: 'admin' }, { id: 'admin-2', roleId: 'admin' }],
   decidedBy: 'founder', secondedBy: 'director'
  }, () => START).token
 };
}

/** A pair of reviewers and a nurse, so there are real sealed documents in a real column. */
function seeded(db: DatabaseSync, documents = 3) {
 const wired = wire(db, KEY_1);
 const seeding = wired.vault.openBootstrap(wired.authorise());
 seeding.seed({ id: 'admin-1', roleId: 'admin' });
 seeding.seed({ id: 'admin-2', roleId: 'admin' });
 seeding.close();
 for (const id of ['admin-1', 'admin-2']) {
  for (const check of roleChecks('admin')) {
   wired.vault.submit({ actor: themselves(id, 'admin'), partyId: id, checkId: check.id, filename: `${check.id}.pdf`, document: Buffer.from(`document for ${id}/${check.id}`), issuedOn: iso(START) });
  }
 }
 const deciding = wired.vault.openBootstrap(wired.authorise());
 for (const id of ['admin-1', 'admin-2']) {
  for (const check of roleChecks('admin')) deciding.decide(id, check.id, { issuedOn: iso(START) });
 }
 deciding.close();
 wired.vault.enrol(reviewer('admin-1'), { id: 'nurse-1', roleId: 'nurse' });
 for (const check of roleChecks('nurse').slice(0, documents)) {
  wired.vault.submit({ actor: themselves('nurse-1', 'nurse'), partyId: 'nurse-1', checkId: check.id, filename: `${check.id}.pdf`, document: Buffer.from(`nurse document for ${check.id}`) });
 }
 return wired;
}

const versionsOnDisk = (db: DatabaseSync) =>
 (db.prepare('SELECT key_version AS v, COUNT(*) AS n FROM vetting_evidence_versions GROUP BY key_version ORDER BY key_version').all() as { v: number; n: number }[])
  .map(row => [Number(row.v), Number(row.n)] as const);

describe('rotation, as an operation', () => {
 test('counts what is still on an old key, which is what step 6 asks for', () => {
  const db = new DatabaseSync(':memory:');
  seeded(db);
  const total = versionsOnDisk(db).reduce((sum, [, n]) => sum + n, 0);

  /* Step 3: the new key is added beside the old one, and current is pinned back to 1. Nothing
     changes, which is the point of that step. */
  const held = wire(db, `${KEY_1},${KEY_2}`, '1');
  assert.equal(held.protection.rotation.standing().outstanding, 0, 'adding a key must not make work appear');

  /* Step 4: make it current. Now everything on disk is behind. */
  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  const standing = rotating.protection.rotation.standing();
  assert.equal(standing.current, 2);
  assert.deepEqual(standing.configured, [1, 2]);
  assert.equal(standing.outstanding, total);
  assert.deepEqual(standing.columns[0]!.byVersion, [{ version: 1, rows: total }]);
  assert.equal(standing.columns[0]!.disagreeing, 0);
 });

 test('a dry run writes nothing and still opens every envelope it would rewrite', () => {
  const db = new DatabaseSync(':memory:');
  seeded(db);
  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  const before = versionsOnDisk(db);
  const report = rotating.protection.rotation.run({ commit: false });
  assert.equal(report.commit, false);
  assert.ok(report.rewrapped[0]!.rows > 0, 'a dry run reports what it would do');
  assert.deepEqual(versionsOnDisk(db), before, 'and does none of it');
  assert.equal(report.after.outstanding, report.before.outstanding);
 });

 test('re-wraps everything, and running it again is a no-op rather than an error', () => {
  const db = new DatabaseSync(':memory:');
  seeded(db);
  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  const total = rotating.protection.rotation.standing().outstanding;

  const first = rotating.protection.rotation.run({ commit: true, batch: 2 });
  assert.equal(first.rewrapped[0]!.rows, total);
  assert.equal(first.after.outstanding, 0);
  assert.deepEqual(versionsOnDisk(db), [[2, total]]);

  const again = rotating.protection.rotation.run({ commit: true });
  assert.deepEqual(again.rewrapped, [], 'idempotent: there is nothing left that is not current');
  assert.equal(again.after.outstanding, 0);
  assert.deepEqual(versionsOnDisk(db), [[2, total]]);
 });

 test('the documents still open afterwards, which is the only thing that actually matters', () => {
  const db = new DatabaseSync(':memory:');
  const seed = seeded(db);
  const evidence = seed.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const before = seed.vault.open(reviewer('admin-1'), evidence.id, 1);
  assert.ok(before.ok, before.ok ? '' : before.reason);

  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  rotating.protection.rotation.run({ commit: true });
  const after = rotating.vault.open(reviewer('admin-1'), evidence.id, 1);
  assert.ok(after.ok, after.ok ? '' : after.reason);
  assert.equal(after.document.toString('utf8'), before.document.toString('utf8'));
  /* The ciphertext was never touched, so the digest recorded at submission still matches — a
     rotation that re-encrypted would have to be trusted about that; this one does not. */
  assert.equal(after.version.contentHash, before.version.contentHash);
 });

 test('a half-finished rotation leaves a working database of mixed versions', () => {
  const db = new DatabaseSync(':memory:');
  const seed = seeded(db);
  const first = seed.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const second = seed.store.findEvidenceFor('nurse-1', 'identity')!;

  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  const total = rotating.protection.rotation.standing().outstanding;
  /* Stopped after two values, exactly as a killed process would stop. */
  const partial = rotating.protection.rotation.run({ commit: true, batch: 1, limit: 2 });
  assert.equal(partial.more, true, 'it says it did not finish');
  assert.equal(partial.after.outstanding, total - 2);
  const mixed = versionsOnDisk(db);
  assert.equal(mixed.length, 2, 'some on the old key and some on the new one');

  /* And the database works. Both keys are in the ring, so both open, and nothing about which
     version a value is on is visible to anything above the crypto. */
  for (const evidence of [first, second]) {
   const opened = rotating.vault.open(reviewer('admin-1'), evidence.id, 1);
   assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  }
  /* A write during the half-finished state goes to the new version, which is what makes stopping
     safe rather than merely survivable. */
  rotating.vault.submit({ actor: themselves('nurse-1', 'nurse'), partyId: 'nurse-1', checkId: 'indemnity', filename: 'cover.pdf', document: Buffer.from('schedule of cover') });
  const indemnity = rotating.store.findEvidenceFor('nurse-1', 'indemnity')!;
  assert.equal(rotating.store.versions(indemnity.id)[0]!.keyVersion, 2);

  /* Resumed, with no cursor and nothing remembered, and it picks up exactly what was missed. */
  const finished = rotating.protection.rotation.run({ commit: true });
  assert.equal(finished.more, false);
  assert.equal(finished.after.outstanding, 0);
  assert.deepEqual(versionsOnDisk(db).map(([version]) => version), [2]);
 });

 test('two rotations over three versions leave nothing behind', () => {
  const db = new DatabaseSync(':memory:');
  seeded(db);
  wire(db, `${KEY_1},${KEY_2}`, '2').protection.rotation.run({ commit: true });
  const third = wire(db, `${KEY_1},${KEY_2},${KEY_3}`, '3');
  assert.deepEqual(third.protection.rotation.standing().configured, [1, 2, 3]);
  third.protection.rotation.run({ commit: true });
  assert.deepEqual(versionsOnDisk(db).map(([version]) => version), [3]);
  const evidence = third.store.findEvidenceFor('nurse-1', 'identity')!;
  assert.ok(third.vault.open(reviewer('admin-1'), evidence.id, 1).ok);
 });

 test('the key_version column is repaired from the bytes rather than trusted', () => {
  /* Denormalised data drifts. The rotation writes back what the blob actually declares, so a column
     somebody set wrongly is corrected the next time the value is touched, and standing() names the
     disagreement in the meantime instead of averaging it away. */
  const db = new DatabaseSync(':memory:');
  seeded(db);
  db.prepare('UPDATE vetting_evidence_versions SET key_version = 7').run();
  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  const standing = rotating.protection.rotation.standing();
  assert.equal(standing.columns[0]!.disagreeing, standing.columns[0]!.total);
  rotating.protection.rotation.run({ commit: true });
  assert.deepEqual(versionsOnDisk(db).map(([version]) => version), [2]);
  assert.equal(rotating.protection.rotation.standing().columns[0]!.disagreeing, 0);
 });

 test('a rotation does not break the audit chain, because the chain is never re-keyed', () => {
  /* Found by running the command rather than by reasoning about it. The audit key used to follow
     the current version, so step 4 of the procedure — one reversible line that is meant to change
     nothing — made every entry ever written fail to verify, and the health check that asks every
     five minutes would have reported a tampered log on the evening of a routine rotation.

     An entry can never be re-chained: rewriting the log under a new key recomputes every hash from
     the row you touched onwards, which is exactly what the chain exists to make impossible. So the
     audit key is pinned to the oldest version in the ring, old versions are kept for ever, and a
     rotation retires nothing. */
  const db = new DatabaseSync(':memory:');
  seeded(db);
  const before = wire(db, KEY_1).protection.audit.verify();
  assert.equal(before.intact, true);

  const rotating = wire(db, `${KEY_1},${KEY_2}`, '2');
  rotating.protection.rotation.run({ commit: true });
  const after = rotating.protection.audit.verify();
  assert.equal(after.intact, true, 'the chain still follows from its origin after the rotation');
  assert.equal(after.intact && after.length, before.intact && before.length);

  /* And a third version changes nothing about it either. */
  const third = wire(db, `${KEY_1},${KEY_2},${KEY_3}`, '3');
  third.protection.rotation.run({ commit: true });
  assert.equal(third.protection.audit.verify().intact, true);
 });

 test('a table or column name that is not a plain identifier is refused before any SQL is built', () => {
  const db = new DatabaseSync(':memory:');
  openVettingStore(db);
  assert.throws(() => createProtectionModule({ environment: 'development', protectionKeys: KEY_1 }, db, {
   vetting: { find: () => null }, releases: { find: () => null },
   sealedColumns: [{ label: 'x', table: 'vetting_evidence_versions; DROP TABLE vetting_parties', idColumn: 'id', blobColumn: 'document', versionColumn: 'key_version' }]
  }), /not a table or column name/);
 });

 test('with nothing registered there is nothing to rotate, and it says so rather than failing', () => {
  const db = new DatabaseSync(':memory:');
  const protection = createProtectionModule({ environment: 'development', protectionKeys: KEY_1 }, db, {
   vetting: { find: () => null }, releases: { find: () => null }
  })!;
  const report = protection.rotation.run({ commit: true });
  assert.deepEqual(report.rewrapped, []);
  assert.equal(report.after.outstanding, 0);
  assert.deepEqual(report.after.columns, []);
 });
});
