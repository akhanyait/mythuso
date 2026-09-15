/**
 * The controls docs/PRIVACY-AND-SECURITY.md listed as absent, over HTTP.
 *
 * Export, correction, the operator queue with a proof of response, the security compromise register,
 * the loopback restriction on the health routes, and the caller limit. Every one of them is driven
 * through a socket rather than by calling the module, for the reason the document gives: a library
 * with a test suite is not a running control.
 *
 * The founding pair are seeded exactly as they are in vetting-routes.test.ts — at a console, with an
 * authorisation minted from the key ring — because the operator queue is worked by a cleared
 * reviewer and there is no way to become one without somebody outside the system deciding first.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { openStore, type Store } from '../src/store.ts';
import { limits, loadConfig } from '../src/config.ts';
import { createProtectionModule, mintBootstrapAuthorisation } from '../src/protection/index.ts';
import { SEALED_COLUMNS, VettingVault, openVettingStore, roleChecks, vettingSource } from '../src/vetting/index.ts';
import { FORBIDDEN_KEYS, forbiddenKeysIn } from '../src/subjectExport.ts';
import { RESPONSE_DAYS } from '../src/personalData.ts';
import { REFUSALS as INCIDENT_REFUSALS } from '../src/incidents.ts';

const ORIGIN = 'http://localhost:5173';
const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'p'.repeat(40),
  MYTHUSO_PROTECTION_KEYS: `1:${'c4'.repeat(32)}`, MYTHUSO_PROTECTION_INDEX_VERSION: '1'
} as NodeJS.ProcessEnv);
const TODAY = new Date().toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4 fictional clearance, privacy routes.');

let server: Server, store: Store, base: string;
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
  cookie[who] = (verified.headers.get('set-cookie') ?? '').split(';')[0]!;
  person[who] = (await verified.json() as { person: { id: string } }).person.id;
}

before(async () => {
  store = openStore(':memory:');
  server = createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  await signIn('officer', '0831110001');
  await signIn('second', '0831110002');
  await signIn('lerato', '0831110003');

  const vettingStore = openVettingStore(store.database);
  const protection = createProtectionModule(config, store.database, {
    vetting: vettingSource(vettingStore), releases: { find: () => null }, sealedColumns: SEALED_COLUMNS
  })!;
  const vault = new VettingVault({ gate: protection.gate, audit: protection.audit, bootstrap: protection.bootstrap, store: vettingStore });
  const parties = [{ id: person.officer!, roleId: 'admin' }, { id: person.second!, roleId: 'admin' }];
  const mint = () => mintBootstrapAuthorisation(config, { parties, decidedBy: 'founder', secondedBy: 'director' }).token;
  const seeding = vault.openBootstrap(mint());
  for (const party of parties) seeding.seed(party);
  seeding.close();
  for (const who of ['officer', 'second']) {
    for (const check of roleChecks('admin')) {
      await as(who, '/vetting/evidence', { checkId: check.id, filename: `${check.id}.pdf`, document: PDF.toString('base64'), issuedOn: TODAY });
    }
  }
  const deciding = vault.openBootstrap(mint());
  for (const party of parties) for (const check of roleChecks('admin')) deciding.decide(party.id, check.id, { issuedOn: TODAY });
  deciding.close();
});
after(() => { server.close(); store.close(); });

describe('the export', () => {
  test('it is the record rather than the list of boxes, and it says its own reach first', async () => {
    const response = await as('lerato', '/account/export', {});
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.match(String(body.scope), /no file, no link and no copy kept anywhere/);
    assert.match(String(body.scope), /holds no health information/);
    assert.equal((body.account as { phone: string }).phone, '+27831110003');
    /* The part of a subject access request somebody actually reads: where a sign-in they did not
       make would be. */
    assert.ok(Array.isArray(body.signInLog) && (body.signInLog as unknown[]).length > 0);
    assert.equal(typeof body.auditEntry, 'string');
    assert.equal(body.responseDays, RESPONSE_DAYS);
  });

  test('it carries nothing that is a key rather than information about a person', async () => {
    const body = await (await as('lerato', '/account/export', {})).json();
    const found = forbiddenKeysIn(body);
    assert.deepEqual(found, [], `the export carries ${found.join(', ')} — see NEVER_EXPORTED`);
    /* Asserted against the declaration rather than against a list retyped here, so a section added
       later is held to the same rule without this test being remembered. */
    assert.ok(FORBIDDEN_KEYS.includes('secret'));
  });

  test('it says what it left out, and why, rather than leaving somebody to notice', async () => {
    const body = await (await as('lerato', '/account/export', {})).json() as { neverIncluded: { what: string; because: string }[] };
    assert.equal(body.neverIncluded.length, 3);
    for (const excluded of body.neverIncluded) assert.ok(excluded.because.length > 60, excluded.what);
    assert.match(body.neverIncluded.map(entry => entry.what).join(' '), /authenticator app/);
  });

  test('there is nowhere on the request to name anybody else', async () => {
    /* The scope is the caller by construction. Naming somebody else changes nothing, which is the
       strongest form this can take: there is no id to ignore because there is no id. */
    const mine = await (await as('lerato', '/account/export', {})).json() as { account: { id: string } };
    const theirs = await (await as('lerato', '/account/export', { personId: person.officer, subjectId: person.officer })).json() as { account: { id: string } };
    assert.equal(theirs.account.id, mine.account.id);
    assert.notEqual(theirs.account.id, person.officer);
  });

  test('a reviewer\'s export carries the decisions on her checks and not the certificates', async () => {
    const body = await (await as('officer', '/account/export', {})).json() as { vetting: { checks: { checkId: string; versions: number }[] } | null };
    assert.ok(body.vetting, 'a vetted party is told about her own vetting');
    assert.equal(body.vetting!.checks.length, roleChecks('admin').length);
    assert.ok(body.vetting!.checks.every(check => typeof check.versions === 'number'), 'the count of documents, never the documents');
    assert.deepEqual(forbiddenKeysIn(body), []);
  });

  test('no session, no export', async () => {
    const response = await call('/account/export', { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
  });
});

