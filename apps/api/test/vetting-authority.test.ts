import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ConfigError, loadConfig } from '../src/config.ts';
import { createProtectionModule, mintBootstrapAuthorisation } from '../src/protection/index.ts';
import { reverify } from '../src/reverify.ts';
import {
 AUTHORITY_OUTCOMES, IdentityProviderRefused, VettingVault, authorityVerifiers, createIdentityProvider,
 enquiryReference, integrationSummary, openVettingStore, partyAssurance, roleChecks, signIdentityRequest, vettingSource,
 type Actor, type AuthorityVerifier
} from '../src/vetting/index.ts';

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 7, 8, 0, 0);
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4 clearance certificate, fictional.');

type IdentityOptions = {
 provider?: string; partnerId?: string; apiKey?: string; sandbox?: boolean;
 fetch?: Parameters<typeof createIdentityProvider>[0]['fetch'];
};

/**
 * The module wired the way server.ts wires it, plus the verification layer: a real key, a real
 * gate, a real database, and whichever adapters the test wants over the honest defaults.
 */
function harness(options: { identity?: IdentityOptions; verifiers?: Record<string, AuthorityVerifier>; explicitDevelopment?: boolean } = {}) {
 let clock = START;
 const now = () => clock;
 const db = new DatabaseSync(':memory:');
 const store = openVettingStore(db);
 const config = {
  environment: 'development' as const,
  protectionKeys: `1:${randomBytes(32).toString('hex')}`,
  protectionIndexVersion: '1',
  identityProvider: options.identity?.provider ?? '',
  identityPartnerId: options.identity?.partnerId ?? '',
  identityApiKey: options.identity?.apiKey ?? '',
  identitySandbox: options.identity?.sandbox ?? false,
  identityCallbackUrl: 'https://api.mythuso.invalid/vetting/identity/callback',
  /* MYTHUSO_ENV=development, said in so many words — the only arrangement in which an unsigned sandbox
     callback is accepted. A test of the refusals turns it off. */
  explicitDevelopment: options.explicitDevelopment ?? true
 };
 const protection = createProtectionModule(config, db, { vetting: vettingSource(store), releases: { find: () => null }, now })!;
 const identity = createIdentityProvider({
  config, store, ...(options.identity?.fetch ? { fetch: options.identity.fetch } : {})
 });
 const vault = new VettingVault({
  gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store,
  verifiers: authorityVerifiers({ ...(identity ? { dha: identity } : {}), ...(options.verifiers ?? {}) }),
  identity, now
 });
 return {
  db, store, vault, protection, identity, config, now,
  advance: (ms: number) => { clock += ms; },
  at: () => clock,
  entries: () => protection.audit.verify().length,
  authorise: () => mintBootstrapAuthorisation(config, {
   parties: [{ id: 'admin-1', roleId: 'admin' }, { id: 'admin-2', roleId: 'admin' }],
   decidedBy: 'founder', secondedBy: 'director'
  }, now).token
 };
}

const reviewer = (id: string): Actor => ({ id, role: 'admin', purpose: 'vetting' });
const themselves = (id: string, role: string): Actor => ({ id, role, purpose: 'subject-access' });

/** The founding pair, exactly as vetting.test.ts performs it. Everything after this goes through the gate. */
function reviewers(h: ReturnType<typeof harness>) {
 const seeding = h.vault.openBootstrap(h.authorise());
 seeding.seed({ id: 'admin-1', roleId: 'admin' });
 seeding.seed({ id: 'admin-2', roleId: 'admin' });
 seeding.close();
 for (const id of ['admin-1', 'admin-2']) {
  for (const check of roleChecks('admin')) {
   h.vault.submit({ actor: themselves(id, 'admin'), partyId: id, checkId: check.id, filename: `${check.id}.pdf`, document: PDF, issuedOn: iso(START - 30 * DAY) });
  }
 }
 const deciding = h.vault.openBootstrap(h.authorise());
 for (const id of ['admin-1', 'admin-2']) {
  for (const check of roleChecks('admin')) deciding.decide(id, check.id, { issuedOn: iso(START - 30 * DAY) });
 }
 deciding.close();
 return h;
}

