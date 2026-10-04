import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
/**
 * Storage lives behind this interface because the architecture calls for PostgreSQL, and swapping
 * to it should be one file rather than a rewrite. SQLite is what a first identity slice needs.
 */
/* The name is sealed at rest by sensitive.ts, so what comes back out of the file is bytes. A row
   written before that existed comes back as text, and both are opened by the same call. */
export type Person = { id: string; phone: string; name: Uint8Array | string | null; createdAt: number };
export type Challenge = {
  id: string; phone: string; codeHash: string; attempts: number;
  createdAt: number; expiresAt: number; consumedAt: number | null;
};
export type Session = {
  id: string; tokenHash: string; personId: string;
  createdAt: number; lastSeenAt: number; expiresAt: number; revokedAt: number | null;
};
export type SecondFactor = {
  personId: string; secret: Uint8Array | string; confirmedAt: number | null;
  lastUsedStep: number | null; createdAt: number;
};
export type RecoveryCode = { id: string; codeHash: string };
export type SecondFactorChallenge = {
  id: string; tokenHash: string; personId: string; attempts: number;
  createdAt: number; expiresAt: number; consumedAt: number | null;
};
export type ErasureRequest = {
  personId: string; requestedAt: number; eraseAfter: number;
  cancelledAt: number | null; completedAt: number | null;
};
/* What the retention sweep is allowed to touch. The audit table is deliberately not in this list
   and never will be: a log something can delete from is not a log. */
export type SweepableTable = 'challenges' | 'starts' | 'sessions' | 'second_factor_challenges' | 'write_attempts';
export type AuditEvent = {
  at: number; event: string; personId: string | null; phone: string | null;
  address: string | null; agentHash: string | null; detail: string | null;
};
/**
 * Fifteen minutes of this service's life, as five integers and nobody's name.
 *
 * `limits.writesPerCallerPerWindow` is sixty and docs/PRIVACY-AND-SECURITY.md says plainly that the
 * number is a proposal rather than a measurement: nobody has watched a real session, because there
 * are no real sessions. This is the material that would settle it, and it is deliberately the least
 * that would.
 *
 * `busiest` is the largest number of requests any one caller made inside this fixed fifteen-minute
 * bucket. The limiter counts a *sliding* fifteen minutes, so a caller working across a boundary is
 * split between two buckets and `busiest` is therefore a **lower bound** on what the limiter would
 * have seen. That is stated rather than corrected because the question it has to answer is "does an
 * honest caller come anywhere near sixty", and a lower bound answers that in the direction that
 * matters. `refused` is not an estimate: it is the exact count of requests the limiter turned away,
 * and it is the number that says whether sixty is too tight.
 *
 * There is no subject, no address and no route in here. A window in which one caller made
 * thirty-four requests says that somebody did; it does not say who, and there is nothing in the row
 * to join to anything that would. If refusals ever appear, the next thing worth adding is which
 * route they were on — safe to add, because a route is one of a closed set of strings out of this
 * repository — and it is deliberately not added before there is a refusal to explain.
 */