describe('correction, which is not deletion', () => {
  test('a correction is opened, and it carries the thirty-day clock from receipt', async () => {
    const response = await as('lerato', '/account/correction', { field: 'name', shouldSay: 'Lerato Molefe', because: 'It is spelled with one t.' });
    assert.equal(response.status, 200);
    const body = await response.json() as { requestId: string; respondBy: number; requestedAt: number; responseDays: number };
    assert.equal(body.responseDays, RESPONSE_DAYS);
    assert.equal(Math.round((body.respondBy - body.requestedAt) / 86_400_000), RESPONSE_DAYS);
  });

  test('the mobile number is refused, because it is the account rather than a detail on it', async () => {
    const response = await as('lerato', '/account/correction', { field: 'phone', shouldSay: '0831119999', because: 'Wrong number.' });
    assert.equal(response.status, 400);
    const body = await response.json() as { message: string };
    assert.match(body.message, /it is the account/);
    /* And it says what to do instead, which is the half a refusal usually leaves out. */
    assert.match(body.message, /ask to be erased, and sign up again/);
  });

  test('the append-only logs are refused, and the note is offered in the same breath', async () => {
    const response = await as('lerato', '/account/correction', { field: 'audit', shouldSay: 'It was not me', because: 'I did not sign in that night.' });
    assert.equal(response.status, 400);
    const body = await response.json() as { message: string; noteOffered: boolean };
    assert.equal(body.noteOffered, true);
    assert.match(body.message, /section 24\(2\)\(c\)/);
    assert.match(body.message, /your own account of it is attached/);
  });

  test('a request that says neither what is wrong nor what it should say is refused', async () => {
    for (const attempt of [{ field: 'name', shouldSay: '', because: 'x' }, { field: 'name', shouldSay: 'y', because: '' }, { field: '', shouldSay: 'y', because: 'x' }]) {
      const response = await as('lerato', '/account/correction', attempt);
      assert.equal(response.status, 400, JSON.stringify(attempt));
      assert.match((await response.json() as { message: string }).message, /nothing MyThuso can carry out and nothing it can honestly refuse/);
    }
  });

  test('the person can read their own requests, and what cannot be corrected, before they type', async () => {
    const body = await (await as('lerato', '/account/correction')).json() as { requests: unknown[]; whatCannotBeCorrected: string[] };
    assert.equal(body.requests.length, 1);
    assert.equal(body.whatCannotBeCorrected.length, 2);
  });
});

