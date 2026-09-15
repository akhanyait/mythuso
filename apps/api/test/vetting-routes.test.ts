/**
 * The gate over HTTP.
 *
 * Every other test of the vault calls the module. These call the service — a real socket, a real
 * session cookie, a real database — because docs/PRIVACY-AND-SECURITY.md's sharpest line was that
 * the gate was "a library with a test suite, not a running gate", and a library with a second test
 * suite would not have answered it.
 *
 * The founding pair are seeded the way an operator would: an authorisation minted at a console
 * against the same key ring the service is running on, spent through a vault built over the *same*
 * database handle the server is using. Everything after that goes over the wire, including the two
 * reviewers' own certificates — subject access needs no standing, which is the whole reason a person
 * whose clearance has lapsed can still upload the new one.
 *
 * The party ids are the account ids. That is not a coincidence to be tidied up later: it is what
 * makes the actor unforgeable, because the id the gate is handed comes off the session cookie and
 * nothing on a request can name a different one. See apps/api/src/actor.ts.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { openStore, type Store } from '../src/store.ts';
import { loadConfig } from '../src/config.ts';
import { createProtectionModule, mintBootstrapAuthorisation } from '../src/protection/index.ts';
import { SEALED_COLUMNS, VettingVault, openVettingStore, roleChecks, vettingSource } from '../src/vetting/index.ts';
import catalogue from '../../../packages/catalog/vetting.json' with { type: 'json' };

const ORIGIN = 'http://localhost:5173';
const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'v'.repeat(40),
  MYTHUSO_PROTECTION_KEYS: `1:${'b3'.repeat(32)}`, MYTHUSO_PROTECTION_INDEX_VERSION: '1'
} as NodeJS.ProcessEnv);

const TODAY = new Date().toISOString().slice(0, 10);
/* A string nothing else in this repository contains, so "the document came back" is a claim about
   the bytes rather than about a phrase the catalogue also uses. */
const SENTINEL = 'clearance-over-http-6b1d09';
const PDF = Buffer.from(`%PDF-1.4 fictional clearance. ${SENTINEL}`);

let server: Server, store: Store, base: string, vault: VettingVault;
/* The account ids of the two founding reviewers and the nurse they clear, filled in by before(). */
const person: Record<string, string> = {};
const cookie: Record<string, string> = {};

const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
  ...init, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(init.headers ?? {}) }
});
const as = (who: string, path: string, body?: unknown) => call(path, {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  headers: { cookie: cookie[who]! }
});

