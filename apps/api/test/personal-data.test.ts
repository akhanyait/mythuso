import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { openStore, type Store } from '../src/store.ts';
import { Identity, normalisePhone } from '../src/identity.ts';
import { TwoFactor } from '../src/twoFactor.ts';
import { totp } from '../src/totp.ts';
import { Erasure, GRACE_DAYS, isTombstone, tombstone } from '../src/erasure.ts';
import { sweep, print } from '../src/retention.ts';
import { basisById, clinicalRetentionRules, daysRemaining, disposalDate, dueBy, erasureSummary, HOLDINGS, RESPONSE_DAYS, RETENTION_BASES, SCOPE_STATEMENT, holdings, retainedHoldings } from '../src/personalData.ts';
import { createProtectionModule } from '../src/protection/index.ts';
import { openVettingStore } from '../src/vetting/index.ts';
import { openCaptureStore } from '../src/capture/index.ts';
import { openConsentStore } from '../src/consent/index.ts';
import { openSubjectRequestStore } from '../src/subjectRequests.ts';
import { openIncidentStore } from '../src/incidents.ts';

const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'p'.repeat(40),
  MYTHUSO_ENCRYPTION_KEY: randomBytes(32).toString('hex')
} as NodeJS.ProcessEnv);
const caller = { address: '10.0.0.1', agent: 'test' };
const DAY = 86_400_000;

function harness() {
  let clock = Date.UTC(2026, 8, 6, 9, 0, 0);
  const store: Store = openStore(':memory:');
  const now = () => clock;
  const twoFactor = new TwoFactor(store, config, now);
  const identity = new Identity(store, config, now, twoFactor);
  const erasure = new Erasure(store, now);
  const signIn = (phone = '0821234567') => {
    const started = identity.start(phone, caller);
    assert.ok(started.ok && started.code);
    const verified = identity.verify(started.challengeId, started.code, caller);
    assert.ok(verified.ok && verified.step === 'signed-in');
    return verified;
  };
  return { store, identity, twoFactor, erasure, signIn, now, advance: (ms: number) => { clock += ms; } };
}

