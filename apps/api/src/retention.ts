/**
 * The retention sweep: throw away what has done its work, and carry out erasures whose wait is up.
 *
 * ── Dry run unless told otherwise ────────────────────────────────────────────────────────────
 *
 * Deleting is the one operation here with no undo, so the default is the harmless one. It prints
 * exactly what it would do either way, and only `--commit` makes it true. A sweep that reports
 * nothing until it has already run is a sweep nobody can rehearse before a Friday afternoon.
 *
 * ── What it will not touch ───────────────────────────────────────────────────────────────────
 *
 * The audit table. It is append-only by contract, the boundary check fails the build if a delete
 * appears against it, and a log something is allowed to tidy up is not a log. Keeping the sweep's
 * reach in store.ts, as a fixed list of four tables, is what stops a later "just add audit to the
 * list" from being a one-line change nobody reviews.
 *
 * ── Why these four ───────────────────────────────────────────────────────────────────────────
 *
 * All of them are spent sign-in machinery, and all of them hold a mobile number or an internet
 * address. Data minimisation is not only about what is collected; a one-time code that was used at
 * seven this morning is personal information with no remaining purpose by tomorrow, and the cheapest
 * way to protect it is not to still have it.
 *
 *   node src/retention.ts             # rehearse
 *   node src/retention.ts --commit    # do it
 */
import { limits, loadConfig, type Config } from './config.ts';
import { Erasure } from './erasure.ts';
import { openStore, type Store, type SweepableTable } from './store.ts';

const DAY = 86_400_000;

export type SweepLine = { what: string; table: SweepableTable; eligible: number; deleted: number };
export type SweepReport = {
 commit: boolean;
 at: number;
 lines: SweepLine[];
 /** Accounts whose seven days ran out. Erased when committed, listed when not. */
 erasuresDue: string[];
 erasuresCarriedOut: number;
};

export function sweep(store: Store, options: { commit: boolean; now?: number }): SweepReport {
 const at = options.now ?? Date.now();
 const spent = at - limits.spentCodeRetentionDays * DAY;
 const ended = at - limits.endedSessionRetentionDays * DAY;
 const plan: { what: string; table: SweepableTable; before: number }[] = [
  { what: 'One-time codes that were used or expired', table: 'challenges', before: spent },
  { what: 'Numbers and addresses that asked for a code', table: 'starts', before: spent },
  { what: 'Half-finished sign-ins owing a second factor', table: 'second_factor_challenges', before: spent },
  { what: 'Sessions that were signed out or ran out', table: 'sessions', before: ended }
 ];
 const lines = plan.map(({ what, table, before }) => ({
  what, table,
  eligible: store.countSweepable(table, before),
  deleted: options.commit ? store.sweep(table, before) : 0
 }));

 const erasure = new Erasure(store, () => at);
 const due = erasure.due(at);
 let carriedOut = 0;
 if (options.commit) for (const personId of due) if (erasure.carryOut(personId)) carriedOut += 1;
 return { commit: options.commit, at, lines, erasuresDue: due, erasuresCarriedOut: carriedOut };
}

export function print(report: SweepReport, log: (line: string) => void = console.log): void {
 log(`\n  ${report.commit ? 'RUNNING' : 'DRY RUN'} — ${new Date(report.at).toISOString()}\n`);
 for (const line of report.lines) {
  log(`  ${line.what}`);
  log(`    eligible : ${line.eligible}  (${line.table})`);
  log(report.commit ? `    deleted  : ${line.deleted}` : '    (nothing deleted)');
 }
 log(`\n  Accounts past their ${limits.erasureGraceDays}-day erasure grace period`);
 log(`    due      : ${report.erasuresDue.length}`);
 for (const id of report.erasuresDue.slice(0, 10)) log(`      · ${id}`);
 log(report.commit ? `    erased   : ${report.erasuresCarriedOut}` : '    (nothing erased)');
 log('    the append-only sign-in log is never touched, by this or by anything else\n');
 if (!report.commit) log('  Re-run with --commit to apply.\n');
}

export function run(argv: string[] = process.argv.slice(2), config: Config = loadConfig()): SweepReport {
 const store = openStore(config.databasePath);
 try {
  const report = sweep(store, { commit: argv.includes('--commit') });
  print(report);
  return report;
 } finally {
  store.close();
 }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) run();