/** A nurse, enrolled and cleared through the gate by two different reviewers. Nobody asked a register. */
function clearedNurse(h: ReturnType<typeof harness>, id = 'nurse-1') {
 h.vault.enrol(reviewer('admin-1'), { id, roleId: 'nurse', reference: 'SANC 20014477' });
 for (const check of roleChecks('nurse')) {
  h.vault.submit({ actor: themselves(id, 'nurse'), partyId: id, checkId: check.id, filename: `${check.id}.pdf`, document: PDF });
  const evidence = h.store.findEvidenceFor(id, check.id)!;
  h.vault.decide({ actor: reviewer('admin-1'), evidenceId: evidence.id, decision: 'verified', issuedOn: iso(START - 30 * DAY) });
  if (check.risk === 'high') h.vault.second(reviewer('admin-2'), evidence.id);
 }
 return id;
}

/** An adapter that answers whatever the test wants, so every outcome can be reached. */
function saying(authority: string, outcome: typeof AUTHORITY_OUTCOMES[number], detail = 'Because the test said so.'): AuthorityVerifier {
 return {
  authority,
  standing: { integrated: true, body: authority, route: 'partner-agreement', needs: '', latency: '', holds: '', note: '' },
  /* A fresh reference per enquiry, as every real adapter mints one. Reusing one would be recorded
     once and would quietly hide the other enquiries — which is exactly what the store's uniqueness
     guarantee is for. */
  check: async (_credential, at) => ({ authority, outcome, checkedAt: at, reference: enquiryReference(authority), detail, expiresOn: null })
 };
}

/* ---- The honest default: nothing is integrated -------------------------------------------- */

describe('what the verification layer says about itself', () => {
 test('every authority in the catalogue has an adapter, and twelve of the thirteen cannot be asked', () => {
  const summary = integrationSummary(authorityVerifiers());
  assert.equal(summary.total, 13);
  assert.equal(summary.integrated.length, 0);
  assert.equal(summary.notIntegrated.length, 13);
  assert.match(summary.sentence, /None of the 13 issuing authorities/);

  /* With a provider contracted, exactly one becomes real and the sentence changes with it rather
     than being a claim somebody edited. */
  const withProvider = integrationSummary(authorityVerifiers({ dha: saying('dha', 'confirmed') }));
  assert.deepEqual(withProvider.integrated, ['dha']);
  assert.equal(withProvider.notIntegrated.length, 12);
 });

 test('every not-integrated adapter says what a real integration would need', () => {
  for (const [id, verifier] of authorityVerifiers()) {
   assert.equal(verifier.standing.integrated, false, `${id} claims to be integrated`);
   assert.ok(verifier.standing.needs.length > 20, `${id} does not say what it needs`);
   assert.ok(verifier.standing.latency.length > 5, `${id} does not say what a call would cost in time`);
   assert.ok(verifier.standing.holds.length > 10, `${id} does not say what MyThuso would have to hold`);
   assert.ok(verifier.standing.note.length > 20, `${id} has no honest note`);
  }
 });

 test('a registry with a gap in it refuses to be built', () => {
  assert.throws(() => authorityVerifiers({ 'not-an-authority': saying('not-an-authority', 'confirmed') }), /no authority "not-an-authority"/);
  assert.throws(() => authorityVerifiers({ sanc: saying('hpcsa', 'confirmed') }), /says it verifies hpcsa/);
 });
});

/* ---- Every outcome, including the one that is today's truth --------------------------------- */