describe('the operator queue, and the proof that somebody answered', () => {
  test('a person who is not on the register cannot see it', async () => {
    const response = await as('lerato', '/operator/requests');
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: string }).error, 'not-on-the-vetting-register');
  });

  test('the queue lists what is outstanding, when it is due, and how much is late', async () => {
    /* Asking to be erased signs you out of every phone you are signed in on, immediately, and that
       is the whole point of it — so the session has to be established again before the tests below
       can go on being about this person. The request itself stands; only the session went. */
    await as('lerato', '/account/erasure', {});
    await signIn('lerato', '0831110003');
    const body = await (await as('officer', '/operator/requests')).json() as {
      entries: { kind: string; about: string; daysLeft: number; overdue: boolean }[];
      outstanding: number; overdue: number; nobodyIsPaged: string;
    };
    assert.equal(body.outstanding, 2, 'a correction and an erasure, both under section 24');
    assert.deepEqual([...new Set(body.entries.map(entry => entry.kind))].sort(), ['correction', 'erasure']);
    assert.equal(body.overdue, 0);
    for (const entry of body.entries) assert.equal(entry.daysLeft, RESPONSE_DAYS);
    /* Said on the response rather than only in a document: a queue that implied it alerted somebody
       would be worse than no queue. */
    assert.match(body.nobodyIsPaged, /Nothing here notifies anybody/);
  });

  test('it holds no name and no number — ids, dates and a field name', async () => {
    const body = await (await as('officer', '/operator/requests')).json();
    assert.doesNotMatch(JSON.stringify(body), /\+27/, 'a mobile number reached the queue');
    assert.doesNotMatch(JSON.stringify(body), /Lerato/, 'a name reached the queue');
  });

  test('a response is recorded with a named author and an entry in the chain', async () => {
    const queue = await (await as('officer', '/operator/requests')).json() as { entries: { kind: string; requestId: string }[] };
    const correction = queue.entries.find(entry => entry.kind === 'correction')!;
    const response = await as('officer', '/operator/requests/respond', {
      kind: 'correction', requestId: correction.requestId, outcome: 'corrected',
      response: 'Your name is now spelled as you asked. Nothing else about your account has changed.'
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { outcome: string; audit: string; noteAttached: boolean };
    assert.equal(body.outcome, 'corrected');
    assert.equal(body.noteAttached, false);
    assert.match(body.audit, /^[0-9a-f-]{36}$/);

    /* And the person sees the answer, with the name of who gave it, in their own export. */
    const mine = await (await as('lerato', '/account/correction')).json() as { answers: { answeredBy: string; outcome: string; response: string }[] };
    assert.equal(mine.answers.length, 1);
    assert.equal(mine.answers[0]!.answeredBy, person.officer);
    assert.match(mine.answers[0]!.response, /now spelled as you asked/);
  });

  test('the same request is not answered twice, because an answer is never edited', async () => {
    const done = await (await as('lerato', '/account/correction')).json() as { requests: { id: string }[] };
    const again = await as('officer', '/operator/requests/respond', {
      kind: 'correction', requestId: done.requests[0]!.id, outcome: 'refused', response: 'Actually, no.'
    });
    assert.equal(again.status, 409);
    assert.match((await again.json() as { message: string }).message, /An answer is a line of its own and is never edited/);
  });

  test('nobody answers their own request', async () => {
    await as('officer', '/account/correction', { field: 'name', shouldSay: 'A. Officer', because: 'Initial only.' });
    const queue = await (await as('second', '/operator/requests')).json() as { entries: { kind: string; requestId: string; personId: string }[] };
    const own = queue.entries.find(entry => entry.personId === person.officer && entry.kind === 'correction')!;
    const response = await as('officer', '/operator/requests/respond', {
      kind: 'correction', requestId: own.requestId, outcome: 'corrected', response: 'Done it myself.'
    });
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /Nobody answers their own request/);
    /* And somebody else may. */
    const other = await as('second', '/operator/requests/respond', {
      kind: 'correction', requestId: own.requestId, outcome: 'noted',
      response: 'The record stands and your own account of it is attached to it.'
    });
    assert.equal(other.status, 200);
    assert.equal((await other.json() as { noteAttached: boolean }).noteAttached, true);
  });

  test('an answer with nothing in it proves a date and nothing else, so it is refused', async () => {
    const response = await as('officer', '/operator/requests/respond', { kind: 'erasure', requestId: person.lerato, outcome: 'corrected', response: '   ' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { message: string }).message, /proves a date and nothing else/);
  });

  test('a suspended reviewer loses the queue on the next request', async () => {
    await as('second', '/vetting/parties/suspend', { partyId: person.officer, reason: 'Under review.' });
    const response = await as('officer', '/operator/requests');
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /Under review\./);
    await as('second', '/vetting/parties/restore', { partyId: person.officer });
    assert.equal((await as('officer', '/operator/requests')).status, 200);
  });
});

