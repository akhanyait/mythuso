/**
 * Does a schema in the identity service hold clinical data?
 *
 * ── The check this replaces, and why it was wrong ────────────────────────────────────────────
 *
 * `scripts/check-boundaries.mjs` used to answer that question by taking every `CREATE TABLE …;`
 * out of a source file with a regular expression and grepping the *whole statement* for a list of
 * clinical words. Two things were wrong with that, and both of them cost something real.
 *
 * The first is that `CREATE TABLE[^;]+` is not a statement. It runs from the words "CREATE TABLE"
 * to the next semicolon in the file, wherever that is. `apps/api/src/vetting/store.ts` contains the
 * sentence "a CREATE TABLE will not add one. Adding it here means an existing register gains the
 * column on the next start", in a comment, and the old check happily swallowed that paragraph and
 * scanned it. A comment near a schema that mentioned a medication would have failed the build, and
 * the person it failed on would have had no idea why.
 *
 * The second is the one the consent work ran into. Grepping the whole statement cannot tell *a
 * table of clinical data* from *a table about access to clinical records*. The log of who opened
 * whose record had to be called `record_access_log` rather than `clinical_access_log`, because the
 * honest name would have failed the build for entirely the wrong reason — and a check that pushes
 * people into vaguer names is a check making the codebase worse.
 *
 * ── What it does instead ─────────────────────────────────────────────────────────────────────
 *
 * It parses the statement — the table name, and the name of every column in the parenthesised
 * column list — and holds the *identifiers* to the word list. Nothing else in the statement is
 * looked at, because nothing else in it stores anything. The word list is not touched: this is a
 * change in precision, not in permissiveness, and every word that refused a table yesterday still
 * refuses one today when it appears where a value would live.
 *
 * ── The one distinction it draws ─────────────────────────────────────────────────────────────
 *
 * `observation` in a column name is a column that holds a reading. `observation_id` is a column
 * that names one — a reference to a record kept somewhere the POPIA controls actually apply. So an
 * identifier whose last segment is one of a closed, short list of words that can only name, group,
 * count or order a thing — id, ids, type, ref, count, log, seq — is read as being *about* the
 * clinical record rather than being it. That is what lets `clinical_access_log` exist under its
 * real name, and it is the whole of the loosening: seven suffixes, none of which is a place a
 * blood pressure could be written.
 *
 * A date is deliberately not on that list. `observation_at` is when somebody's reading was taken,
 * which is information about their care, and this file will refuse it.
 *
 * ── What it still does not catch ─────────────────────────────────────────────────────────────
 *
 * A table called `readings` with a column called `value` uses none of these words and passes.
 * Precision does not fix vocabulary, and no list of words ever will — the check is a tripwire
 * across the obvious route, not a proof that no clinical value can reach this service. What proves
 * that is docs/PRIVACY-AND-SECURITY.md being worked through before a clinical record is stored at
 * all. Said out loud so nobody reads a green build as that proof.
 */

/* Unchanged from the check this replaces, deliberately and to the letter. */
export const CLINICAL_WORDS = /\b(observation|diagnos|prescription|medication|clinical|patient_record|vital|symptom|allerg)/i;

/* An identifier ending in one of these names, groups, counts or orders a thing. None of them is
   somewhere a reading fits, which is the only reason the list can exist at all. */
const REFERENCE_SUFFIXES = new Set(['id', 'ids', 'type', 'ref', 'count', 'log', 'seq']);

/* Table constraints share the comma-separated list with the columns and are not columns. */
const CONSTRAINT_KEYWORDS = new Set(['primary', 'unique', 'check', 'foreign', 'constraint', 'exclude']);

const unquote = (raw) => /^["`[]/.test(raw) ? raw.slice(1, -1) : raw;

/**
 * Is this identifier a place a clinical value could be written?
 *
 * The word list first, then the one exemption. Both halves are needed: without the first a column
 * called `diagnosis` walks in, and without the second the log of who opened a record cannot be
 * called what it is.
 */
export function namesClinicalData(identifier) {
 if (!CLINICAL_WORDS.test(identifier)) return false;
 const segments = identifier.toLowerCase().split(/[_\s]+/).filter(Boolean);
 return !REFERENCE_SUFFIXES.has(segments[segments.length - 1] ?? '');
}

/**
 * Every `CREATE TABLE` in a source file, as a name and a list of column names.
 *
 * Written as a scanner rather than a regular expression because the thing that has to be right is
 * where the statement *ends*: the column list ends at its matching bracket, and a bracket inside a
 * quoted identifier or a string default does not count. A regex that stops at the first `)` reads
 * half a schema, and one that stops at the next `;` reads the comment underneath it.
 */
export function tablesIn(source) {
 const tables = [];
 const opening = /CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s*(\(|AS\b)/gi;
 for (const match of source.matchAll(opening)) {
  const name = unquote(match[1]);
  /* `CREATE TABLE x AS SELECT …` has no column list to read, so the columns it would grow are
     whatever the query returns and this file cannot see them. Refused rather than skipped: a form
     the check silently ignores is a way around the check. */
  if (match[2].toLowerCase() === 'as') {
   throw new Error(`"CREATE TABLE ${name} AS …" has no column list, so scripts/clinical-tables.mjs cannot see what columns it grows. Write the columns out.`);
  }
  const from = match.index + match[0].length;      // just past the opening bracket
  const columns = [];
  let depth = 1;
  let item = '';
  let quote = '';
  let at = from;
  for (; at < source.length && depth > 0; at += 1) {
   const character = source[at];
   if (quote) {
    item += character;
    if (character === quote) quote = '';
    continue;
   }
   if (character === '"' || character === '`' || character === "'") { quote = character; item += character; continue; }
   if (character === '[') { quote = ']'; item += character; continue; }
   if (character === '(') { depth += 1; item += character; continue; }
   if (character === ')') { depth -= 1; if (depth) item += character; continue; }
   if (character === ',' && depth === 1) { columns.push(item); item = ''; continue; }
   item += character;
  }
  if (depth > 0) throw new Error(`The column list of "${name}" is never closed. scripts/clinical-tables.mjs reads a schema by its brackets.`);
  columns.push(item);
  tables.push({
   name,
   columns: columns
    .map(part => part.trim().split(/[\s(]/)[0] ?? '')
    .filter(Boolean)
    .filter(first => !CONSTRAINT_KEYWORDS.has(first.toLowerCase()))
    .map(unquote)
  });
 }
 return tables;
}

/**
 * Every identifier in a source file that is a place a clinical value could be written.
 *
 * Returns them rather than throwing, so the caller composes the refusal sentence with the file name
 * in it and so this file can be exercised both ways by scripts/check-boundaries.mjs itself.
 */
export function clinicalIdentifiers(source) {
 const found = [];
 for (const table of tablesIn(source)) {
  if (namesClinicalData(table.name)) found.push({ table: table.name, identifier: table.name, kind: 'table' });
  for (const column of table.columns) {
   if (namesClinicalData(column)) found.push({ table: table.name, identifier: column, kind: 'column' });
  }
 }
 return found;
}
