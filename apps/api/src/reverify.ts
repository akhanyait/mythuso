/**
 * The re-verification sweep: ask the issuing authorities again, and notice when nobody has.
 *
 *   node src/reverify.ts                            # rehearse — asks nobody, reports what is owed
 *   node src/reverify.ts --commit --as admin-1      # ask, under a named reviewer's authority
 *
 * ── Why there is a schedule at all ───────────────────────────────────────────────────────────
 *
 * The vault already resolves an expiry on every read, so a police clearance that ran out last night
 * withdraws a nurse's capabilities this morning with nobody having to notice. That is the *document*
 * going out of date. This is the other one: a registration withdrawn, a licence suspended, an
 * accreditation lapsed — none of which changes the certificate in the vault, none of which sends
 * anybody a letter, and all of which are visible only by asking the register again.
 *
 * An authority's answer is a statement about one moment. Believing one indefinitely is the same
 * failure as verifying a check once at sign-up, which the whole vetting module exists to refuse.
 *
 * ── Dry run unless told otherwise, and for a different reason again ──────────────────────────
 *
 * retention.ts defaults to harmless because deleting has no undo. rotate.ts defaults to harmless
 * because a rotation is performed at an unusual hour by somebody following a procedure. This
 * defaults to harmless because a real enquiry costs money and reaches outside the building: a
 * verification provider bills per query, and a sweep that fired the moment somebody typed the
 * command is a sweep somebody runs once and then stops trusting themselves with.
 *
 * ── Why --commit needs --as ──────────────────────────────────────────────────────────────────
 *
 * Every enquiry goes through the gate, and the gate decides about actors: a reviewer's capability,
 * their own current vetting standing, and their purpose. A sweep with no actor would either be a
 * route around the gate or would have to invent a service identity that nothing has vetted — and an
 * unvetted identity that may run enquiries against every nurse in the register is precisely the
 * back door the gate was built to close. So the operator names the reviewer whose authority the run
 * is made under, that reviewer's own standing decides whether the run may happen at all, and their
 * name is on every entry in the chain. A dry run needs no actor because it asks nobody.
 */
import { loadConfig, type Config } from './config.ts';
import { createProtectionModule } from './protection/index.ts';
import { openStore } from './store.ts';
import {
 SEALED_COLUMNS, VettingVault, authorityVerifiers, createIdentityProvider,
 openVettingStore, vettingSource,
 type AuthorityOutcome, type ReverificationDue
} from './vetting/index.ts';

export type ReverificationReport = {
 commit: boolean;
 at: number;
 asOf: string | null;
 /** What is owed, whether or not it was asked. The dry run's whole output. */
 due: ReverificationDue[];
 /** How many enquiries were actually made. Zero on a dry run, by construction. */
 asked: number;
 /** Every answer received, counted by outcome. `not-integrated` is an answer and is counted. */
 outcomes: Record<AuthorityOutcome, number>;
 /** Enquiries the gate refused, which is a finding about the reviewer rather than about the party. */
 refused: { evidenceId: string; reason: string }[];
 /** Where an authority said something a reviewer's verification cannot survive. */
 contradictions: { partyId: string; checkName: string; authority: string; outcome: AuthorityOutcome }[];
 /** How much of the layer is real, counted at the moment of the run rather than claimed. */
 integration: { total: number; integrated: string[]; notIntegrated: string[]; sentence: string };
};

const emptyOutcomes = (): Record<AuthorityOutcome, number> =>
 ({ confirmed: 0, 'not-found': 0, mismatch: 0, expired: 0, unavailable: 0, 'not-integrated': 0 });

export async function reverify(vault: VettingVault, options: {
 commit: boolean; as?: string; role?: string; now?: number; limit?: number;
}): Promise<ReverificationReport> {
 const at = options.now ?? Date.now();
 const due = vault.reverificationDue(at);
 const report: ReverificationReport = {
  commit: options.commit, at, asOf: options.as ?? null, due,
  asked: 0, outcomes: emptyOutcomes(), refused: [], contradictions: [],
  integration: vault.verificationStanding()
 };
 if (!options.commit) return report;
 if (!options.as) throw new Error('A committed run has to name the reviewer it is made under: --as <reviewer-id>. Every enquiry goes through the gate, and the gate decides about a person rather than about a process.');

 const actor = { id: options.as, role: options.role ?? 'admin', purpose: 'vetting' as const };
 const work = options.limit ? due.slice(0, options.limit) : due;
 for (const item of work) {
  const answered = await vault.checkWithAuthority({ actor, evidenceId: item.evidenceId });
  if (!answered.ok) { report.refused.push({ evidenceId: item.evidenceId, reason: answered.reason }); continue; }
  report.asked += 1;
  report.outcomes[answered.answer.outcome] += 1;
  if (answered.contradicts) {
   report.contradictions.push({
    partyId: item.partyId, checkName: item.checkName,
    authority: item.authority, outcome: answered.answer.outcome
   });
  }
 }
 return report;
}