describe('the security compromise register', () => {
  test('anybody MyThuso vets may open one, and nothing about their standing is asked', async () => {
    await as('second', '/vetting/parties/suspend', { partyId: person.officer, reason: 'Under review.' });
    const response = await as('officer', '/incidents', {
      kind: 'lost-device', whatHappened: 'A work phone was left in a taxi in Braamfontein and has not been recovered.',
      informationReached: true, peopleAffected: 4
    });
    assert.equal(response.status, 200, 'a suspended party must still be able to report');
    await as('second', '/vetting/parties/restore', { partyId: person.officer });
    const body = await response.json() as { incidentId: string; notificationOwed: boolean; notificationRule: string };
    assert.equal(body.notificationOwed, true);
    assert.match(body.notificationRule, /names no number of days/);
  });

  test('a patient is not a party and cannot open one', async () => {
    const response = await as('lerato', '/incidents', { kind: 'other', whatHappened: 'Something.', informationReached: false });
    assert.equal(response.status, 403);
  });

  test('a kind nobody defined is refused, and the refusal says what to use instead', async () => {
    const response = await as('officer', '/incidents', { kind: 'catastrophe', whatHappened: 'Everything.', informationReached: false });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { message: string }).message, /Something else worth recording/);
  });

  test('nothing is closed before it is contained, and nothing that reached information before both were told', async () => {
    const opened = await (await as('officer', '/incidents')).json() as { incidents: { id: string; informationReached: boolean }[] };
    const id = opened.incidents.find(incident => incident.informationReached)!.id;

    const early = await as('officer', '/incidents/close', { incidentId: id });
    assert.equal(early.status, 409);
    assert.match((await early.json() as { message: string }).message, /Nothing is closed before it is contained/);

    assert.equal((await as('officer', '/incidents/contain', { incidentId: id, containment: 'The phone was wiped remotely and its sessions revoked.' })).status, 200);

    const stillOwed = await as('officer', '/incidents/close', { incidentId: id });
    assert.equal(stillOwed.status, 409);
    assert.match((await stillOwed.json() as { message: string }).message, /the Information Regulator and every affected person to be told/);

    /* One of the two is not the duty. This is the refusal that matters most in the file. */
    assert.equal((await as('officer', '/incidents/notified', { incidentId: id, who: 'regulator' })).status, 200);
    const halfway = await as('officer', '/incidents/close', { incidentId: id });
    assert.equal(halfway.status, 409, 'telling the Regulator alone closed it');

    assert.equal((await as('officer', '/incidents/notified', { incidentId: id, who: 'subjects' })).status, 200);
    const closed = await as('officer', '/incidents/close', { incidentId: id });
    assert.equal(closed.status, 200);
    assert.equal((await as('officer', '/incidents/close', { incidentId: id })).status, 409);
  });

  test('an incident that reached nothing needs only containment', async () => {
    const opened = await (await as('officer', '/incidents', {
      kind: 'availability', whatHappened: 'The service was unreachable for eleven minutes during a restart.', informationReached: false
    })).json() as { incidentId: string; notificationOwed: boolean };
    assert.equal(opened.notificationOwed, false);
    await as('officer', '/incidents/contain', { incidentId: opened.incidentId, containment: 'The service came back on its own; the restart is now staged.' });
    assert.equal((await as('officer', '/incidents/close', { incidentId: opened.incidentId })).status, 200);
  });

  test('the register holds no name and nowhere one could be written', async () => {
    const body = await (await as('officer', '/incidents')).json() as { incidents: Record<string, unknown>[]; owedNotification: number };
    for (const incident of body.incidents) {
      assert.equal('personId' in incident, false);
      assert.equal('phone' in incident, false);
      assert.equal(typeof incident.peopleAffected === 'number' || incident.peopleAffected === null, true);
    }
    assert.equal(body.owedNotification, 0);
  });

  test('containment has to say what stopped it', async () => {
    const opened = await (await as('officer', '/incidents', { kind: 'other', whatHappened: 'A courier bag was found unsealed.', informationReached: false })).json() as { incidentId: string };
    const response = await as('officer', '/incidents/contain', { incidentId: opened.incidentId, containment: '  ' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { message: string }).message, /a tick rather than a record/);
  });
});