describe('the holdings register', () => {
  test('every holding says what it is, where it is, and why — in words for the person', () => {
    for (const holding of HOLDINGS) {
      assert.ok(holding.label.length > 3, holding.table);
      assert.ok(holding.table.length > 0, holding.label);
      assert.ok(holding.because.length > 40, `${holding.label} needs a reason a person could read`);
      assert.ok(!/\b(row|column|foreign key|nullable|schema)\b/i.test(holding.because),
        `${holding.label} is explained to a developer rather than to the person`);
    }
  });
  test('it names every table the service actually has, and none it does not', () => {
    /* A register is only worth anything if it is checked against the schema. Listing a table that
       does not exist promises to delete something that was never there; missing one quietly holds
       information nobody was told about.

       Every module that owns tables in this database gets to create them first, which is the point:
       identity is no longer the only one, and a register checked against identity's schema alone
       would have stopped noticing the moment the second module landed. */
    const path = join(mkdtempSync(join(tmpdir(), 'mythuso-')), 'identity.db');
    const store = openStore(path);
    openVettingStore(store.database);
    openCaptureStore(store.database);
    openConsentStore(store.database);
    openSubjectRequestStore(store.database);
    openIncidentStore(store.database);
    createProtectionModule({ environment: 'development', protectionKeys: `1:${randomBytes(32).toString('hex')}` }, store.database, {
      vetting: { find: () => null }, releases: { find: () => null }
    });
    store.close();
    const database = new DatabaseSync(path);
    const actual = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as unknown as { name: string }[])
      .map(row => row.name);
    database.close();
    const named = new Set(HOLDINGS.flatMap(h => h.table.split(',').map(t => t.trim().split('.')[0]!)));
    for (const table of actual) assert.ok(named.has(table), `${table} holds something and the register does not mention it`);
    for (const table of named) assert.ok(actual.includes(table), `the register names ${table}, which this service does not have`);
  });
  test('it is honest that there is no health information here', () => {
    assert.match(SCOPE_STATEMENT, /holds no health information/);
    for (const holding of HOLDINGS) {
      assert.ok(!/\b(visit|result|prescription|observation)\b.*\bstored\b/i.test(holding.because), holding.label);
    }
  });
  test('anything kept is kept with a ground, which is what POPIA asks for', () => {
    /* Asked as a vetted party, because that is the person with the most kept from them. */
    const summary = erasureSummary({ vetted: true });
    assert.match(summary, /POPIA requires a ground/);
    for (const kept of holdings('retain')) assert.ok(summary.includes(kept.because), kept.label);
    assert.equal(holdings('erase').length + holdings('anonymise').length + holdings('retain').length, HOLDINGS.length);
  });
  test('every holding is kept on a ground that is actually in the register', () => {
    /* A holding whose basis nobody wrote down is a holding nobody can justify, and the place that
       shows up is a subject access request rather than a test. */
    for (const holding of HOLDINGS) {
      const basis = basisById(holding.basis);
      assert.ok(basis, `${holding.table} names retention basis "${holding.basis}", which does not exist`);
      assert.ok(basis.authority.length > 20, `${basis.id} does not name the instrument it rests on`);
      assert.ok(basis.note.length > 20, `${basis.id} does not say which part of it is MyThuso's own choice`);
    }
  });
  test('the clinical retention rules are written down and hold nothing at all', () => {
    /* Both halves matter. "No clinical record exists here" and "erasure would reach a clinical
       record" are different statements, and only the first one is true. */
    const clinical = RETENTION_BASES.filter(basis => !basis.inUse);
    assert.ok(clinical.length >= 3);
    for (const basis of clinical) {
      assert.ok(basis.conflictsWithErasure, `${basis.id} is a retention rule that does not pull against section 24, which would make it a strange thing to list`);
      assert.ok(!HOLDINGS.some(holding => holding.basis === basis.id), `${basis.id} is marked as holding nothing and something is held on it`);
    }
    const sixYears = RETENTION_BASES.find(basis => basis.id === 'health-record')!;
    assert.equal(sixYears.years, 6);
    assert.equal(sixYears.anchor, 'last-entry', 'six years from the last entry, not from the visit and not from the request');
    assert.equal(RETENTION_BASES.find(basis => basis.id === 'health-record-minor')!.anchor, 'age-of-majority');
    assert.equal(RETENTION_BASES.find(basis => basis.id === 'health-record-extended')!.years, null,
      'a period that differs by regulation is left null rather than guessed at');
  });
  test('a disposal date is derived where it can be, and refused where it cannot', () => {
    const at = Date.UTC(2026, 8, 1);
    const proof = basisById('proof-of-request')!;
    const disposal = disposalDate(proof, at)!;
    assert.ok(disposal > at + 1000 * DAY && disposal < at + 1100 * DAY, 'three years from the request');
    /* The three honest nulls: no period, no anchor this service can compute, and no end at all. */
    assert.equal(disposalDate(basisById('health-record-minor')!, at), null);
    assert.equal(disposalDate(basisById('health-record')!, null), null, 'no last entry means no date, rather than today plus six years');
    assert.equal(disposalDate(basisById('audit-integrity')!, at), null);
  });
  test('a patient is not told about certificates they have never submitted', () => {
    const at = Date.UTC(2026, 8, 1);
    const patient = retainedHoldings({ requestedAt: at }, { vetted: false });
    assert.ok(!patient.some(entry => entry.holding.table.startsWith('vetting_')));
    const nurse = retainedHoldings({ requestedAt: at, partyInactiveAt: at }, { vetted: true });
    assert.ok(nurse.some(entry => entry.holding.table === 'vetting_evidence_versions'));
  });
  test('the response clock runs from when the request arrived', () => {
    const received = Date.UTC(2026, 8, 1);
    assert.equal(RESPONSE_DAYS, 30);
    assert.equal(dueBy(received), received + 30 * DAY);
    assert.equal(daysRemaining(dueBy(received), received), 30);
    assert.equal(daysRemaining(dueBy(received), received + 31 * DAY), -1, 'late is a negative number, not a zero');
  });
});

