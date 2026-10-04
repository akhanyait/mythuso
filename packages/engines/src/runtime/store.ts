/* One SQLite file per engine, opened by the runtime and handed to that engine's handlers only.
   An engine that can open another's file is two engines that must be deployed, secured and changed
   together, so this is the one module in packages/engines that opens a database, and the boundary
   check fails the build if any other does or if one engine's directory imports another's. */
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MEMORY = ':memory:';

/* A stored answer belongs to the one caller who asked for it, and to the one request it answered.
   The Money lead found the first version keyed replays by route, role and key: two patients who
   happened to choose the same key were handed each other's payment result, and a retry with a
   different amount under a reused key was answered with the first charge instead of being refused.
   So the key includes the caller's own reference, and each reply keeps a digest of the declared fields
   it was given, so a reused key with a different request is refused rather than replayed. */
const RUNTIME_SCHEMA = `
CREATE TABLE IF NOT EXISTS _runtime_replays (
 route TEXT NOT NULL, role TEXT NOT NULL, caller_ref TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 request_digest TEXT NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY (route, role, caller_ref, idempotency_key)
);`;

/** The declared fields of a request, in a stable order, hashed. Undeclared fields never reach it. */
export const requestDigest = (fields: Readonly<Record<string, unknown>>): string =>
 createHash('sha256').update(JSON.stringify(Object.keys(fields).sort().map(name => [name, fields[name]]))).digest('hex');

export function openDatabase(directory: string, name: string): DatabaseSync {
 let db: DatabaseSync;
 if (directory === MEMORY) db = new DatabaseSync(MEMORY);
 else {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`"${name}" is not a store name.`);
  mkdirSync(directory, { recursive: true });
  db = new DatabaseSync(join(directory, `${name}.sqlite`));
 }
 db.exec('PRAGMA busy_timeout = 5000');
 return db;
}

export function openEngineStore(directory: string, engine: string, schema: string): DatabaseSync {
 const db = openDatabase(directory, engine);
 db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
 db.exec(RUNTIME_SCHEMA);
 db.exec(schema);
 return db;
}