export function print(report: ReverificationReport, log: (line: string) => void = console.log): void {
 log(`\n  ${report.commit ? 'RUNNING' : 'DRY RUN'} — ${new Date(report.at).toISOString()}`);
 log(`  ${report.integration.sentence}\n`);
 const reasons = { 'never-asked': 'never asked', stale: 'answer has aged past the cadence', expired: 'the authority\'s own expiry has passed' } as const;
 log(`  Checks owed an authority answer: ${report.due.length}`);
 for (const item of report.due.slice(0, 20)) {
  log(`    · ${item.partyId} / ${item.checkName} — ${item.authority}, ${reasons[item.why]}${item.askable ? '' : ' (and there is no integration to ask)'}`);
 }
 if (report.due.length > 20) log(`      … and ${report.due.length - 20} more`);
 if (!report.commit) {
  log('\n  (nothing asked — a real enquiry costs money and reaches outside the building)');
  log('  Re-run with --commit --as <reviewer-id> to ask.\n');
  return;
 }
 log(`\n  Enquiries made: ${report.asked}`);
 for (const [outcome, count] of Object.entries(report.outcomes)) if (count) log(`    ${outcome.padEnd(15)}: ${count}`);
 if (report.refused.length) {
  log(`\n  Refused by the gate: ${report.refused.length}`);
  for (const refusal of report.refused.slice(0, 5)) log(`    · ${refusal.reason}`);
 }
 if (report.contradictions.length) {
  log(`\n  CONTRADICTIONS — a reviewer verified these and the authority disagreed: ${report.contradictions.length}`);
  for (const found of report.contradictions) log(`    · ${found.partyId} / ${found.checkName} — ${found.authority} said ${found.outcome}`);
  log('    Nothing has been withdrawn automatically. A reviewer decides, by name, through suspend().');
 }
 log('');
}

function argument(argv: string[], flag: string): string | undefined {
 const at = argv.indexOf(flag);
 return at === -1 ? undefined : argv[at + 1];
}

export async function run(argv: string[] = process.argv.slice(2), config: Config = loadConfig()): Promise<ReverificationReport | null> {
 const store = openStore(config.databasePath);
 try {
  const vettingStore = openVettingStore(store.database);
  const protection = createProtectionModule(config, store.database, {
   vetting: vettingSource(vettingStore), releases: { find: () => null }, sealedColumns: SEALED_COLUMNS
  });
  if (!protection) {
   console.log('\n  No protection keys are configured (MYTHUSO_PROTECTION_KEYS), so there is no vault to re-verify against.\n');
   return null;
  }
  /* Throws in production where a provider is named with nothing behind it. That is the intended
     behaviour of a scheduled job as much as of the server: a nightly sweep that silently sandboxed
     would fill the register with confirmations nobody made. */
  const identity = createIdentityProvider({ config, store: vettingStore });
  const vault = new VettingVault({
   gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store: vettingStore,
   verifiers: authorityVerifiers(identity ? { dha: identity } : {}),
   identity
  });
  let report: ReverificationReport;
  try {
   report = await reverify(vault, {
    commit: argv.includes('--commit'),
    ...(argument(argv, '--as') ? { as: argument(argv, '--as') } : {}),
    ...(argument(argv, '--role') ? { role: argument(argv, '--role') } : {})
   });
  } catch (error) {
   /* A misuse of the command, not a fault in the register. It gets the sentence rather than the
      stack: the person reading it is at a console at an unusual hour following a procedure. */
   console.log(`\n  ${error instanceof Error ? error.message : 'The run could not start.'}\n`);
   return null;
  }
  print(report);
  return report;
 } finally {
  store.close();
 }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) await run();