describe('an erasure that cannot erase everything', () => {
  test('says so, names the ground, and gives the date it stops applying', () => {
    const h = harness();
    const person = h.signIn().person;
    /* Standing in for the vetting vault: something in the platform holds evidence it may not delete.
       erasure.ts is told rather than knowing, which is why it holds no opinion about vetting. */
    const erasure = new Erasure(h.store, h.now, [{
      retainedFor: () => [{
        what: 'The vetting evidence held about you as a Registered nurse',
        because: 'MyThuso has to be able to show who was cleared to attend a visit, on what evidence, and who agreed to it.'
      }]
    }]);
    const plan = erasure.request(person.id, caller);
    assert.equal(plan.alsoRetained.length, 1);
    assert.match(plan.summary, /vetting evidence held about you/);
    /* The word that has to be in it. A partial refusal described only as "kept" is a refusal the
       person never realises they could take anywhere. */
    assert.match(plan.summary, /partial refusal of your request/);
    assert.match(plan.summary, /Information Regulator/);
    assert.match(plan.summary, /section 24/);
    assert.match(plan.summary, /section 14/);
    const evidence = plan.retained.find(entry => entry.holding.table === 'vetting_evidence_versions');
    assert.ok(evidence, 'a nurse is told about the certificates, in the register as well as in the prose');
    assert.equal(evidence.basis.conflictsWithErasure, true);
    assert.ok(evidence.disposalOn && evidence.disposalOn > plan.requestedAt, 'a ground that never ends is not a ground, it is a keep');
    assert.match(plan.summary, /disposed of on or after/);
  });
  test('a patient with nothing held against them gets no refusal paragraph at all', () => {
    const h = harness();
    const person = h.signIn().person;
    const plan = h.erasure.plan(h.now(), person.id);
    assert.equal(plan.alsoRetained.length, 0);
    assert.ok(!plan.holdings.some(holding => holding.table.startsWith('vetting_')));
    /* The audit log is still kept, and still says so — that one has never been reachable. */
    assert.match(plan.summary, /partial refusal of your request/);
    assert.match(plan.summary, /security log/);
  });
  test('the clinical retention rules are offered even though nothing here is held on them', () => {
    const clinical = clinicalRetentionRules();
    assert.ok(clinical.some(basis => /six years/i.test(basis.name)));
    assert.ok(clinical.some(basis => /twenty-one/i.test(basis.name)));
    assert.ok(clinical.every(basis => !basis.inUse));
  });
});

describe('asking to be erased', () => {
  test('the wait, the answer date and the summary are all said up front', () => {
    const h = harness();
    const person = h.signIn().person;
    const plan = h.erasure.request(person.id, caller);
    assert.equal(plan.eraseAfter, plan.requestedAt + GRACE_DAYS * DAY);
    assert.equal(plan.respondBy, plan.requestedAt + RESPONSE_DAYS * DAY);
    assert.ok(plan.summary.includes(SCOPE_STATEMENT));
  });
  test('every session goes at once, not in seven days', () => {
    const h = harness();
    const session = h.signIn();
    h.erasure.request(session.person.id, caller);
    assert.equal(h.identity.resolve(session.token), null);
  });
  test('nothing is deleted during the grace period', () => {
    const h = harness();
    const person = h.signIn().person;
    h.erasure.request(person.id, caller);
    h.advance((GRACE_DAYS - 1) * DAY);
    assert.deepEqual(h.erasure.due(h.now()), []);
    assert.equal(h.store.findPersonByPhone('+27821234567')?.id, person.id);
  });
  test('it can be stopped, and then nothing comes due', () => {
    const h = harness();
    const person = h.signIn().person;
    h.erasure.request(person.id, caller);
    assert.equal(h.erasure.cancel(person.id, caller), true);
    assert.equal(h.erasure.cancel(person.id, caller), false, 'cancelling twice is not two cancellations');
    h.advance((GRACE_DAYS + 1) * DAY);
    assert.deepEqual(h.erasure.due(h.now()), []);
  });
});