describe('who may record that an incident was contained', () => {
  /* Reporting is open to every vetted party; recording containment is the reporter's, or a reviewer's
     holding review-vetting. A sponsor marking a nurse's incident dealt with, and a nurse marking a
     report she did not make, are the two refusals the reviewer found could happen. */
  test('the reporter and a reviewer may; another vetted party and the reporter of a different incident may not, and each refusal is in the chain', async () => {
    await signIn('carer', '0831110011');
    await signIn('payer', '0831110012');
    const nurse = await as('officer', '/vetting/parties', { id: person.carer, roleId: 'nurse', reference: 'SANC 20014477' });
    assert.equal(nurse.status, 200, await nurse.text());
    const sponsor = await as('officer', '/vetting/parties', { id: person.payer, roleId: 'sponsor' });
    assert.equal(sponsor.status, 200, await sponsor.text());
    const open = async (who: string) => {
      const response = await as(who, '/incidents', { kind: 'lost-device', whatHappened: 'A work phone was left in a taxi.', informationReached: false });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json() as { incidentId: string }).incidentId;
    };
    const carers = await open('carer');
    const payers = await open('payer');
    const untouched = await open('carer');
    const refusedBefore = (store.database.prepare('SELECT * FROM protected_access_log').all() as unknown[]).filter(row => JSON.stringify(row).includes('incident.contain.refused')).length;

    const stranger = await as('payer', '/incidents/contain', { incidentId: carers, containment: 'Marked as wiped remotely.' });
    assert.equal(stranger.status, 403);
    assert.equal((await stranger.json() as { message: string }).message, INCIDENT_REFUSALS.notYours);
    const otherReporter = await as('carer', '/incidents/contain', { incidentId: payers, containment: 'Marked as recovered.' });
    assert.equal(otherReporter.status, 403);
    assert.equal((await otherReporter.json() as { message: string }).message, INCIDENT_REFUSALS.notYours);

    assert.equal((await as('carer', '/incidents/contain', { incidentId: carers, containment: 'The phone was recovered and its sessions revoked.' })).status, 200);
    assert.equal((await as('officer', '/incidents/contain', { incidentId: payers, containment: 'An operator revoked the sessions the lost phone held.' })).status, 200);

    const refusals = (store.database.prepare('SELECT * FROM protected_access_log').all() as unknown[]).filter(row => JSON.stringify(row).includes('incident.contain.refused'));
    assert.equal(refusals.length - refusedBefore, 2);
    const listed = await (await as('officer', '/incidents')).json() as { incidents: { id: string; containment: string | null }[] };
    const byId = new Map(listed.incidents.map(incident => [incident.id, incident] as const));
    assert.equal(byId.get(carers)!.containment, 'The phone was recovered and its sessions revoked.');
    assert.equal(byId.get(payers)!.containment, 'An operator revoked the sessions the lost phone held.');
    assert.equal(byId.get(untouched)!.containment, null);
  });
});

