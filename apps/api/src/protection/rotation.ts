/**
 * Rotation as an operation somebody performs, rather than a primitive somebody could.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────────────────────
 *
 * `rotateSealedBytes` has existed since the module landed: it unwraps a data key, re-wraps it under
 * the current version, and never touches a ciphertext. It is tested, it is pure, and until now
 * nothing called it. docs/DATA-PROTECTION.md's rotation procedure said so out loud — step 5 was a
 * step with nothing to run, and step 6's first check had nothing to answer it. A rotation nobody can
 * run is a key that never changes, whatever the schedule in the document says.
 *
 * ── What makes it resumable, and why that is not a feature ───────────────────────────────────
 *
 * There is no cursor and nothing is remembered between runs. Each batch asks the database the same
 * question — which rows are not on the current version — and the answer shrinks as the work is done.
 * Kill the process halfway and the database is left holding some values under version 1 and some
 * under version 2, both of which open, because both keys are in the ring for exactly this reason.
 * Run it again and it picks up what was missed. There is no half-written state to recover from and
 * no position to lose, which is what lets a rotation be run in twenty-minute pieces over several
 * evenings against a live service.
 *
 * Idempotence comes from the same place twice over: `rotateSealedBytes` returns a value already on
 * the current version unchanged, and the write is guarded on the version it read, so two passes
 * running at once cannot both claim the same row.
 *
 * ── Why there is a key_version column at all ─────────────────────────────────────────────────
 *
 * The version is already in the first eight bytes of every sealed blob, so the column is
 * denormalised on purpose. Without it, "how much is left" is a full scan that decodes every value in
 * the table, which is the sort of question an operator stops asking. With it, it is an index lookup,
 * and step 6 of the procedure — "no value is still wrapped under version 1" — has an answer that
 * costs nothing to get.
 *
 * Denormalised means it can drift, so nothing here trusts it for correctness: every row that is
 * rewritten has its column recomputed from the blob it actually holds, and `standing()` reports a
 * disagreement between the two as its own kind of finding rather than averaging them.
 *
 * ── What rotation is not ─────────────────────────────────────────────────────────────────────
 *
 * It re-wraps data keys. It does not replace them and does not re-encrypt a payload. A data key that
 * has leaked is still good for its own record afterwards, so a *compromise* needs every affected
 * value opened and sealed again, which is a different operation that does not exist. And no root key
 * is ever retired by running this: the audit chain is keyed from the ring and can never be
 * re-chained without destroying the thing that makes it evidence, so old versions are kept for ever.
 * Rotation limits what a future disclosure reaches. It does not undo a past one.
 */
import type { KeyRing, KeyVersion } from './contract.ts';
import type { Database } from './audit.ts';
import { ProtectionFailure, rotateSealedBytes, sealedKeyVersion } from './crypto.ts';

/**
 * One column of sealed values, and the two columns needed to find and rewrite it.
 *
 * Registered by whichever module owns the table rather than listed here: a rotation that has to be
 * told about a new table in a file belonging to another module is a rotation that silently skips it.
 */
export type SealedColumn = {
 /** For the operator's report, in the words they would use: "Vetting evidence documents". */
 label: string;
 table: string;
 idColumn: string;
 blobColumn: string;
 /** Beside the blob, and indexed, so "how much is left" selects rather than scans. */
 versionColumn: string;
};

/* Table and column names are pasted into SQL, because no database binds an identifier as a
   parameter. They come from module source rather than from a request, which is the actual defence —
   but "it cannot reach here" is the sentence every injection began life as, so they are checked
   anyway, once, at construction. */
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
function checkIdentifier(value: string): string {
 if (!IDENTIFIER.test(value)) {
  throw new ProtectionFailure(`"${value}" is not a table or column name this rotation will paste into a statement. Names are lower case, start with a letter or underscore, and hold nothing else.`);
 }
 return value;
}

