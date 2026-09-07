/**
 * The founding ceremony, as a command. The one thing on this platform nobody reviews.
 *
 * A high-risk vetting check needs a second, different reviewer. Somebody has to clear the first
 * reviewer, and there is nobody to do it — so `apps/api/src/vetting` has a bootstrap. This is the
 * only way to reach it. It runs at a console, in front of two people, against an authorisation
 * signed from the key ring that is good for a few minutes and good exactly once.
 *
 *   node src/bootstrap.ts authorise --party admin-1:admin --party admin-2:admin \
 *        --decided-by "G. Makinana" --seconded-by "N. Dlamini" [--minutes 15]
 *
 *   node src/bootstrap.ts seed   --authorisation <token> [--reference admin-1:SANC 20014477] --commit
 *   cat police-clearance.pdf | node src/bootstrap.ts submit \
 *        --party admin-1 --check police-clearance --filename police-clearance.pdf \
 *        --issued-on 2026-01-14 --commit
 *   node src/bootstrap.ts decide --authorisation <token> --commit
 *
 *   node src/bootstrap.ts standing        # what is still resting on a bootstrap, and since when
 *
 * ── Why it is four commands and not one ──────────────────────────────────────────────────────
 *
 * Because the certificates arrive between the second command and the fourth. Seeding creates the two
 * parties; the documents are then submitted the ordinary way — through the gate, by each person
 * about their own file, which needs no authorisation because subject access needs no standing — and
 * only then is there anything to decide. Each ceremony takes its own authorisation, so an operator
 * mints one to seed and another to decide, days apart if that is how long the police clearance takes.
 *
 * This service imports `node:crypto`, `node:sqlite` and `node:http` and nothing else, which is the
 * main thing standing between it and a poisoned dependency. That is why a document is read from
 * standard input rather than from a path: it costs the operator a `cat` and it keeps the count of
 * built-in modules at three, where it can be checked with a grep.
 *
 * ── Dry run unless told otherwise ────────────────────────────────────────────────────────────
 *
 * The same rule the rotation and the retention sweep follow. `seed` and `decide` without `--commit`
 * check the authorisation, print exactly what would happen, and spend nothing — the authorisation is
 * consumed when a ceremony opens, so a dry run genuinely leaves it usable. `submit` without
 * `--commit` reads the document, reports its size and its SHA-256, and stores nothing.
 */
import { loadConfig, type Config } from './config.ts';
import { createProtectionModule, mintBootstrapAuthorisation, BOOTSTRAP_MINUTES } from './protection/index.ts';
import { openStore } from './store.ts';
import { SEALED_COLUMNS, VettingVault, hashOf, openVettingStore, roleChecks, roleName, vettingSource } from './vetting/index.ts';

const say = (line = '') => console.log(line);
const value = (argv: string[], flag: string): string | undefined => {
 const at = argv.indexOf(flag);
 return at === -1 ? undefined : argv[at + 1];
};
const values = (argv: string[], flag: string): string[] =>
 argv.reduce<string[]>((found, item, at) => item === flag && argv[at + 1] !== undefined ? [...found, argv[at + 1]!] : found, []);
const required = (argv: string[], flag: string): string => {
 const given = value(argv, flag);
 if (!given?.trim()) throw new Error(`${flag} is required.`);
 return given.trim();
};

/* "admin-1:admin" and "admin-1:identity:2026-01-14" — split into a fixed number of parts, so a value
   that itself contains a colon lands in the last one rather than silently shifting everything. */
function parts(raw: string, count: number, shape: string): string[] {
 const found: string[] = [];
 let rest = raw;
 for (let index = 0; index < count - 1; index += 1) {
  const at = rest.indexOf(':');
  if (at === -1) throw new Error(`"${raw}" is not ${shape}.`);
  found.push(rest.slice(0, at).trim());
  rest = rest.slice(at + 1);
 }
 found.push(rest.trim());
 if (found.some(part => !part)) throw new Error(`"${raw}" is not ${shape}.`);
 return found;
}

async function fromStdin(): Promise<Buffer> {
 const chunks: Buffer[] = [];
 for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
 return Buffer.concat(chunks);
}

/** Everything the three database-touching commands need, opened once and closed once. */
function open(config: Config) {
 const store = openStore(config.databasePath);
 const vettingStore = openVettingStore(store.database);
 const protection = createProtectionModule(config, store.database, {
  vetting: vettingSource(vettingStore), releases: { find: () => null }, sealedColumns: SEALED_COLUMNS
 });
 if (!protection) {
  store.close();
  throw new Error('No protection keys are configured (MYTHUSO_PROTECTION_KEYS), so there is no key ring to authorise a bootstrap and nothing to seal a document with.');
 }
 return {
  store, vettingStore, protection,
  vault: new VettingVault({ gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store: vettingStore }),
  close: () => store.close()
 };
}