describe('the carer and the Head of Operations report incidents', () => {
  /* POST /v1/safety/incidents@2 takes calls from every role on the vetting register as it stands. The
     identity service works that out from the register itself, so the two roles that joined it on 15 September
     2026 report exactly as a nurse does: enrolled by a reviewer, with nothing about their standing asked. A
     carer in somebody's home is the person most likely to see a phone left open. Placed before the caller
     limit is driven to its refusal, which would otherwise answer these writes. */
  test('a carer and a Head of Operations each open an incident as soon as a reviewer has enrolled them', async () => {
    await signIn('home-carer', '0831110021');
    await signIn('head-ops', '0831110022');
    for (const [who, roleId] of [['home-carer', 'carer'], ['head-ops', 'head-of-operations']] as const) {
      const enrolled = await as('officer', '/vetting/parties', { id: person[who], roleId });
      assert.equal(enrolled.status, 200, await enrolled.text());
      const response = await as(who, '/incidents', { kind: 'lost-device', whatHappened: 'A work phone was left on a patient’s kitchen table overnight.', informationReached: false });
      assert.equal(response.status, 200, `a ${roleId} could not report: ${await response.clone().text()}`);
      assert.equal((await response.json() as { notificationOwed: boolean }).notificationOwed, false);
    }
  });

  test('neither reads the register, which stays a reviewer’s', async () => {
    for (const who of ['home-carer', 'head-ops']) {
      assert.equal((await as(who, '/incidents')).status, 403, `${who} read the incident register`);
    }
  });
});

describe('the routes that could be declared and now cannot', () => {
  test('a person cannot record that a nurse read a consent aloud to them', async () => {
    const contract = await (await call('/consent/contract')).json() as { required: { id: string; current: { version: number } }[] };
    const purpose = contract.required[0]!;
    for (const route of ['spoken-at-visit', 'paper-at-corner', 'guardian']) {
      const response = await as('lerato', '/consent/give', { purposeId: purpose.id, version: purpose.current.version, route });
      assert.equal(response.status, 403, route);
      const body = await response.json() as { error: string; message: string; route: { name: string } };
      assert.equal(body.error, 'route-not-yours-to-declare');
      assert.match(body.message, /somebody else's act, not yours/);
      /* The contract's own words for the route come back with the refusal, so a surface can say
         what the route is rather than only that it is unavailable. */
      assert.ok(body.route.name.length > 0);
    }
    /* And the one route a person can honestly declare about themselves still works. */
    assert.equal((await as('lerato', '/consent/give', { purposeId: purpose.id, version: purpose.current.version, route: 'web-account' })).status, 200);
  });
});

describe('the health routes, and the caller limit', () => {
  test('the loopback is answered', async () => {
    for (const path of ['/health/audit', '/health/access-log', '/health/verification']) {
      assert.equal((await call(path)).status, 200, path);
    }
    /* `GET /health` itself is not one of them: it says what the service holds and is a public fact. */
    assert.equal((await call('/health')).status, 200);
  });

  test('a caller that goes past the limit is refused, and told nothing has been lost', async () => {
    /* Deliberately a caller with no session, so the limit is keyed on the address and this cannot
       spend the allowance of any account the tests above are using. */
    let refused: Response | null = null;
    for (let attempt = 0; attempt <= limits.writesPerCallerPerWindow + 1; attempt += 1) {
      const response = await call('/account/name', { method: 'POST', body: JSON.stringify({ name: 'x' }) });
      if (response.status === 429) { refused = response; break; }
      assert.equal(response.status, 401, 'an unauthenticated write should be a 401 until the limiter fires');
    }
    assert.ok(refused, `nothing was refused within ${limits.writesPerCallerPerWindow + 2} attempts`);
    const body = await refused!.json() as { error: string; message: string };
    assert.equal(body.error, 'too-many-requests');
    assert.match(body.message, new RegExp(`more than ${limits.writesPerCallerPerWindow} requests`));
    assert.match(body.message, /Nothing has been lost/);
    assert.equal(refused!.headers.get('retry-after'), String(limits.rateWindowSeconds));
  });
});