export type WriteWindow = { windowStart: number; callers: number; writes: number; busiest: number; refused: number };
export type Store = {
  database: DatabaseSync;
  findPersonByPhone(phone: string): Person | null;
  findPersonById(id: string): Person | null;
  createPerson(person: Person): void;
  setPersonName(id: string, name: Uint8Array | string | null): void;
  createChallenge(challenge: Challenge, address: string): void;
  findChallenge(id: string): Challenge | null;
  recordChallengeAttempt(id: string): void;
  consumeChallenge(id: string, at: number): void;
  countRecentStarts(field: 'phone' | 'address', value: string, since: number): number;
  createSession(session: Session): void;
  findSessionByTokenHash(tokenHash: string): Session | null;
  touchSession(id: string, at: number, expiresAt: number): void;
  revokeSession(id: string, at: number): void;
  revokeSessionsForPerson(personId: string, at: number): void;
  findSecondFactor(personId: string): SecondFactor | null;
  putSecondFactor(factor: SecondFactor): void;
  confirmSecondFactor(personId: string, at: number, step: number): void;
  recordSecondFactorStep(personId: string, step: number): void;
  deleteSecondFactor(personId: string): void;
  replaceRecoveryCodes(personId: string, hashes: string[]): void;
  unusedRecoveryCodes(personId: string): RecoveryCode[];
  countUnusedRecoveryCodes(personId: string): number;
  spendRecoveryCode(id: string, at: number): void;
  createSecondFactorChallenge(challenge: SecondFactorChallenge): void;
  findSecondFactorChallenge(tokenHash: string): SecondFactorChallenge | null;
  recordSecondFactorChallengeAttempt(id: string): void;
  consumeSecondFactorChallenge(id: string, at: number): void;
  requestErasure(request: ErasureRequest): void;
  findErasureRequest(personId: string): ErasureRequest | null;
  cancelErasureRequest(personId: string, at: number): void;
  erasuresDue(at: number): ErasureRequest[];
  openErasureRequests(): ErasureRequest[];
  erasePerson(personId: string, phone: string, tombstone: string, at: number): void;
  countSweepable(table: SweepableTable, before: number): number;
  sweep(table: SweepableTable, before: number): number;
  recordWrite(at: number, subject: string, route: string): void;
  countWrites(subject: string, since: number): number;
  recordWriteRefusal(at: number, windowMs: number): void;
  rollUpWriteWindows(before: number, windowMs: number): number;
  writeWindows(limit: number): WriteWindow[];
  appendAudit(event: AuditEvent): void;
  recentAudit(limit: number): AuditEvent[];
  auditForPerson(personId: string, phone: string, limit: number): AuditEvent[];
  countAuditEvents(event: string, personId: string, since: number): number;
  close(): void;
};
const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
CREATE INDEX IF NOT EXISTS challenges_phone ON challenges (phone, created_at);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, person_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_person ON sessions (person_id);
-- Append-only by contract: the service never issues an UPDATE or DELETE against this table.
CREATE TABLE IF NOT EXISTS audit (
  at INTEGER NOT NULL, event TEXT NOT NULL, person_id TEXT, phone TEXT,
  address TEXT, agent_hash TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at);
