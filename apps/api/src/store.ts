import { DatabaseSync } from 'node:sqlite';
/**
 * Storage lives behind this interface because the architecture calls for PostgreSQL, and swapping
 * to it should be one file rather than a rewrite. SQLite is what a first identity slice needs.
 */
export type Person = { id: string; phone: string; name: string | null; createdAt: number };
export type Challenge = {
  id: string; phone: string; codeHash: string; attempts: number;
  createdAt: number; expiresAt: number; consumedAt: number | null;
};
export type Session = {
  id: string; tokenHash: string; personId: string;
  createdAt: number; lastSeenAt: number; expiresAt: number; revokedAt: number | null;
};
export type AuditEvent = {
  at: number; event: string; personId: string | null; phone: string | null;
  address: string | null; agentHash: string | null; detail: string | null;
};
export type Store = {
  findPersonByPhone(phone: string): Person | null;
  findPersonById(id: string): Person | null;
  createPerson(person: Person): void;
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
  appendAudit(event: AuditEvent): void;
  recentAudit(limit: number): AuditEvent[];
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
CREATE TABLE IF NOT EXISTS starts (
  at INTEGER NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS starts_at ON starts (at);
`;
export function openStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const one = <T>(row: unknown): T | null => (row ?? null) as T | null;
  return {
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
    appendAudit(e) {
      db.prepare('INSERT INTO audit (at, event, person_id, phone, address, agent_hash, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(e.at, e.event, e.personId, e.phone, e.address, e.agentHash, e.detail);
    },
    recentAudit(limit) {
      return db.prepare('SELECT at, event, person_id AS personId, phone, address, agent_hash AS agentHash, detail FROM audit ORDER BY at DESC, rowid DESC LIMIT ?').all(limit) as unknown as AuditEvent[];
    },
    close() { db.close(); }
  };
}