export type VersionCount = { version: KeyVersion | null; rows: number };
export type ColumnStanding = {
 column: SealedColumn;
 total: number;
 /** By the column, which is what the query is cheap on. Ordered oldest first. */
 byVersion: VersionCount[];
 /** Rows the column says are not on the current version. The number the runbook asks for. */
 outstanding: number;
 /** Rows whose column and whose blob disagree. Not a rotation problem: a data problem, named. */
 disagreeing: number;
};
export type RotationStanding = {
 current: KeyVersion;
 configured: KeyVersion[];
 columns: ColumnStanding[];
 outstanding: number;
};

export type RotationReport = {
 commit: boolean;
 current: KeyVersion;
 /** What was actually rewritten, per column. Zero everywhere on a dry run. */
 rewrapped: { column: SealedColumn; rows: number }[];
 /** True when the run stopped because it reached its limit rather than because it was finished. */
 more: boolean;
 before: RotationStanding;
 after: RotationStanding;
};

export type RotationOptions = {
 /** One transaction per batch. Small on purpose: a rotation that locks the table for an hour is a rotation performed at 03:00 or not at all. */
 batch?: number;
 /** Stop after this many values, so an evening's work is a decision rather than a guess. */
 limit?: number;
 commit: boolean;
};

export interface Rotation {
 /** Cheap, indexed, and safe to run against a live service. Step 6 of the procedure. */
 standing(): RotationStanding;
 /** Step 5. Interruptible, resumable, idempotent, and a dry run unless told otherwise. */
 run(options: RotationOptions): RotationReport;
}

export function createRotation(keys: KeyRing, db: Database, columns: readonly SealedColumn[]): Rotation {
 const checked = columns.map(column => ({
  ...column,
  table: checkIdentifier(column.table),
  idColumn: checkIdentifier(column.idColumn),
  blobColumn: checkIdentifier(column.blobColumn),
  versionColumn: checkIdentifier(column.versionColumn)
 }));

 const standingOf = (column: SealedColumn): ColumnStanding => {
  const counts = db.prepare(
   `SELECT ${column.versionColumn} AS version, COUNT(*) AS rows FROM ${column.table} GROUP BY ${column.versionColumn}`
  ).all() as { version: number | bigint | null; rows: number | bigint }[];
  const byVersion = counts
   .map(row => ({ version: row.version === null ? null : Number(row.version), rows: Number(row.rows) }))
   .sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
  /* Read back rather than counted from the column, because the column is the thing being checked.
     This is the one query here that is a scan, which is why it is in standing() and not in the
     nightly path — an operator asking "is this really done" should pay for a real answer. */
  let disagreeing = 0;
  const stored = db.prepare(
   `SELECT ${column.versionColumn} AS version, ${column.blobColumn} AS blob FROM ${column.table}`
  ).all() as { version: number | bigint | null; blob: Uint8Array | null }[];
  for (const row of stored) {
   const actual = row.blob ? sealedKeyVersion(row.blob) : null;
   if (actual === null || row.version === null || Number(row.version) !== actual) disagreeing += 1;
  }
  const total = byVersion.reduce((sum, entry) => sum + entry.rows, 0);
  const outstanding = byVersion.filter(entry => entry.version !== keys.current).reduce((sum, entry) => sum + entry.rows, 0);
  return { column, total, byVersion, outstanding, disagreeing };
 };

 const standing = (): RotationStanding => {
  const perColumn = checked.map(standingOf);
  return {
   current: keys.current,
   configured: [...keys.versions],
   columns: perColumn,
   outstanding: perColumn.reduce((sum, entry) => sum + entry.outstanding, 0)
  };
 };

 return {
  standing,
  run(options: RotationOptions): RotationReport {
   const batch = Math.max(1, options.batch ?? 100);
   const limit = options.limit ?? Number.POSITIVE_INFINITY;
   const before = standing();
   const rewrapped: { column: SealedColumn; rows: number }[] = [];
   let done = 0;
   let more = false;

   for (const column of checked) {
    /* Ordered by the identifier, so the same rows come back in the same order on every run and a
       row cannot be starved by an unstable sort while its neighbours are done twice. */
    const notCurrent = `(${column.versionColumn} IS NULL OR ${column.versionColumn} <> ?)`;
    const select = db.prepare(
     `SELECT ${column.idColumn} AS id, ${column.blobColumn} AS blob
      FROM ${column.table} WHERE ${notCurrent} ORDER BY ${column.idColumn} LIMIT ?`
    );
    /* Guarded on the version that was read. Two passes running at once — an operator and a cron, or
       two windows on the same evening — cannot both rewrite the same value: the second update
       matches nothing and moves on. */
    const update = db.prepare(
     `UPDATE ${column.table} SET ${column.blobColumn} = ?, ${column.versionColumn} = ?
      WHERE ${column.idColumn} = ? AND ${notCurrent}`
    );
    let rows = 0;
    for (;;) {
     if (done >= limit) { more = true; break; }
     const take = Math.min(batch, limit - done);
     const pending = select.all(keys.current, take) as { id: string; blob: Uint8Array | null }[];
     if (!pending.length) break;
     if (!options.commit) {
      /* A dry run still decodes every value it would rewrite, so "it would have done 4 000 rows"
         is a claim that has actually opened 4 000 envelopes rather than counted 4 000 numbers. */
      for (const row of pending) if (row.blob) rotateSealedBytes(keys, row.blob);
      done += pending.length;
      rows += pending.length;
      /* Nothing was written, so the same values come back next time round. Stop after one look. */
      more = pending.length === take;
      break;
     }
     db.exec('BEGIN IMMEDIATE');
     try {
      for (const row of pending) {
       if (!row.blob) continue;
       const rotated = rotateSealedBytes(keys, row.blob);
       /* The version written is read back out of the bytes rather than assumed from the ring, so the
          column can never claim a version the blob is not actually under. */
       const version = sealedKeyVersion(rotated.bytes);
       if (version === null) throw new ProtectionFailure(`Refusing to write a value back to ${column.table} that no longer declares a key version.`);
       update.run(rotated.bytes, version, row.id, keys.current);
       rows += 1;
       done += 1;
      }
      db.exec('COMMIT');
     } catch (error) {
      db.exec('ROLLBACK');
      throw error;
     }
    }
    if (rows) rewrapped.push({ column, rows });
   }
   return { commit: options.commit, current: keys.current, rewrapped, more, before, after: standing() };
  }
 };
}