CREATE INDEX IF NOT EXISTS audit_person_at ON audit (person_id, at);
CREATE INDEX IF NOT EXISTS audit_phone_at ON audit (phone, at);
CREATE TABLE IF NOT EXISTS starts (
  at INTEGER NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS starts_at ON starts (at);
CREATE INDEX IF NOT EXISTS starts_phone_at ON starts (phone, at);
CREATE INDEX IF NOT EXISTS starts_address_at ON starts (address, at);
-- The shared secret an authenticator app holds, sealed by sensitive.ts. One per person: a second
-- factor somebody could quietly add a second of is not a second factor.
CREATE TABLE IF NOT EXISTS second_factors (
  person_id TEXT PRIMARY KEY, secret BLOB NOT NULL, confirmed_at INTEGER,
  last_used_step INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER);
CREATE INDEX IF NOT EXISTS recovery_codes_person ON recovery_codes (person_id);
-- A sign-in that has answered the one-time code and still owes an authenticator code. It is not a
-- session and never becomes one: the session is minted separately once the code is right.
CREATE TABLE IF NOT EXISTS second_factor_challenges (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, person_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  consumed_at INTEGER);
CREATE TABLE IF NOT EXISTS erasure_requests (
  person_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, erase_after INTEGER NOT NULL,
  cancelled_at INTEGER, completed_at INTEGER);
-- One row per write this service accepted, for the caller limit in server.ts. Deliberately the same
-- shape as the starts table, which has rate-limited the sign-in door since this service was
-- written: an at, a subject and what was asked for. It is spent material and the sweep clears it,
-- because a limiter that accumulated for ever would be the one table in here that grew with
-- traffic rather than with people. The subject is an account id where a session resolved and the
-- caller's address where it did not, so a limit cannot be escaped by signing out.
CREATE TABLE IF NOT EXISTS write_attempts (
  at INTEGER NOT NULL, subject TEXT NOT NULL, route TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS write_attempts_subject ON write_attempts (subject, at);
-- Fifteen minutes of the service's life, with nobody in it. See WriteWindow above for what each
-- number is and what it is a lower bound on. This is the one table here that survives an erasure
-- untouched, and it survives it because there is nothing of anybody's in it to touch: five integers
-- per window, no subject, no address, no route. It exists so that "sixty writes per caller per
-- fifteen minutes" can stop being a proposal, which needs a real caller and a few weeks rather than
-- another argument.
CREATE TABLE IF NOT EXISTS write_windows (
  window_start INTEGER PRIMARY KEY, callers INTEGER NOT NULL DEFAULT 0, writes INTEGER NOT NULL DEFAULT 0,
  busiest INTEGER NOT NULL DEFAULT 0, refused INTEGER NOT NULL DEFAULT 0);
`;
/* The sweep's reach, written once so nothing can be handed a table name from a request. Each is
   spent material: a code that has been used or has expired, an address that asked for one outside
   the rate window, a session that has ended. */
const SWEEPS: Record<SweepableTable, string> = {
  challenges: 'FROM challenges WHERE (consumed_at IS NOT NULL OR expires_at < ?)',
  starts: 'FROM starts WHERE at < ?',
  sessions: 'FROM sessions WHERE (revoked_at IS NOT NULL OR expires_at < ?)',
  second_factor_challenges: 'FROM second_factor_challenges WHERE (consumed_at IS NOT NULL OR expires_at < ?)',
  write_attempts: 'FROM write_attempts WHERE at < ?'
};
export function openStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const one = <T>(row: unknown): T | null => (row ?? null) as T | null;
  return {
    /* The protection module keeps its own append-only chain in this database and creates its own
       table. Handing over the handle rather than proxying every statement keeps that module honest:
       it owns its schema, and this store never learns how to write to it. */
    database: db,
    findPersonByPhone(phone) {
      const row = db.prepare('SELECT id, phone, name, created_at AS createdAt FROM people WHERE phone = ?').get(phone);
      return one<Person>(row);
    },
    findPersonById(id) {
      const row = db.prepare('SELECT id, phone, name, created_at AS createdAt FROM people WHERE id = ?').get(id);
      return one<Person>(row);
    },
    createPerson(p) {
      db.prepare('INSERT INTO people (id, phone, name, created_at) VALUES (?, ?, ?, ?)').run(p.id, p.phone, p.name, p.createdAt);
    },
    setPersonName(id, name) { db.prepare('UPDATE people SET name = ? WHERE id = ?').run(name, id); },
    createChallenge(c, address) {
      db.prepare('INSERT INTO challenges (id, phone, code_hash, attempts, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(c.id, c.phone, c.codeHash, c.attempts, c.createdAt, c.expiresAt);
      db.prepare('INSERT INTO starts (at, phone, address) VALUES (?, ?, ?)').run(c.createdAt, c.phone, address);
    },
    findChallenge(id) {
      const row = db.prepare('SELECT id, phone, code_hash AS codeHash, attempts, created_at AS createdAt, expires_at AS expiresAt, consumed_at AS consumedAt FROM challenges WHERE id = ?').get(id);
      return one<Challenge>(row);
    },
    recordChallengeAttempt(id) { db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(id); },
    consumeChallenge(id, at) { db.prepare('UPDATE challenges SET consumed_at = ? WHERE id = ?').run(at, id); },
    countRecentStarts(field, value, since) {
      const column = field === 'phone' ? 'phone' : 'address';
      const row = db.prepare(`SELECT COUNT(*) AS n FROM starts WHERE ${column} = ? AND at >= ?`).get(value, since) as { n: number };
      return row.n;
    },
    createSession(s) {
      db.prepare('INSERT INTO sessions (id, token_hash, person_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(s.id, s.tokenHash, s.personId, s.createdAt, s.lastSeenAt, s.expiresAt);
    },
    findSessionByTokenHash(tokenHash) {
      const row = db.prepare('SELECT id, token_hash AS tokenHash, person_id AS personId, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt, revoked_at AS revokedAt FROM sessions WHERE token_hash = ?').get(tokenHash);
      return one<Session>(row);
    },
    touchSession(id, at, expiresAt) { db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(at, expiresAt, id); },
    revokeSession(id, at) { db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id); },
    revokeSessionsForPerson(personId, at) { db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(at, personId); },
    findSecondFactor(personId) {
      const row = db.prepare('SELECT person_id AS personId, secret, confirmed_at AS confirmedAt, last_used_step AS lastUsedStep, created_at AS createdAt FROM second_factors WHERE person_id = ?').get(personId);
      return one<SecondFactor>(row);
    },
    putSecondFactor(f) {
      db.prepare(`INSERT INTO second_factors (person_id, secret, confirmed_at, last_used_step, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (person_id) DO UPDATE SET secret = excluded.secret, confirmed_at = NULL, last_used_step = NULL, created_at = excluded.created_at`)
        .run(f.personId, f.secret, f.confirmedAt, f.lastUsedStep, f.createdAt);
    },
    confirmSecondFactor(personId, at, step) {
      db.prepare('UPDATE second_factors SET confirmed_at = ?, last_used_step = ? WHERE person_id = ?').run(at, step, personId);
    },
    recordSecondFactorStep(personId, step) {
      db.prepare('UPDATE second_factors SET last_used_step = ? WHERE person_id = ?').run(step, personId);
    },
    deleteSecondFactor(personId) {
      db.prepare('DELETE FROM second_factors WHERE person_id = ?').run(personId);
      db.prepare('DELETE FROM recovery_codes WHERE person_id = ?').run(personId);
    },
    replaceRecoveryCodes(personId, hashes) {
      /* Codes from an earlier enrolment are dropped rather than kept alongside: they were minted
         against a secret that no longer applies. */
      db.prepare('DELETE FROM recovery_codes WHERE person_id = ?').run(personId);
      const insert = db.prepare('INSERT INTO recovery_codes (id, person_id, code_hash, used_at) VALUES (?, ?, ?, NULL)');
      for (const hash of hashes) insert.run(randomUUID(), personId, hash);
    },
    unusedRecoveryCodes(personId) {
      return db.prepare('SELECT id, code_hash AS codeHash FROM recovery_codes WHERE person_id = ? AND used_at IS NULL').all(personId) as unknown as RecoveryCode[];
    },
    countUnusedRecoveryCodes(personId) {
      const row = db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE person_id = ? AND used_at IS NULL').get(personId) as { n: number };
      return row.n;
    },
    spendRecoveryCode(id, at) { db.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(at, id); },
    createSecondFactorChallenge(c) {
      db.prepare('INSERT INTO second_factor_challenges (id, token_hash, person_id, attempts, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(c.id, c.tokenHash, c.personId, c.attempts, c.createdAt, c.expiresAt);
    },
    findSecondFactorChallenge(tokenHash) {
      const row = db.prepare('SELECT id, token_hash AS tokenHash, person_id AS personId, attempts, created_at AS createdAt, expires_at AS expiresAt, consumed_at AS consumedAt FROM second_factor_challenges WHERE token_hash = ?').get(tokenHash);
      return one<SecondFactorChallenge>(row);
    },
    recordSecondFactorChallengeAttempt(id) { db.prepare('UPDATE second_factor_challenges SET attempts = attempts + 1 WHERE id = ?').run(id); },
    consumeSecondFactorChallenge(id, at) { db.prepare('UPDATE second_factor_challenges SET consumed_at = ? WHERE id = ?').run(at, id); },
    requestErasure(r) {
      db.prepare(`INSERT INTO erasure_requests (person_id, requested_at, erase_after, cancelled_at, completed_at) VALUES (?, ?, ?, NULL, NULL)
        ON CONFLICT (person_id) DO UPDATE SET requested_at = excluded.requested_at, erase_after = excluded.erase_after, cancelled_at = NULL`)
        .run(r.personId, r.requestedAt, r.eraseAfter);
    },
    findErasureRequest(personId) {
      const row = db.prepare('SELECT person_id AS personId, requested_at AS requestedAt, erase_after AS eraseAfter, cancelled_at AS cancelledAt, completed_at AS completedAt FROM erasure_requests WHERE person_id = ?').get(personId);
      return one<ErasureRequest>(row);
    },
    cancelErasureRequest(personId, at) {
      db.prepare('UPDATE erasure_requests SET cancelled_at = ? WHERE person_id = ? AND cancelled_at IS NULL AND completed_at IS NULL').run(at, personId);
    },
    erasuresDue(at) {
      return db.prepare('SELECT person_id AS personId, requested_at AS requestedAt, erase_after AS eraseAfter, cancelled_at AS cancelledAt, completed_at AS completedAt FROM erasure_requests WHERE cancelled_at IS NULL AND completed_at IS NULL AND erase_after <= ? ORDER BY erase_after').all(at) as unknown as ErasureRequest[];
    },
    /* Every erasure request still waiting, whatever its grace period. `erasuresDue` answers "what
       can the sweep carry out now"; this answers "what has somebody asked for and not been answered
       about", which is the section 24 clock and a different question. */
    openErasureRequests() {
      return db.prepare('SELECT person_id AS personId, requested_at AS requestedAt, erase_after AS eraseAfter, cancelled_at AS cancelledAt, completed_at AS completedAt FROM erasure_requests WHERE cancelled_at IS NULL AND completed_at IS NULL ORDER BY requested_at').all() as unknown as ErasureRequest[];
    },
    erasePerson(personId, phone, tombstone, at) {
      /* One transaction. A half-carried-out erasure — the number gone, the sessions still live — is
         worse than one that has not started, because nobody would notice the difference. */
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE people SET name = NULL, phone = ? WHERE id = ?').run(tombstone, personId);
        db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
        db.prepare('DELETE FROM challenges WHERE phone = ?').run(phone);
        db.prepare('DELETE FROM starts WHERE phone = ?').run(phone);
        db.prepare('DELETE FROM second_factors WHERE person_id = ?').run(personId);
        db.prepare('DELETE FROM recovery_codes WHERE person_id = ?').run(personId);
        db.prepare('DELETE FROM second_factor_challenges WHERE person_id = ?').run(personId);
        /* The holdings register has said since the caller limit landed that this one is "deleted
           with everything else", and it was not: the erasure reached six tables and this was the
           seventh. It is a small holding and an easy one to miss, which is exactly why the register
           is checked against the schema — and why a promise in the register that no line of code
           carries out is worth more attention than the size of the table suggests. Erasing it also
           clears whatever the person had spent of their own rate limit, which is correct: their
           sessions are revoked on the line above and there is nobody left to limit. */
        db.prepare('DELETE FROM write_attempts WHERE subject = ?').run(personId);
        db.prepare('UPDATE erasure_requests SET completed_at = ? WHERE person_id = ?').run(at, personId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    countSweepable(table, before) {
      const row = db.prepare(`SELECT COUNT(*) AS n ${SWEEPS[table]}`).get(before) as { n: number };
      return row.n;
    },
    sweep(table, before) {
      const result = db.prepare(`DELETE ${SWEEPS[table]}`).run(before);
      return Number(result.changes);
    },
    recordWrite(at, subject, route) {
      db.prepare('INSERT INTO write_attempts (at, subject, route) VALUES (?, ?, ?)').run(at, subject, route);
    },
    /* The one number in the measurement that is exact rather than a lower bound, and the one that
       actually decides whether sixty is too tight. It is counted here rather than in the roll-up
       because a refused request never reaches write_attempts — the limiter answers and returns
       before anything is recorded, which is correct (counting a refusal against the caller would
       make a lockout self-sustaining) and is why the refusals would otherwise be invisible. */
    recordWriteRefusal(at, windowMs) {
      const start = Math.floor(at / windowMs) * windowMs;
      db.prepare('INSERT INTO write_windows (window_start, refused) VALUES (?, 1) ON CONFLICT (window_start) DO UPDATE SET refused = refused + 1').run(start);
    },
    /* Roll spent attempts up into windows nobody appears in, then say how many were folded. Only
       attempts older than one window are considered: anything newer could still be counted by a
       live limiter, and summarising a window that is still open would produce a number that changes
       after it has been written down. The caller deletes the rows afterwards — this does not, so a
       roll-up that runs twice writes the same numbers rather than half of them. */
    rollUpWriteWindows(before, windowMs) {
      /* CAST rather than a bare division: node:sqlite binds a JavaScript number as a REAL, so `at / ?`
         is floating-point division and every attempt lands in a bucket of its own — which looks like
         a working roll-up producing one window per request. */
      const rows = db.prepare(`
        SELECT window_start, SUM(per_caller) AS writes, COUNT(*) AS callers, MAX(per_caller) AS busiest FROM (
          SELECT CAST(at / ? AS INTEGER) * ? AS window_start, subject, COUNT(*) AS per_caller
          FROM write_attempts WHERE at < ? GROUP BY window_start, subject
        ) GROUP BY window_start`).all(windowMs, windowMs, before) as unknown as { window_start: number; writes: number; callers: number; busiest: number }[];
      const upsert = db.prepare(`INSERT INTO write_windows (window_start, callers, writes, busiest) VALUES (?, ?, ?, ?)
        ON CONFLICT (window_start) DO UPDATE SET callers = excluded.callers, writes = excluded.writes, busiest = excluded.busiest`);
      for (const row of rows) upsert.run(row.window_start, row.callers, row.writes, row.busiest);
      return rows.length;
    },
    writeWindows(limit) {
      const rows = db.prepare('SELECT window_start, callers, writes, busiest, refused FROM write_windows ORDER BY window_start DESC LIMIT ?')
        .all(limit) as unknown as { window_start: number; callers: number; writes: number; busiest: number; refused: number }[];
      return rows.map(row => ({ windowStart: row.window_start, callers: row.callers, writes: row.writes, busiest: row.busiest, refused: row.refused }));
    },
    countWrites(subject, since) {
      const row = db.prepare('SELECT COUNT(*) AS n FROM write_attempts WHERE subject = ? AND at >= ?').get(subject, since) as { n: number };
      return row.n;
    },
    appendAudit(e) {
      db.prepare('INSERT INTO audit (at, event, person_id, phone, address, agent_hash, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(e.at, e.event, e.personId, e.phone, e.address, e.agentHash, e.detail);
    },
    countAuditEvents(event, personId, since) {
      const row = db.prepare('SELECT COUNT(*) AS n FROM audit WHERE event = ? AND person_id = ? AND at >= ?').get(event, personId, since) as { n: number };
      return row.n;
    },
    /* A person's own lines out of the append-only log, for the subject export. Matched on the id and
       on the number together: the earliest events in a sign-in happen before an account exists, so
       they carry a number and no id, and an export that showed only the id-bearing ones would hide
       exactly the lines somebody looking for an intrusion came for. */
    auditForPerson(personId, phone, limit) {
      return db.prepare('SELECT at, event, person_id AS personId, phone, address, agent_hash AS agentHash, detail FROM audit WHERE person_id = ? OR phone = ? ORDER BY at DESC, rowid DESC LIMIT ?').all(personId, phone, limit) as unknown as AuditEvent[];
    },
    recentAudit(limit) {
      return db.prepare('SELECT at, event, person_id AS personId, phone, address, agent_hash AS agentHash, detail FROM audit ORDER BY at DESC, rowid DESC LIMIT ?').all(limit) as unknown as AuditEvent[];
    },
    close() { db.close(); }
  };
}
