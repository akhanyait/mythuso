/**
 * The store an engine's handlers are handed: its own tables, one statement at a time, and nothing more.
 *
 * ── Why a facade and not the handle ──────────────────────────────────────────────────────────────────
 *
 * The first version typed the store as exec and prepare and handed over the real DatabaseSync. The
 * reviewer showed what that meant: a Care tick ran COMMIT, attached Safety's file and an arbitrary one,
 * read Safety's panic rows, created a database of its own and ran BEGIN again, and nothing faulted. The
 * type said two methods; SQLite said everything. So the handle never leaves the runtime. Every statement
 * is read before it is run, and node:sqlite in Node 22 has no authorizer or attach limit to lean on,
 * which is why the reading is done here.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────────────────────────────
 *
 * A statement that attaches or detaches a database, because another engine's store is reached through
 * a route or an event and never through a file. One that begins, commits, rolls back, saves or releases,
 * because the transaction is the binder's: a handler that refuses or throws is rolled back whole, and a
 * handler that could commit half of itself first would make that a lie. VACUUM, which can copy the file
 * anywhere. EXPLAIN, which no handler needs. A PRAGMA other than the read-only ones on the allow-list,
 * because a pragma can switch off the schema's own protections. A second statement after the first,
 * because prepare silently drops it and exec silently runs it, and neither is what the author saw. And a
 * name beginning _runtime_ in any spelling — bare, quoted, bracketed, back-ticked or as a string, which
 * SQLite accepts where a table name belongs — because the replay table beside the engine's own is the
 * binder's record of what it already answered, and an engine that edits it can make a second charge look
 * like a replay. It lives in the engine's store, rather than a file of the runtime's, so that an answer
 * and the record of it commit together or not at all.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { EngineStore } from './types.ts';

type AnyRefusal = { id: string; statement: string };

/** A statement the store will not run. Its detail names the statement's kind, never its values. */
export class StoreRefused extends Error {
 readonly refusal: string;
 constructor(refusal: AnyRefusal, detail: string) {
  super(`${refusal.statement} ${detail}`);
  this.name = 'StoreRefused';
  this.refusal = refusal.id;
 }
}

type Token = { kind: 'word' | 'name' | 'string' | 'punctuation'; text: string };

/* Enough of SQLite's lexer to know where statements begin and end and what each name is: comments and
   whitespace are skipped, a quoted string or name is one token however many semicolons it holds. */
export function tokensOf(sql: string): Token[] {
 const tokens: Token[] = [];
 let i = 0;
 const quoted = (close: string, kind: Token['kind']) => {
  let text = '';
  i++;
  while (i < sql.length) {
   if (sql[i] === close) {
    if (close !== ']' && sql[i + 1] === close) { text += close; i += 2; continue; }
    i++;
    tokens.push({ kind, text });
    return;
   }
   text += sql[i++];
  }
  tokens.push({ kind, text });
 };
 while (i < sql.length) {
  const c = sql[i]!;
  if (/\s/.test(c)) { i++; continue; }
  if (c === '-' && sql[i + 1] === '-') { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end + 1; continue; }
  if (c === '/' && sql[i + 1] === '*') { const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2; continue; }
  if (c === "'") { quoted("'", 'string'); continue; }
  if (c === '"') { quoted('"', 'name'); continue; }
  if (c === '`') { quoted('`', 'name'); continue; }
  if (c === '[') { quoted(']', 'name'); continue; }
  const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
  if (word) { tokens.push({ kind: 'word', text: word[0] }); i += word[0].length; continue; }
  tokens.push({ kind: 'punctuation', text: c });
  i++;
 }
 return tokens;
}

const TRANSACTIONAL = new Set(['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE']);
const FILE_LEVEL = new Set(['ATTACH', 'DETACH', 'VACUUM', 'EXPLAIN']);
/* Pragmas that only describe the engine's own schema. None of them takes a value. */
const READ_ONLY_PRAGMAS = new Set(['table_info', 'table_xinfo', 'table_list', 'index_list', 'index_info', 'index_xinfo', 'foreign_key_list']);

/** The reason a statement is refused, or null. Exported so the boundary check and the tests read one rule. */
export function refusalFor(sql: string): { id: string; detail: string } | null {
 if (typeof sql !== 'string') return { id: 'store-statement-refused', detail: 'A statement is text.' };
 const tokens = tokensOf(sql);
 const end = tokens.findIndex(t => t.kind === 'punctuation' && t.text === ';');
 if (end >= 0 && tokens.slice(end + 1).some(t => !(t.kind === 'punctuation' && t.text === ';'))) return { id: 'store-statement-refused', detail: 'It held more than one statement.' };
 const statement = end >= 0 ? tokens.slice(0, end) : tokens;
 if (!statement.length) return { id: 'store-statement-refused', detail: 'It was empty.' };
 if (statement.some(t => t.kind !== 'punctuation' && t.text.toLowerCase().startsWith('_runtime_'))) return { id: 'store-runtime-table-refused', detail: 'It named a table the runtime keeps.' };
 const first = statement[0]!;
 const leading = first.kind === 'word' ? first.text.toUpperCase() : '';
 if (TRANSACTIONAL.has(leading)) return { id: 'store-statement-refused', detail: `It was a ${leading} statement, and the transaction is the binder's.` };
 if (FILE_LEVEL.has(leading)) return { id: 'store-statement-refused', detail: `It was a ${leading} statement.` };
 if (leading === 'PRAGMA') {
  const name = statement[1];
  const qualified = statement[2]?.kind === 'punctuation' && statement[2].text === '.';
  const setsAValue = statement.some(t => t.kind === 'punctuation' && t.text === '=');
  if (!name || name.kind !== 'word' || qualified || setsAValue || !READ_ONLY_PRAGMAS.has(name.text.toLowerCase())) return { id: 'store-statement-refused', detail: 'It was a pragma that is not on the read-only list.' };
 }
 return null;
}

/** The only store a handler ever holds. The DatabaseSync behind it stays with the runtime. */
export function storeFacade(db: DatabaseSync, refusal: (id: string) => AnyRefusal): EngineStore {
 const check = (sql: string) => {
  const refused = refusalFor(sql);
  if (refused) throw new StoreRefused(refusal(refused.id), refused.detail);
 };
 const facade = {
  exec(sql: string): void { check(sql); db.exec(sql); },
  prepare(sql: string) { check(sql); return db.prepare(sql); },
 };
 return Object.freeze(facade) as EngineStore;
}