async function signIn(who: string, phone: string) {
  const started = await call('/auth/start', { method: 'POST', body: JSON.stringify({ phone }) });
  const { challengeId, developmentCode } = await started.json() as { challengeId: string; developmentCode: string };
  const verified = await call('/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId, code: developmentCode }) });
  const body = await verified.json() as { person: { id: string } };
  cookie[who] = (verified.headers.get('set-cookie') ?? '').split(';')[0]!;
  person[who] = body.person.id;
}

before(async () => {
  store = openStore(':memory:');
  server = createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  await signIn('one', '0821110001');
  await signIn('two', '0821110002');
  await signIn('nurse', '0821110003');
  await signIn('patient', '0821110004');

  /* The console side: the same database handle, so what the ceremony seeds is what the running
     service reads back. Nothing here is a stub — a real key, a real gate, a real chain. */
  const vettingStore = openVettingStore(store.database);
  const protection = createProtectionModule(config, store.database, {
    vetting: vettingSource(vettingStore), releases: { find: () => null }, sealedColumns: SEALED_COLUMNS
  })!;
  vault = new VettingVault({ gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store: vettingStore });

  const parties = [{ id: person.one!, roleId: 'admin' }, { id: person.two!, roleId: 'admin' }];
  const mint = () => mintBootstrapAuthorisation(config, { parties, decidedBy: 'founder', secondedBy: 'director' }).token;
  const seeding = vault.openBootstrap(mint());
  for (const party of parties) seeding.seed(party);
  seeding.close();

  /* Their own certificates go in over HTTP, as themselves. */
  for (const who of ['one', 'two']) {
    for (const check of roleChecks('admin')) {
      const response = await as(who, '/vetting/evidence', {
        checkId: check.id, filename: `${check.id}.pdf`, document: PDF.toString('base64'), issuedOn: TODAY
      });
      assert.equal(response.status, 200, `${who} could not submit ${check.id}: ${await response.text()}`);
    }
  }
  /* And only the decision on those first checks is taken by hand, by the two people the
     authorisation names, neither of whom is a party. */
  const deciding = vault.openBootstrap(mint());
  for (const party of parties) for (const check of roleChecks('admin')) deciding.decide(party.id, check.id, { issuedOn: TODAY });
  deciding.close();
});
after(() => { server.close(); store.close(); });

describe('a route reaches the vault, and it is the session that says who is asking', () => {
  test('a signed-in patient is told the register holds nothing about them, in a sentence', async () => {
    const response = await as('patient', '/vetting/me');
    assert.equal(response.status, 403);
    const body = await response.json() as { error: string; message: string };
    assert.equal(body.error, 'not-on-the-vetting-register');
    assert.match(body.message, /vetting register simply holds no record of you/);
    /* Not an error, and it does not read like one: this is nearly every account on the platform. */
    assert.doesNotMatch(body.message, /forbidden|denied|invalid/i);
  });

  test('a reviewer reads their own standing and it is cleared', async () => {
    const body = await (await as('one', '/vetting/me')).json() as { standing: { cleared: boolean }; checks: unknown[]; assurance: { sentence?: string } };
    assert.equal(body.standing.cleared, true);
    assert.equal(body.checks.length, roleChecks('admin').length);
  });

  test('the whole lifecycle runs over the wire: enrol, submit, decide, second, open', async () => {
    const enrolled = await as('one', '/vetting/parties', { id: person.nurse, roleId: 'nurse', reference: 'SANC 20014477' });
    assert.equal(enrolled.status, 200, await enrolled.text());

    /* The nurse submits her own, which is subject access and needs no standing — she has none yet. */
    for (const check of roleChecks('nurse')) {
      const submitted = await as('nurse', '/vetting/evidence', {
        checkId: check.id, filename: `${check.id}.pdf`, document: PDF.toString('base64'), issuedOn: TODAY
      });
      assert.equal(submitted.status, 200, `${check.id}: ${await submitted.text()}`);
    }
    const before = await (await as('nurse', '/vetting/me')).json() as { standing: { cleared: boolean } };
    assert.equal(before.standing.cleared, false, 'a submitted document is not a decision');

    const seen = await (await as('one', `/vetting/party?id=${person.nurse}`)).json() as { checks: { evidenceId: string; checkId: string; risk: string }[] };
    for (const check of seen.checks) {
      const decided = await as('one', '/vetting/evidence/decide', { evidenceId: check.evidenceId, decision: 'verified', issuedOn: TODAY });
      assert.equal(decided.status, 200, `${check.checkId}: ${await decided.text()}`);
    }
    /* Verified by one reviewer and still not cleared: the high-risk checks are waiting for a second. */
    const half = await (await as('nurse', '/vetting/me')).json() as { standing: { cleared: boolean; awaitingSecond: string[] } };
    assert.equal(half.standing.cleared, false);
    assert.ok(half.standing.awaitingSecond.length > 0);

    for (const check of seen.checks.filter(candidate => candidate.risk === 'high')) {
      const seconded = await as('two', '/vetting/evidence/second', { evidenceId: check.evidenceId });
      assert.equal(seconded.status, 200, `${check.checkId}: ${await seconded.text()}`);
    }
    const after = await (await as('nurse', '/vetting/me')).json() as { standing: { cleared: boolean } };
    assert.equal(after.standing.cleared, true);

    /* And the document comes back out through the gate, byte for byte. */
    const first = seen.checks[0]!;
    const opened = await as('one', '/vetting/evidence/open', { evidenceId: first.evidenceId, version: 1 });
    assert.equal(opened.status, 200);
    const document = await opened.json() as { document: string; contentHash: string };
    assert.equal(Buffer.from(document.document, 'base64').toString('utf8'), PDF.toString('utf8'));
  });

  test('the audit id is on the answer, so a read can be found in the chain afterwards', async () => {
    const response = await as('one', `/vetting/party?id=${person.nurse}`);
    assert.match(response.headers.get('x-mythuso-audit') ?? '', /^[0-9a-f-]{36}$/);
  });
});

describe('what the routes refuse, in the contract\'s own words', () => {
  test('a nurse may not read another party\'s standing', async () => {
    const response = await as('nurse', `/vetting/party?id=${person.one}`);
    assert.equal(response.status, 403);
    const body = await response.json() as { message: string; blockedBy: string[] };
    /* The catalogue's own refusal sentence for the role, word for word, and the stage that refused. */
    assert.match(body.message, /never granted/i);
    assert.equal(body.blockedBy[0], 'capability');
  });

  test('nobody decides their own vetting, even holding the reviewer role', async () => {
    const mine = await (await as('one', '/vetting/me')).json() as { checks: { evidenceId: string }[] };
    const response = await as('one', '/vetting/evidence/decide', { evidenceId: mine.checks[0]!.evidenceId, decision: 'verified' });
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /Nobody decides their own vetting/);
  });

  test('a second reviewer is a different person, and the route says so rather than shrugging', async () => {
    const seen = await (await as('one', `/vetting/party?id=${person.nurse}`)).json() as { checks: { evidenceId: string; risk: string; secondedBy: string | null }[] };
    const high = seen.checks.find(check => check.risk === 'high')!;
    const response = await as('one', '/vetting/evidence/second', { evidenceId: high.evidenceId });
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /A second reviewer is a different person/);
  });

  test('a submission with no file is refused before anything is stored', async () => {
    const response = await as('nurse', '/vetting/evidence', { checkId: roleChecks('nurse')[0]!.id, filename: 'x.pdf', document: '' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { message: string }).message, /An empty file is not evidence/);
  });

  test('a suspension is recorded with its reason, and it refuses at the gate rather than in the arithmetic', async () => {
    const suspended = await as('one', '/vetting/parties/suspend', { partyId: person.nurse, reason: 'A complaint is being looked into.' });
    assert.equal(suspended.status, 200);
    const after = await (await as('nurse', '/vetting/me')).json() as { standing: { cleared: boolean }; party: { suspendedReason: string } };
    assert.equal(after.party.suspendedReason, 'A complaint is being looked into.');
    /* Deliberately asserted rather than assumed: `standingOf` answers whether the *checks* pass, and
       a suspension is a person's decision sitting beside that arithmetic rather than inside it. The
       gate refuses on it at the vetting-standing stage, which is what the next test shows for a
       reviewer. Writing the two down separately is what stops somebody later reading a `cleared:
       true` on a suspended party as a bug and "fixing" it by folding the two together — at which
       point a suspension would start looking like a failed check to everybody reading a screen. */
    assert.equal(after.standing.cleared, true);

    /* And a suspension has to say why. The refusal is the vault's sentence, over HTTP. */
    const noReason = await as('one', '/vetting/parties/suspend', { partyId: person.two, reason: '  ' });
    assert.equal(noReason.status, 403);
    assert.match((await noReason.json() as { message: string }).message, /A suspension has to say why/);

    const restored = await as('one', '/vetting/parties/restore', { partyId: person.nurse });
    assert.equal(restored.status, 200);
  });

  test('a suspended reviewer loses the vault on the next request, by arithmetic', async () => {
    const suspended = await as('one', '/vetting/parties/suspend', { partyId: person.two, reason: 'Under review.' });
    assert.equal(suspended.status, 200);
    const response = await as('two', `/vetting/party?id=${person.nurse}`);
    assert.equal(response.status, 403);
    const body = await response.json() as { message: string; blockedBy: string[] };
    assert.equal(body.blockedBy[0], 'vetting-standing');
    assert.match(body.message, /Under review\./);
    await as('one', '/vetting/parties/restore', { partyId: person.two });
  });

  test('a role the catalogue does not have is refused with the file that would have to change', async () => {
    const response = await as('one', '/vetting/parties', { id: 'somebody-new', roleId: 'chiropractor' });
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /packages\/catalog\/vetting\.json has no role/);
  });
});

