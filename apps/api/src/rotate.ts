/**
 * Step 5 and step 6 of the rotation procedure in docs/DATA-PROTECTION.md, as a command.
 *
 * Until now those two steps had nothing to run. `rotateSealedBytes` existed and was tested and was
 * called by nothing; the procedure said "run the re-wrap pass" and there was no pass, and step 6's
 * first check — "no value is still wrapped under version 1" — had no way to be answered short of
 * decoding the database by hand. Both are here now.
 *
 *   node src/rotate.ts                    # what it would do, and how much is left
 *   node src/rotate.ts --commit           # do it
 *   node src/rotate.ts --commit --limit 500 --batch 50
 *
 * ── Dry run unless told otherwise ────────────────────────────────────────────────────────────
 *
 * The same rule the retention sweep follows, for a different reason. The sweep defaults to harmless
 * because deleting has no undo. This defaults to harmless because a rotation is performed at an
 * unusual hour by somebody following a written procedure, and the step before "do it" should be
 * "show me". A dry run here is not a simulation: it decodes and re-wraps every value it would write,
 * in memory, and discards the result — so "it would rewrite four thousand" is a claim that has
 * actually opened four thousand envelopes rather than counted four thousand table rows.
 *
 * ── Stopping is safe. It is not the same as reverting ────────────────────────────────────────
 *
 * Kill it at any point and the database is left holding some values under the old key and some under
 * the new one. That is a working database, not a broken one: both keys are in the ring, both open,
 * new writes go to the current version, and running this again finishes what is left. `--limit` is
 * there so stopping can be a decision rather than an interruption.
 *
 * ── It cannot read anything it rotates ───────────────────────────────────────────────────────
 *
 * This command holds the key ring and never the record crypto. It unwraps and re-wraps data keys and
 * never decrypts a payload, so an operator running a rotation at two in the morning is not an
 * operator who could read a nurse's police clearance while they were at it.
 */
import { loadConfig, type Config } from './config.ts';
import { createProtectionModule, printRotation, type RotationReport } from './protection/index.ts';
import { openStore } from './store.ts';
import { SEALED_COLUMNS, openVettingStore, vettingSource } from './vetting/index.ts';

function numeric(argv: string[], flag: string): number | undefined {
 const at = argv.indexOf(flag);
 if (at === -1) return undefined;
 const value = Number(argv[at + 1]);
 if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} takes a positive whole number.`);
 return Math.floor(value);
}

export function run(argv: string[] = process.argv.slice(2), config: Config = loadConfig()): RotationReport | null {
 const store = openStore(config.databasePath);
 try {
  /* Opened so the tables exist before they are counted. A rotation that reports "nothing to do"
     because the schema had never been applied is the exact false negative step 6 is guarding
     against — "a re-wrap that worked against an empty table", as the procedure puts it. */
  const vettingStore = openVettingStore(store.database);
  const protection = createProtectionModule(config, store.database, {
   vetting: vettingSource(vettingStore),
   releases: { find: () => null },
   sealedColumns: SEALED_COLUMNS
  });
  if (!protection) {
   console.log('\n  No protection keys are configured (MYTHUSO_PROTECTION_KEYS), so there is nothing sealed to rotate.\n');
   return null;
  }
  const report = protection.rotation.run({
   commit: argv.includes('--commit'),
   ...(numeric(argv, '--batch') !== undefined ? { batch: numeric(argv, '--batch') } : {}),
   ...(numeric(argv, '--limit') !== undefined ? { limit: numeric(argv, '--limit') } : {})
  });
  printRotation(report);
  /* Step 6's second check, offered rather than left to be remembered separately: the chain either
     still follows from its origin or it names where it stopped. A rotation is not the likely cause
     of a break — it never touches the log — but this is the moment the procedure asks. */
  const chain = protection.audit.verify();
  console.log(chain.intact
   ? `  audit chain: intact, ${chain.length} entries\n`
   : `  audit chain: BROKEN at entry ${chain.brokenAt} of ${chain.length}. Stop and investigate before going further.\n`);
  return report;
 } finally {
  store.close();
 }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) run();