describe('being erased', () => {
  function erased() {
    const h = harness();
    const person = h.signIn().person;
    h.identity.setName(person.id, 'Nomsa Dlamini');
    const enrolment = h.twoFactor.begin(person.id, person.phone);
    assert.ok(enrolment.ok);
    h.twoFactor.confirm(person.id, totp(enrolment.secret, h.now()));
    h.erasure.request(person.id, caller);
    const auditBefore = h.store.recentAudit(100);
    h.advance((GRACE_DAYS + 1) * DAY);
    assert.deepEqual(h.erasure.due(h.now()), [person.id]);
    assert.equal(h.erasure.carryOut(person.id, caller), true);
    return { h, person, auditBefore };
  }

  test('the name, the codes, the sessions and the second factor are gone', () => {
    const { h, person } = erased();
    const row = h.store.findPersonById(person.id);
    assert.ok(row);
    assert.equal(row.name, null);
    assert.equal(h.store.findSecondFactor(person.id), null);
    assert.equal(h.store.countUnusedRecoveryCodes(person.id), 0);
    assert.equal(h.store.countSweepable('starts', h.now()), 0);
    assert.equal(h.store.countSweepable('challenges', h.now()), 0);
  });
  test('the number is replaced by something that can never be dialled or signed in with', () => {
    const { h, person } = erased();
    const row = h.store.findPersonById(person.id)!;
    assert.equal(row.phone, tombstone(person.id));
    assert.match(row.phone, /@erased\.invalid$/, 'RFC 2606 reserves .invalid, so nothing can ever be sent there');
    assert.ok(isTombstone(row.phone));
    assert.equal(normalisePhone(row.phone), null, 'no number a person could type can ever match it');
    assert.equal(h.store.findPersonByPhone('+27821234567'), null);
  });
  test('two erased accounts do not collide, which a blank number would', () => {
    assert.notEqual(tombstone('a'), tombstone('b'));
  });
  test('the same number can sign up again, as somebody new', () => {
    const { h, person } = erased();
    const again = h.signIn();
    assert.notEqual(again.person.id, person.id, 'the old account id stays reserved so the log keeps meaning what it said');
    assert.equal(again.person.name, null);
  });
  test('running it twice is not two erasures', () => {
    const { h, person } = erased();
    assert.equal(h.erasure.carryOut(person.id, caller), false);
  });
  test('the append-only log is added to and never rewritten', () => {
    const { h, auditBefore } = erased();
    const after = h.store.recentAudit(100);
    assert.ok(after.length > auditBefore.length);
    /* Every line that was there before is there afterwards, byte for byte. An erasure that edited
       the log would take with it the only evidence that nobody was breaking into the account. */
    for (const line of auditBefore) {
      assert.ok(after.some(a => a.at === line.at && a.event === line.event && a.phone === line.phone && a.personId === line.personId),
        `${line.event} was rewritten or removed`);
    }
    assert.ok(after.some(a => a.event === 'account.erased'));
    assert.ok(!after.some(a => a.event === 'account.erased' && a.phone !== null),
      'the line recording the erasure must not put the number back');
  });
});

describe('the retention sweep', () => {
  function used() {
    const h = harness();
    const session = h.signIn();
    h.identity.logout(session.token, caller);
    h.advance(2 * DAY);
    return h;
  }
  test('by default it deletes nothing and says what it would', () => {
    const h = used();
    const report = sweep(h.store, { commit: false, now: h.now() });
    assert.equal(report.commit, false);
    assert.ok(report.lines.some(line => line.eligible > 0), 'there is spent material to report');
    for (const line of report.lines) assert.equal(line.deleted, 0);
    assert.ok(h.store.countSweepable('challenges', h.now()) > 0, 'a dry run left everything where it was');
    const printed: string[] = [];
    print(report, line => printed.push(line));
    assert.match(printed.join('\n'), /DRY RUN[\s\S]*eligible[\s\S]*Re-run with --commit/);
  });
  test('with --commit it clears spent codes, addresses and ended sessions', () => {
    const h = used();
    const report = sweep(h.store, { commit: true, now: h.now() });
    assert.ok(report.lines.every(line => line.deleted === line.eligible));
    for (const table of ['challenges', 'starts', 'sessions', 'second_factor_challenges'] as const) {
      assert.equal(h.store.countSweepable(table, h.now()), 0, table);
    }
  });
  test('a live session is not swept out from under somebody', () => {
    const h = harness();
    const session = h.signIn();
    sweep(h.store, { commit: true, now: h.now() });
    assert.ok(h.identity.resolve(session.token), 'the sweep only takes sessions that have already ended');
  });
  test('it never touches the sign-in log', () => {
    const h = used();
    const before = h.store.recentAudit(100).length;
    sweep(h.store, { commit: true, now: h.now() });
    assert.equal(h.store.recentAudit(100).length, before);
  });
  test('an erasure past its grace period is listed on a dry run and carried out on a commit', () => {
    const h = harness();
    const person = h.signIn().person;
    h.erasure.request(person.id, caller);
    h.advance((GRACE_DAYS + 1) * DAY);
    const rehearsed = sweep(h.store, { commit: false, now: h.now() });
    assert.deepEqual(rehearsed.erasuresDue, [person.id]);
    assert.equal(rehearsed.erasuresCarriedOut, 0);
    assert.equal(h.store.findPersonById(person.id)?.phone, '+27821234567');
    const done = sweep(h.store, { commit: true, now: h.now() });
    assert.equal(done.erasuresCarriedOut, 1);
    assert.ok(isTombstone(h.store.findPersonById(person.id)!.phone));
  });
});