describe('what a party may not do to their own register entry', () => {
  /* The two reproductions the runtime lead found, as refusals. The nurse is the one the lifecycle test
     enrolled and cleared; she is on the register, signed in as herself, and nothing she sends names
     anybody but her. */
  test('a nurse cannot enrol herself as an admin, and her stored role does not change', async () => {
    const response = await as('nurse', '/vetting/parties', { id: person.nurse, roleId: 'admin' });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { message: string }).message, catalogue.selfActionRefusals.enrol);
    assert.equal(vault.standing(person.nurse!)!.party.roleId, 'nurse');
  });

  test('a suspended nurse cannot lift her own suspension, and stays suspended', async () => {
    const suspended = await as('one', '/vetting/parties/suspend', { partyId: person.nurse, reason: 'Synthetic suspension while a complaint is looked at.' });
    assert.equal(suspended.status, 200, await suspended.text());
    const response = await as('nurse', '/vetting/parties/restore', { partyId: person.nurse });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { message: string }).message, catalogue.selfActionRefusals.restore);
    assert.notEqual(vault.standing(person.nurse!)!.party.suspendedAt, null);
    /* And a reviewer still can, so the refusal is about who is asking rather than about the route. */
    assert.equal((await as('one', '/vetting/parties/restore', { partyId: person.nurse })).status, 200);
    assert.equal(vault.standing(person.nurse!)!.party.suspendedAt, null);
  });

  test('a reviewer cannot make a party a different role by enrolling them again', async () => {
    const response = await as('one', '/vetting/parties', { id: person.nurse, roleId: 'admin' });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { message: string }).message, catalogue.selfActionRefusals.alreadyEnrolled);
    assert.equal(vault.standing(person.nurse!)!.party.roleId, 'nurse');
  });

  test('the reviewer route reads somebody else\'s record; a party reading their own is sent to /vetting/me, and the refusal is audited', async () => {
    const refusals = () => (store.database.prepare('SELECT * FROM protected_access_log').all() as unknown[]).filter(row => JSON.stringify(row).includes('vetting.party.self.refused')).length;
    const before = refusals();
    const own = await as('nurse', `/vetting/party?id=${person.nurse}`);
    assert.equal(own.status, 403);
    assert.equal((await own.json() as { message: string }).message, catalogue.selfActionRefusals.readOwnThroughReviewerRoute);
    assert.equal(refusals() - before, 1);
    /* An admin reading their own record through it is refused the same way: the route is for somebody else's. */
    assert.equal((await as('one', `/vetting/party?id=${person.one}`)).status, 403);
    const reviewer = await as('one', `/vetting/party?id=${person.nurse}`);
    assert.equal(reviewer.status, 200, await reviewer.clone().text());
    assert.equal((await reviewer.json() as { party: { id: string } }).party.id, person.nurse);
    const mine = await as('nurse', '/vetting/me');
    assert.equal(mine.status, 200, await mine.clone().text());
    assert.equal((await mine.json() as { party: { id: string } }).party.id, person.nurse);
  });
});

describe('the health routes answer the loopback and nothing else', () => {
  test('a request that reaches them from the loopback is answered', async () => {
    const body = await (await call('/health/audit')).json() as Record<string, unknown>;
    assert.equal(body.configured, true);
    assert.equal(body.intact, true);
  });
  test('the chain carries the vetting decisions taken over HTTP', async () => {
    const body = await (await call('/health/audit')).json() as { length: number };
    assert.ok(body.length > roleChecks('nurse').length, 'the decisions taken over the wire are not in the chain');
  });
});
