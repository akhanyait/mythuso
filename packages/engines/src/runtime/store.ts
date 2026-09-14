/* One SQLite file per engine, opened by the runtime and handed to that engine's handlers only.
   An engine that can open another's file is two engines that must be deployed, secured and changed
   together, so this is the one module in packages/engines that opens a database, and the boundary
   check fails the build if any other does or if one engine's directory imports another's. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MEMORY = ':memory:';

const RUNTIME_SCHEMA = `
CREATE TABLE IF NOT EXISTS _runtime_replays (
 route TEXT NOT NULL, role TEXT NOT NULL, idempotency_key TEXT NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY (route, role, idempotency_key)
);`;

export function openDatabase(directory: string, name: string): DatabaseSync {
 if (directory === MEMORY) return new DatabaseSync(MEMORY);
 if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`"${name}" is not a store name.`);
 mkdirSync(directory, { recursive: true });
 return new DatabaseSync(join(directory, `${name}.sqlite`));
}

export function openEngineStore(directory: string, engine: string, schema: string): DatabaseSync {
 const db = openDatabase(directory, engine);
 db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
 db.exec(RUNTIME_SCHEMA);
 db.exec(schema);
 return db;
}