describe('what an authority can answer', () => {
 test('not-integrated is an answer, recorded and logged, not an error', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const before = h.entries();

  const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
  assert.ok(asked.ok, asked.ok ? '' : asked.reason);
  assert.equal(asked.answer.outcome, 'not-integrated');
  assert.equal(asked.answer.authority, 'sanc');
  assert.match(asked.answer.reference, /^sanc:/);
  assert.equal(asked.recorded, true);

  /* It is on file as a dated fact — "on this day there was still no way to ask SANC" — and it is
     in the chain like every other enquiry. */
  const history = h.vault.authorityHistory(evidence.id);
  assert.equal(history.length, 1);
  assert.equal(history[0]!.outcome, 'not-integrated');
  assert.ok(h.entries() > before);
 });

 test('each of the six outcomes is recorded as itself', async () => {
  for (const outcome of AUTHORITY_OUTCOMES) {
   const h = reviewers(harness({ verifiers: { sanc: saying('sanc', outcome) } }));
   clearedNurse(h);
   const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
   const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
   assert.ok(asked.ok, asked.ok ? '' : asked.reason);
   assert.equal(asked.answer.outcome, outcome);
   assert.equal(h.store.latestAuthorityAnswer(evidence.id)!.outcome, outcome);
  }
 });

 test('a verifier that cannot reach its authority is unavailable, never confirmed', async () => {
  const unreachable: AuthorityVerifier = {
   authority: 'sanc',
   standing: { integrated: true, body: 'SANC', route: 'partner-agreement', needs: '', latency: '', holds: '', note: '' },
   check: async () => { throw new Error('connect ETIMEDOUT'); }
  };
  const h = reviewers(harness({ verifiers: { sanc: unreachable } }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;

  const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
  assert.ok(asked.ok, asked.ok ? '' : asked.reason);
  assert.equal(asked.answer.outcome, 'unavailable');
  assert.match(asked.answer.detail, /Nothing has been confirmed/);
  /* And the standing does not quietly inherit the previous answer or the reviewer's decision. */
  const standing = h.vault.standing('nurse-1')!;
  assert.equal(standing.checks.find(check => check.checkId === 'sanc-registration')!.assurance.confirmed, false);
 });

 test('an authority nobody may ask about is refused at the gate, and the refusal is in the chain', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const before = h.entries();
  /* A courier is never granted review-vetting, so this is refused at the capability stage — the
     same refusal that would meet a reviewer whose own clearance had lapsed. */
  const asked = await h.vault.checkWithAuthority({ actor: { id: 'nurse-1', role: 'courier', purpose: 'vetting' }, evidenceId: evidence.id });
  assert.equal(asked.ok, false);
  assert.ok(h.entries() > before);
  assert.equal(h.vault.authorityHistory(evidence.id).length, 0);
 });
});

/* ---- The distinction the whole layer exists for --------------------------------------------- */