/** The operator's report. Prints counts and never a key, a fingerprint or a value. */
export function printRotation(report: RotationReport, log: (line: string) => void = console.log): void {
 log(`\n  ${report.commit ? 'RUNNING' : 'DRY RUN'} — re-wrapping under protection key version ${report.current}`);
 log(`  keys in the ring: ${report.before.configured.join(', ')} (old versions are kept for ever; the audit chain is keyed from them)\n`);
 for (const column of report.before.columns) {
  log(`  ${column.column.label}  (${column.column.table}.${column.column.blobColumn})`);
  log(`    values        : ${column.total}`);
  log(`    on an old key : ${column.outstanding}`);
  if (column.disagreeing) log(`    disagreeing   : ${column.disagreeing}  — the version beside the value is not the version inside it`);
 }
 log('');
 if (report.commit) {
  for (const line of report.rewrapped) log(`  re-wrapped ${line.rows} in ${line.column.table}`);
  log(`\n  still on an old key: ${report.after.outstanding}`);
  if (report.more) log('  the limit was reached before the work was — run it again, it picks up where it stopped');
  else if (!report.after.outstanding) log('  nothing is left on an old key. Step 6 also asks you to verify the audit chain and open one record by hand.');
 } else {
  log(`  would re-wrap : ${report.rewrapped.reduce((sum, line) => sum + line.rows, 0)}${report.more ? ' in this run, and more after it' : ''}`);
  log('  (nothing written)\n  Re-run with --commit to apply.');
 }
 log('');
}