export async function run(argv: string[] = process.argv.slice(2), config: Config = loadConfig()): Promise<void> {
 const command = argv[0] ?? 'help';
 const commit = argv.includes('--commit');

 if (command === 'authorise') {
  /* No database is opened and nothing is written. Minting is an act of the key ring alone, which is
     what lets the person holding the keys and the person performing the ceremony be two people. */
  const parties = values(argv, '--party').map(raw => {
   const [id, roleId] = parts(raw, 2, 'a party as <id>:<role>, e.g. admin-1:admin');
   if (!roleChecks(roleId!).length) throw new Error(`packages/catalog/vetting.json has no role "${roleId}", so there is no set of checks to hold ${id} to.`);
   return { id: id!, roleId: roleId! };
  });
  if (!parties.length) throw new Error('Name the parties this authorisation seeds: --party admin-1:admin --party admin-2:admin');
  const minutes = value(argv, '--minutes') === undefined ? BOOTSTRAP_MINUTES : Number(value(argv, '--minutes'));
  const minted = mintBootstrapAuthorisation(config, {
   parties, decidedBy: required(argv, '--decided-by'), secondedBy: required(argv, '--seconded-by'), minutes
  });
  say();
  say(`  Bootstrap authorisation ${minted.fingerprint}, good until ${new Date(minted.expiresAt).toISOString()}.`);
  say(`  It seeds ${parties.map(party => `${party.id} as ${roleName(party.roleId)}`).join(' and ')}, decided by ${required(argv, '--decided-by')} and ${required(argv, '--seconded-by')}.`);
  say('  It can be spent once. Write the fingerprint in the register entry, not the token.');
  say();
  say(minted.token);
  say();
  return;
 }

 if (command === 'standing') {
  const opened = open(config);
  try {
   const standing = opened.vault.bootstrapStanding();
   const resting = opened.vault.restingOnBootstrap();
   say();
   say(`  Founding ceremonies on this register: ${standing.ceremonies}${standing.lastCeremonyAt ? `, the last on ${standing.lastCeremonyAt}` : ''}.`);
   if (!resting.length) {
    say('  Nothing is standing on a bootstrap. Every check in the register was decided through the gate.');
   } else {
    say(`  ${resting.length} check${resting.length === 1 ? '' : 's'} still stand on a decision nobody reviewed:`);
    for (const check of resting) {
     say(`    ${check.partyId}  ${check.name}  decided ${new Date(check.bootstrappedAt!).toISOString().slice(0, 10)} by ${check.decidedBy} and ${check.secondedBy}`);
    }
    say('  Each of these is cleared by a real reviewer deciding it again through the gate.');
   }
   say();
  } finally { opened.close(); }
  return;
 }

 if (command === 'seed' || command === 'decide') {
  const authorisation = required(argv, '--authorisation');
  const opened = open(config);
  try {
   /* Checked before anything is spent, so a dry run is a dry run: verify() reads the token and
      touches nothing. Opening the ceremony is what consumes it, and that only happens under
      --commit. */
   const verdict = opened.protection.bootstrap.verify(authorisation, Date.now());
   if (!verdict.ok) throw new Error(verdict.reason);
   const grant = verdict.authorisation;
   const references = new Map(values(argv, '--reference').map(raw => {
    const [id, reference] = parts(raw, 2, 'a reference as <party>:<reference>');
    return [id!, reference!] as const;
   }));
   const issued = new Map<string, string>(values(argv, '--issued-on').map(raw => {
    const [id, checkId, date] = parts(raw, 3, 'an issue date as <party>:<check>:<YYYY-MM-DD>');
    return [`${id}/${checkId}`, date!] as const;
   }));
   say();
   say(`  Authorisation ${grant.fingerprint}, ${grant.decidedBy} and ${grant.secondedBy}, good until ${new Date(grant.expiresAt).toISOString()}.`);

   if (command === 'seed') {
    const owed = grant.parties.filter(party => !opened.vettingStore.findParty(party.id));
    if (!owed.length) {
     say('  Both parties are already in the register. Nothing to seed; submit their documents and then run: decide.');
     say();
     return;
    }
    for (const party of owed) {
     say(`  ${commit ? 'Seeding' : 'Would seed'} ${party.id} as ${roleName(party.roleId)}, owing ${roleChecks(party.roleId).length} checks.`);
    }
    if (!commit) { say('\n  Dry run. Nothing was written and the authorisation is unspent. Add --commit.\n'); return; }
    const ceremony = opened.vault.openBootstrap(authorisation);
    for (const party of owed) {
     ceremony.seed({ ...party, ...(references.has(party.id) ? { reference: references.get(party.id)! } : {}) });
    }
    ceremony.close();
    say('\n  Seeded. Now submit each certificate — ordinary submissions, through the gate, no authorisation needed:');
    for (const party of owed) {
     for (const check of roleChecks(party.roleId)) {
      say(`    cat <file> | node src/bootstrap.ts submit --party ${party.id} --check ${check.id} --filename <name> --issued-on <YYYY-MM-DD> --commit`);
     }
    }
    say('\n  Then mint a second authorisation and run: decide.\n');
    return;
   }

   /* decide. Only the checks with a document on file: a bootstrap may skip the reviewer and may
      never skip the evidence, so the rest are listed and left outstanding rather than waved. */
   const ready: { partyId: string; checkId: string; name: string }[] = [];
   const missing: string[] = [];
   for (const party of grant.parties) {
    for (const check of roleChecks(party.roleId)) {
     const evidence = opened.vettingStore.findEvidenceFor(party.id, check.id);
     if (evidence && opened.vettingStore.countVersions(evidence.id)) ready.push({ partyId: party.id, checkId: check.id, name: check.name });
     else missing.push(`${party.id}  ${check.name}`);
    }
   }
   for (const check of ready) say(`  ${commit ? 'Verifying' : 'Would verify'} ${check.partyId}  ${check.name}`);
   for (const check of missing) say(`  No document on file, staying outstanding: ${check}`);
   if (!ready.length) throw new Error('No check has a document on file. A bootstrap is allowed to skip the reviewer; it is not allowed to skip the evidence.');
   if (!commit) { say('\n  Dry run. Nothing was written and the authorisation is unspent. Add --commit.\n'); return; }
   const ceremony = opened.vault.openBootstrap(authorisation);
   for (const check of ready) {
    const key = `${check.partyId}/${check.checkId}`;
    ceremony.decide(check.partyId, check.checkId, issued.has(key) ? { issuedOn: issued.get(key)! } : {});
   }
   ceremony.close();
   const chain = opened.protection.audit.verify();
   say();
   say('  Done. The register entry this ceremony owes, beside the key ceremony in docs/DATA-PROTECTION.md:');
   say(`    date and server, both names — ${grant.decidedBy} and ${grant.secondedBy} — the authorisation fingerprint ${grant.fingerprint},`);
   say(`    the parties ${grant.parties.map(party => party.id).join(' and ')}, the ${ready.length} checks decided, and the audit chain head:`);
   say(`    ${chain.intact ? chain.head : `BROKEN at entry ${chain.brokenAt}. Stop and read docs/DATA-PROTECTION.md.`}`);
   say(`  ${ready.length} checks now stand on a decision nobody reviewed. They are listed by: node src/bootstrap.ts standing`);
   say('  Each of them is owed a re-review by a real reviewer, through the gate, as soon as there is one.');
   say();
   return;
  } finally { opened.close(); }
 }

 if (command === 'submit') {
  const partyId = required(argv, '--party');
  const checkId = required(argv, '--check');
  const filename = required(argv, '--filename');
  const document = await fromStdin();
  if (!document.byteLength) throw new Error('Nothing arrived on standard input. An empty file is not evidence: cat <file> | node src/bootstrap.ts submit …');
  const opened = open(config);
  try {
   const party = opened.vettingStore.findParty(partyId);
   if (!party) throw new Error(`Nobody by the name ${partyId} is being vetted. Seed the pair first: node src/bootstrap.ts seed --authorisation <token> --commit`);
   say();
   say(`  ${filename}: ${document.byteLength} bytes, SHA-256 ${hashOf(document)}`);
   if (!commit) { say('  Dry run. Nothing was stored. Add --commit.\n'); return; }
   /* Submitted by the party about their own file. Subject access needs no standing, which is what
      lets somebody with no clearance yet — the first two people on the platform, exactly — put their
      own certificate in. It goes through the gate and is sealed and audited like any other. */
   const outcome = opened.vault.submit({
    actor: { id: partyId, role: party.roleId, purpose: 'subject-access' },
    partyId, checkId, filename, document,
    ...(value(argv, '--issued-on') ? { issuedOn: required(argv, '--issued-on') } : {})
   });
   if (!outcome.ok) throw new Error(outcome.reason);
   say(`  Stored as version ${outcome.version.versionNumber}, sealed under key version ${outcome.version.keyVersion}. The check is submitted and undecided.\n`);
  } finally { opened.close(); }
  return;
 }

 say();
 say('  The founding ceremony. Two people, a console, and an authorisation good once.');
 say();
 say('    authorise --party <id>:<role> … --decided-by <name> --seconded-by <name> [--minutes 15]');
 say('    seed      --authorisation <token> [--reference <party>:<reference>] [--commit]');
 say('    submit    --party <id> --check <id> --filename <name> [--issued-on <date>] [--commit]   (document on stdin)');
 say('    decide    --authorisation <token> [--issued-on <party>:<check>:<date>] [--commit]');
 say('    standing');
 say();
 say('  docs/DATA-PROTECTION.md says who must be present, what they record, and what an auditor should ask for.');
 say();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
 run().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
 });
}