describe('a reviewer\'s decision and an authority\'s answer', () => {
 test('are held apart: reviewer-verified and authority-unconfirmed is a state the platform can say', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const standing = h.vault.standing('nurse-1')!;

  /* The reviewer's side: cleared, by two different people, on documents in the vault. */
  assert.equal(standing.standing.cleared, true);
  for (const check of standing.checks) assert.equal(check.state, 'verified');

  /* The authority's side: nothing, from anybody. Two facts, and the sentence says which is which. */
  assert.equal(standing.assurance.confirmed, 0);
  assert.equal(standing.assurance.checks, roleChecks('nurse').length);
  assert.match(standing.assurance.sentence, /Cleared by review, with no authority confirmation/);
  assert.match(standing.assurance.sentence, /no issuing authority has confirmed any of them/);
  assert.doesNotMatch(standing.assurance.sentence, /confirmed against/);

  /* And nothing an authority says writes to the evidence row: the decision stays the reviewer's. */
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
  assert.ok(asked.ok);
  const after = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  assert.deepEqual(after, evidence);
 });

 test('a confirmation says so, and says which register said it', async () => {
  const h = reviewers(harness({ verifiers: { sanc: saying('sanc', 'confirmed') } }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });

  const standing = h.vault.standing('nurse-1')!;
  const check = standing.checks.find(candidate => candidate.checkId === 'sanc-registration')!;
  assert.equal(check.assurance.confirmed, true);
  assert.match(check.assurance.sentence, /was confirmed against sanc on/);
  /* One of eight. The party sentence refuses to round that up. */
  assert.equal(standing.assurance.confirmed, 1);
  assert.match(standing.assurance.sentence, /1 of 8 checks are confirmed/);
  assert.match(standing.assurance.sentence, /The other 7 rest on a named reviewer/);
 });

 test('an authority contradicting a reviewer is loud, and withdraws nothing by itself', async () => {
  const h = reviewers(harness({ verifiers: { sanc: saying('sanc', 'not-found', 'No such registration.') } }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
  assert.ok(asked.ok, asked.ok ? '' : asked.reason);
  assert.equal(asked.contradicts, true);

  const found = h.vault.contradictions();
  assert.equal(found.length, 1);
  assert.equal(found[0]!.evidence.checkId, 'sanc-registration');
  /* The nurse is still dispatchable, and that is a stated choice rather than an oversight: a
     register that was briefly wrong must not strike people off the roster at three in the morning.
     A reviewer suspends, with their name on it. */
  assert.equal(h.vault.standing('nurse-1')!.standing.cleared, true);
  assert.equal(h.vault.standing('nurse-1')!.assurance.contradicted, 1);
  assert.match(h.vault.standing('nurse-1')!.assurance.sentence, /contradicted by the issuing authority/);
 });

 test('the party assurance counts the ones nobody can ask separately from the ones nobody has', () => {
  const assurance = partyAssurance([
   { assurance: { confirmed: true, integrated: true, contradicts: false } },
   { assurance: { confirmed: false, integrated: false, contradicts: false } },
   { assurance: { confirmed: false, integrated: true, contradicts: false } }
  ].map((check, index) => ({ ...check, authority: 'sanc', checkId: `c${index}` })) as never);
  assert.equal(assurance.confirmed, 1);
  assert.equal(assurance.notIntegrated, 1);
  assert.equal(assurance.unconfirmed, 1);
  assert.match(assurance.sentence, /cannot ask at all/);
 });
});

/* ---- The one adapter built for real ---------------------------------------------------------- */

describe('identity through an accredited provider', () => {
 const live = (fetchImpl: IdentityOptions['fetch']) => harness({
  identity: { provider: 'accredited-provider', partnerId: 'partner-1', apiKey: 'secret-key', fetch: fetchImpl }
 });

 test('the request is signed with the partner key, over the timestamp and the partner id', async () => {
  let sent: Record<string, unknown> = {};
  const h = reviewers(live(async (url, init) => {
   assert.match(url, /\/v2\/smart-selfie-session$/);
   sent = JSON.parse(init.body) as Record<string, unknown>;
   return { ok: true, status: 200, json: async () => ({ token: 'hosted-token' }) };
  }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;

  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.ok(opened.ok, opened.ok ? '' : opened.reason);
  assert.equal(opened.mode, 'live');
  assert.equal(sent.partner_id, 'partner-1');
  assert.equal(sent.signature, signIdentityRequest('secret-key', String(sent.timestamp), 'partner-1'));
  /* The identity number is not among the fields, because this service never holds one: the person
     types it into the provider's own flow. */
  assert.equal(JSON.stringify(sent).includes('id_number'), false);
 });

 test('a forged callback signature is refused, and the refusal is in the chain', async () => {
  const h = reviewers(live(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }) })));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.ok(opened.ok);
  const before = h.entries();

  const timestamp = new Date(h.at()).toISOString();
  const forged = h.vault.acceptIdentityCallback({
   reference: opened.reference, ResultCode: 0, timestamp,
   signature: signIdentityRequest('the-wrong-key', timestamp, 'partner-1')
  });
  assert.equal(forged.ok, false);
  assert.match(forged.ok ? '' : forged.reason, /signature does not verify/);
  assert.ok(h.entries() > before);
  /* Nothing was recorded: a forged callback must not leave a person confirmed. */
  assert.equal(h.vault.authorityHistory(evidence.id).length, 0);

  const unsigned = h.vault.acceptIdentityCallback({ reference: opened.reference, ResultCode: 0 });
  assert.equal(unsigned.ok, false);
  assert.match(unsigned.ok ? '' : unsigned.reason, /carries no signature/);

  /* A correct signature over a stale timestamp is still a correct signature, and is still refused. */
  const old = new Date(h.at() - 60 * 60_000).toISOString();
  const replayed = h.vault.acceptIdentityCallback({
   reference: opened.reference, ResultCode: 0, timestamp: old,
   signature: signIdentityRequest('secret-key', old, 'partner-1')
  });
  assert.equal(replayed.ok, false);
  assert.match(replayed.ok ? '' : replayed.reason, /outside the 15-minute window/);
 });

 test('a correctly signed callback is accepted once, and a retry changes nothing', async () => {
  const h = reviewers(live(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }) })));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.ok(opened.ok);
  const timestamp = new Date(h.at()).toISOString();
  const callback = {
   reference: opened.reference, ResultCode: 0, ResultText: 'Exact match',
   timestamp, signature: signIdentityRequest('secret-key', timestamp, 'partner-1')
  };

  const first = h.vault.acceptIdentityCallback(callback);
  assert.ok(first.ok, first.ok ? '' : first.reason);
  assert.equal(first.outcome, 'confirmed');
  assert.equal(first.repeated, false);

  const again = h.vault.acceptIdentityCallback(callback);
  assert.ok(again.ok, again.ok ? '' : again.reason);
  assert.equal(again.repeated, true);
  /* One enquiry, one answer on the register, however many times the provider retries. */
  assert.equal(h.vault.authorityHistory(evidence.id).length, 1);
  assert.equal(h.vault.standing('nurse-1')!.assurance.confirmed, 1);
 });

 test('the provider\'s result codes map onto the closed set, and anything unreadable is unavailable', async () => {
  const codes: [number, string][] = [[0, 'confirmed'], [1, 'confirmed'], [1011, 'mismatch'], [1013, 'not-found'], [1015, 'expired'], [2205, 'unavailable']];
  for (const [code, expected] of codes) {
   const h = reviewers(harness({ identity: { provider: 'accredited-provider' } }));
   clearedNurse(h);
   const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
   const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
   assert.ok(opened.ok, opened.ok ? '' : opened.reason);
   assert.equal(opened.mode, 'sandbox');
   const taken = h.vault.acceptIdentityCallback({ reference: opened.reference, ResultCode: code });
   assert.ok(taken.ok, taken.ok ? '' : taken.reason);
   assert.equal(taken.outcome, expected, `result code ${code}`);
  }
 });

 test('a callback naming a session this service never opened is refused', () => {
  const h = reviewers(harness({ identity: { provider: 'accredited-provider' } }));
  clearedNurse(h);
  const refused = h.vault.acceptIdentityCallback({ reference: 'dha:invented', ResultCode: 0 });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.reason, /No identity verification session was opened/);
 });

 test('a provider that cannot be reached records nothing and confirms nothing', async () => {
  const h = reviewers(live(async () => { throw new Error('ECONNREFUSED'); }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.equal(opened.ok, false);
  assert.match(opened.ok ? '' : opened.reason, /could not be reached/);
  assert.equal(h.vault.authorityHistory(evidence.id).length, 0);
 });

 test('production refuses to run without credentials rather than sandboxing', () => {
  const store = openVettingStore(new DatabaseSync(':memory:'));
  const base = { identityProvider: 'accredited-provider', identityPartnerId: '', identityApiKey: '', identitySandbox: false, identityCallbackUrl: '' };

  assert.throws(
   () => createIdentityProvider({ config: { ...base, environment: 'production' }, store }),
   IdentityProviderRefused
  );
  /* And with credentials present, a production service still refuses to be told to sandbox. */
  assert.throws(
   () => createIdentityProvider({ config: { ...base, environment: 'production', identityPartnerId: 'p', identityApiKey: 'k', identitySandbox: true }, store }),
   /cannot be enabled in production/
  );
  /* Development is allowed to rehearse, and says so in its own standing. */
  const sandbox = createIdentityProvider({ config: { ...base, environment: 'development' }, store })!;
  assert.equal(sandbox.mode, 'sandbox');
  assert.match(sandbox.standing.note, /^SANDBOX\./);

  /* The same refusal at the configuration boundary, so a typo is a service that will not start. */
  const env = {
   MYTHUSO_ENV: 'production', MYTHUSO_AUTH_PEPPER: 'x'.repeat(40), MYTHUSO_SMS_PROVIDER: 'test',
   MYTHUSO_ALLOWED_ORIGINS: 'https://mythuso.co.za', MYTHUSO_IDENTITY_PROVIDER: 'accredited-provider'
  };
  assert.throws(() => loadConfig(env as NodeJS.ProcessEnv), ConfigError);
  assert.throws(() => loadConfig({ ...env, MYTHUSO_IDENTITY_PROVIDER: '', MYTHUSO_IDENTITY_SANDBOX: 'true' } as NodeJS.ProcessEnv), /cannot be enabled in production/);
 });

 test('with no provider configured, Home Affairs is not integrated rather than sandboxed', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  assert.equal(h.identity, null);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.equal(opened.ok, false);
  const asked = await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });
  assert.ok(asked.ok);
  assert.equal(asked.answer.outcome, 'not-integrated');
 });

 test('an identity session cannot be opened against a check some other authority issues', async () => {
  const h = reviewers(harness({ identity: { provider: 'accredited-provider' } }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'police-clearance')!;
  const opened = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  assert.equal(opened.ok, false);
  assert.match(opened.ok ? '' : opened.reason, /verified by saps, not by the identity provider/);
 });
});

