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
 /** How many fifteen-minute windows were summarised before the attempts behind them were deleted. */
 windowsRolledUp: number;
};

export function sweep(store: Store, options: { commit: boolean; now?: number }): SweepReport {
 const at = options.now ?? Date.now();
 const spent = at - limits.spentCodeRetentionDays * DAY;
 const ended = at - limits.endedSessionRetentionDays * DAY;
 const windowMs = limits.rateWindowSeconds * 1000;
 /* ---- write_attempts, which this sweep did not touch until now ------------------------------
    The table has been in `SweepableTable` and in the store's list of what may be deleted since the
    caller limit landed, and personalData.ts tells a data subject it is "swept away on its own within
    a day in any case". It was not in this plan, so it was not: the one table in this service that
    grows with traffic rather than with people was growing without limit, and the sentence saying
    otherwise was true of the machinery and false of the schedule. Two windows are kept rather than
    one, so that a limiter counting a sliding fifteen minutes always has the whole of it. */
 const spentAttempts = at - 2 * windowMs;
 /* Summarised before they are deleted, because after they are deleted there is nothing to summarise.
    This is the only chance to turn a caller's requests into a number about nobody, and it is taken
    on the same pass so that the roll-up cannot fall behind the sweep and quietly lose a week. */
 const windowsRolledUp = options.commit ? store.rollUpWriteWindows(spentAttempts, windowMs) : 0;
 const plan: { what: string; table: SweepableTable; before: number }[] = [
  { what: 'One-time codes that were used or expired', table: 'challenges', before: spent },
  { what: 'Numbers and addresses that asked for a code', table: 'starts', before: spent },
  { what: 'Half-finished sign-ins owing a second factor', table: 'second_factor_challenges', before: spent },
  { what: 'Sessions that were signed out or ran out', table: 'sessions', before: ended },
  { what: 'Requests counted against the caller limit, once no limiter can still count them', table: 'write_attempts', before: spentAttempts }
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
 return { commit: options.commit, at, lines, erasuresDue: due, erasuresCarriedOut: carriedOut, windowsRolledUp };
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
 log('\n  Fifteen-minute windows summarised before their attempts were deleted');
 log(report.commit ? `    rolled up: ${report.windowsRolledUp}  (write_windows — five integers each, nobody in them)` : '    (nothing rolled up)');
 log(`    read them back with GET /health/limits, which answers on the loopback. ${limits.writesPerCallerPerWindow} is still a proposal.`);
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
