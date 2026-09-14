/* The development event log: every publish, every delivery and every refusal, append-only and
   hash-chained, in a file of its own that no engine's store holds. Each line's hash covers the line
   before it, so a line edited or removed with the sqlite shell breaks every hash after it and verify()
   says so. There is no UPDATE and no DELETE in this file. A refused publish is logged by the names of
   the fields it tried to send and never their values: what was refused may be exactly the thing that
   must not be written down. */
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ClockReading, TrailEntry, TrailReader } from './types.ts';

const GENESIS = '0'.repeat(64);
const SCHEMA = `
CREATE TABLE IF NOT EXISTS trail (
 seq INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, event_id TEXT, event_key TEXT, engine TEXT,
 body TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);`;

const hashOf = (prev: string, e: Omit<TrailEntry, 'hash' | 'prevHash'>) =>
 createHash('sha256').update(prev + '\n' + JSON.stringify([e.seq, e.at, e.kind, e.eventId, e.eventKey, e.engine, e.body])).digest('hex');

type Row = { seq: number; at: string; kind: string; event_id: string | null; event_key: string | null; engine: string | null; body: string; prev_hash: string; hash: string };
const toEntry = (r: Row): TrailEntry => ({ seq: r.seq, at: r.at, kind: r.kind, eventId: r.event_id, eventKey: r.event_key, engine: r.engine, body: r.body, prevHash: r.prev_hash, hash: r.hash });

export type Trail = TrailReader & {
 append(kind: string, entry: { eventId?: string | null; eventKey?: string | null; engine?: string | null; body: unknown }): TrailEntry;
 all(): TrailEntry[];
};

export function createTrail(db: DatabaseSync, clock: ClockReading): Trail {
 db.exec(SCHEMA);
 const last = db.prepare('SELECT seq, hash FROM trail ORDER BY seq DESC LIMIT 1');
 const insert = db.prepare('INSERT INTO trail (seq, at, kind, event_id, event_key, engine, body, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
 const all = () => (db.prepare('SELECT * FROM trail ORDER BY seq').all() as Row[]).map(toEntry);
 return {
  append(kind, { eventId = null, eventKey = null, engine = null, body }) {
   const top = last.get() as { seq: number; hash: string } | undefined;
   const base = { seq: (top?.seq ?? 0) + 1, at: clock.iso(), kind, eventId, eventKey, engine, body: JSON.stringify(body) };
   const prevHash = top?.hash ?? GENESIS;
   const hash = hashOf(prevHash, base);
   insert.run(base.seq, base.at, kind, eventId, eventKey, engine, base.body, prevHash, hash);
   return { ...base, prevHash, hash };
  },
  all,
  entries(fromIso, toIso) {
   const from = new Date(fromIso).getTime(), to = new Date(toIso).getTime();
   return all().filter(e => { const t = new Date(e.at).getTime(); return t >= from && t <= to; });
  },
  verify() {
   let prev = GENESIS;
   for (const e of all()) {
    if (e.prevHash !== prev || hashOf(prev, e) !== e.hash) return false;
    prev = e.hash;
   }
   return true;
  },
 };
}