/* ---- The schedule ----------------------------------------------------------------------------- */

describe('re-verification on a schedule', () => {
 test('a dry run asks nobody and reports everything that is owed', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  const before = h.entries();

  const report = await reverify(h.vault, { commit: false, now: h.at() });
  assert.equal(report.commit, false);
  assert.equal(report.asked, 0);
  assert.equal(report.due.length, roleChecks('nurse').length + roleChecks('admin').length * 2);
  assert.ok(report.due.every(item => item.why === 'never-asked'));
  assert.ok(report.due.every(item => item.askable === false));
  /* Nothing was asked, so nothing is in the chain. A rehearsal that logged enquiries would be a
     rehearsal that had made them. */
  assert.equal(h.entries(), before);
 });

 test('a committed run has to name the reviewer whose authority it is made under', async () => {
  const h = reviewers(harness());
  clearedNurse(h);
  await assert.rejects(() => reverify(h.vault, { commit: true, now: h.at() }), /--as <reviewer-id>/);
 });

 test('a stale authority answer is found, and a fresh one is not', async () => {
  const h = reviewers(harness({ verifiers: { sanc: saying('sanc', 'confirmed') } }));
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'sanc-registration')!;
  await h.vault.checkWithAuthority({ actor: reviewer('admin-1'), evidenceId: evidence.id });

  /* The morning after: confirmed, current, and not on the list. */
  const fresh = await reverify(h.vault, { commit: false, now: h.at() + DAY });
  assert.equal(fresh.due.some(item => item.evidenceId === evidence.id), false);
  assert.equal(h.vault.standing('nurse-1', h.at() + DAY)!.assurance.confirmed, 1);

  /* Thirteen months later the SANC registration has renewed once and the answer is about a
     registration that has since been renewed or has not. The register is asked again. */
  const later = h.at() + 400 * DAY;
  const stale = await reverify(h.vault, { commit: false, now: later });
  const found = stale.due.find(item => item.evidenceId === evidence.id);
  assert.ok(found, 'a year-old confirmation should be due again');
  assert.equal(found.why, 'stale');
  assert.equal(found.lastOutcome, 'confirmed');
  /* And the standing stops claiming a current confirmation on the strength of it. */
  const standing = h.vault.standing('nurse-1', later)!;
  const check = standing.checks.find(candidate => candidate.checkId === 'sanc-registration')!;
  assert.equal(check.assurance.confirmed, false);
  assert.equal(check.assurance.stale, true);
  assert.match(check.assurance.sentence, /older than the check's own renewal cadence/);
 });

 test('a committed run asks, counts every outcome, and lands every enquiry in the chain', async () => {
  const h = reviewers(harness({ verifiers: { sanc: saying('sanc', 'confirmed'), saps: saying('saps', 'not-found') } }));
  clearedNurse(h);
  const before = h.entries();

  const report = await reverify(h.vault, { commit: true, as: 'admin-1', now: h.at() });
  assert.equal(report.asked, report.due.length);
  assert.equal(report.outcomes.confirmed, 1);
  /* Three police clearances: the nurse's, and one each for the pair who founded the register. */
  assert.equal(report.outcomes['not-found'], 3);
  assert.equal(report.outcomes['not-integrated'], report.due.length - 4);
  assert.equal(report.refused.length, 0);
  /* Every one of those contradicts a reviewer's verification, and the sweep says so rather than
     leaving it to be noticed. */
  assert.equal(report.contradictions.length, 3);
  assert.ok(report.contradictions.every(found => found.authority === 'saps'));

  /* One chain entry per enquiry, at least — the contradiction adds its own. */
  assert.ok(h.entries() >= before + report.asked);
  assert.equal(h.protection.audit.verify().intact, true);

  /* Running it again the same morning asks again and does not double-record: an enquiry has one
     reference and one answer. */
  const second = await reverify(h.vault, { commit: true, as: 'admin-1', now: h.at() });
  assert.equal(second.due.length, 0);
 });

 test('a sweep run under a reviewer the gate refuses asks nobody', async () => {
  const h = reviewers(harness({ verifiers: { sanc: saying('sanc', 'confirmed') } }));
  clearedNurse(h);
  h.vault.suspend(reviewer('admin-2'), 'admin-1', 'Under investigation.');

  const report = await reverify(h.vault, { commit: true, as: 'admin-1', now: h.at() });
  assert.equal(report.asked, 0);
  assert.equal(report.refused.length, report.due.length);
  assert.match(report.refused[0]!.reason, /Under investigation/);
 });
});

describe('B: the identity callback fails closed', () => {
 /* A cleared nurse with an identity session opened under whatever the harness configures. */
 async function opened(h: ReturnType<typeof harness>) {
  reviewers(h);
  clearedNurse(h);
  const evidence = h.store.findEvidenceFor('nurse-1', 'identity')!;
  const session = await h.vault.openIdentitySession(reviewer('admin-1'), evidence.id);
  if (!session.ok) throw new Error(session.reason);
  return { evidence, reference: session.reference, mode: session.mode };
 }
 const auditHolds = (h: ReturnType<typeof harness>, event: string) =>
  (h.db.prepare('SELECT * FROM protected_access_log').all() as unknown[]).some(row => JSON.stringify(row).includes(event));

 test('an unsigned sandbox callback is accepted only where MYTHUSO_ENV says development in so many words', async () => {
  const explicit = harness({ identity: { provider: 'accredited-provider' } });
  const yes = await opened(explicit);
  assert.equal(yes.mode, 'sandbox');
  const accepted = explicit.vault.acceptIdentityCallback({ reference: yes.reference, ResultCode: 0 });
  assert.ok(accepted.ok, accepted.ok ? '' : accepted.reason);

  const implicit = harness({ identity: { provider: 'accredited-provider' }, explicitDevelopment: false });
  const no = await opened(implicit);
  const refused = implicit.vault.acceptIdentityCallback({ reference: no.reference, ResultCode: 0 });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.reason, /not running in explicit development/);
  assert.equal(implicit.vault.authorityHistory(no.evidence.id).length, 0);
 });

 test('a sandbox session found in a database served outside explicit development is refused and flagged in the chain', async () => {
  const h = harness({ identity: { provider: 'accredited-provider' }, explicitDevelopment: false });
  const session = await opened(h);
  assert.equal(auditHolds(h, 'vetting.identity.sandbox.flagged'), false);
  const refused = h.vault.acceptIdentityCallback({ reference: session.reference, ResultCode: 0, signature: 'anything', timestamp: new Date(h.at()).toISOString() });
  assert.equal(refused.ok, false);
  assert.equal(auditHolds(h, 'vetting.identity.sandbox.flagged'), true);
 });

 test('a stored mode that is not a mode refuses the callback, and cannot be written in the first place', async () => {
  const h = harness({ identity: { provider: 'accredited-provider' } });
  const session = await opened(h);
  for (const mode of ['Live', 'staging', '']) {
   h.db.prepare('UPDATE vetting_identity_sessions SET mode = ? WHERE reference = ?').run(mode, session.reference);
   assert.equal(h.store.findIdentitySession(session.reference)!.mode, null, mode);
   const refused = h.vault.acceptIdentityCallback({ reference: session.reference, ResultCode: 0 });
   assert.equal(refused.ok, false, mode);
   assert.match(refused.ok ? '' : refused.reason, /neither sandbox nor live/);
  }
  assert.throws(() => h.store.openIdentitySession({
   reference: 'dha:synthetic', evidenceId: session.evidence.id, partyId: 'nurse-1', mode: 'staging' as never,
   outcome: null, detail: null, openedAt: h.at(), answeredAt: null
  }), /cannot be recorded in mode/);
 });

 test('a sandbox session with provider credentials configured still needs a signature', async () => {
  const h = harness({ identity: { provider: 'accredited-provider', partnerId: 'partner-1', apiKey: 'secret-key', sandbox: true } });
  const session = await opened(h);
  assert.equal(session.mode, 'sandbox');
  const unsigned = h.vault.acceptIdentityCallback({ reference: session.reference, ResultCode: 0 });
  assert.equal(unsigned.ok, false);
  assert.match(unsigned.ok ? '' : unsigned.reason, /carries no signature/);
  const timestamp = new Date(h.at()).toISOString();
  const signed = h.vault.acceptIdentityCallback({ reference: session.reference, ResultCode: 0, timestamp, signature: signIdentityRequest('secret-key', timestamp, 'partner-1') });
  assert.ok(signed.ok, signed.ok ? '' : signed.reason);
 });

 test('a provider named with no environment named refuses to start, and any spelling of production is production', () => {
  assert.throws(() => loadConfig({ MYTHUSO_IDENTITY_PROVIDER: 'accredited-provider' } as NodeJS.ProcessEnv), /MYTHUSO_ENV is not set/);
  assert.equal(loadConfig({ MYTHUSO_ENV: ' Development ', MYTHUSO_IDENTITY_PROVIDER: 'accredited-provider' } as NodeJS.ProcessEnv).explicitDevelopment, true);
  assert.equal(loadConfig({} as NodeJS.ProcessEnv).explicitDevelopment, false);
  const production = { MYTHUSO_AUTH_PEPPER: 'x'.repeat(40), MYTHUSO_SMS_PROVIDER: 'test', MYTHUSO_ALLOWED_ORIGINS: 'https://mythuso.co.za', MYTHUSO_IDENTITY_SANDBOX: 'true' };
  for (const spelling of ['Production', ' PRODUCTION ', 'prod']) {
   assert.throws(() => loadConfig({ ...production, MYTHUSO_ENV: spelling } as NodeJS.ProcessEnv), /cannot be enabled in production/, spelling);
  }
 });

 test('a sandbox answer never reads as a confirmation against Home Affairs', async () => {
  const h = harness({ identity: { provider: 'accredited-provider' } });
  const session = await opened(h);
  const accepted = h.vault.acceptIdentityCallback({ reference: session.reference, ResultCode: 0 });
  assert.ok(accepted.ok, accepted.ok ? '' : accepted.reason);
  const standing = h.vault.standing('nurse-1')!;
  const identity = standing.checks.find(check => check.checkId === 'identity')!;
  assert.equal(identity.assurance.confirmed, false);
  assert.doesNotMatch(identity.assurance.sentence, /confirmed against/);
  assert.match(identity.assurance.sentence, /sandbox identity session/);
  assert.equal(standing.assurance.confirmed, 0);
 });
});
