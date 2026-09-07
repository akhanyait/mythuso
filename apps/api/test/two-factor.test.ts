import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig, limits } from '../src/config.ts';
import { openStore, type Store } from '../src/store.ts';
import { Identity } from '../src/identity.ts';
import { TwoFactor } from '../src/twoFactor.ts';
import { STEP_SECONDS, totp } from '../src/totp.ts';
import { capabilitiesNeedingSecondFactor, decideStepUp, requiresSecondFactor, SECOND_FACTOR_CAPABILITIES, SECOND_FACTOR_REASONS } from '../src/stepUp.ts';

const config = loadConfig({
  MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'f'.repeat(40),
  MYTHUSO_ENCRYPTION_KEY: randomBytes(32).toString('hex')
} as NodeJS.ProcessEnv);
const caller = { address: '10.0.0.1', agent: 'test' };

function harness() {
  let clock = Date.UTC(2026, 8, 6, 9, 0, 0);
  const store: Store = openStore(':memory:');
  const now = () => clock;
  const twoFactor = new TwoFactor(store, config, now);
  const identity = new Identity(store, config, now, twoFactor);
  const signIn = (phone = '0821234567') => {
    const started = identity.start(phone, caller);
    assert.ok(started.ok && started.code);
    return identity.verify(started.challengeId, started.code, caller);
  };
  const firstSignIn = () => {
    const verified = signIn();
    assert.ok(verified.ok && verified.step === 'signed-in');
    return verified.person;
  };
  return { store, identity, twoFactor, signIn, firstSignIn, now, advance: (ms: number) => { clock += ms; } };
}
/** Enrol properly: begin, then prove the app works, exactly as a person would. */
function enrol(h: ReturnType<typeof harness>, personId: string) {
  const begun = h.twoFactor.begin(personId, '+27821234567');
  assert.ok(begun.ok);
  const confirmed = h.twoFactor.confirm(personId, totp(begun.secret, h.now()));
  assert.ok(confirmed.ok);
  /* The code that confirmed the enrolment is spent, the way every code is spent once. Real time
     moves on before the next sign-in; the frozen clock in these tests has to be told to. */
  h.advance(STEP_SECONDS * 1000);
  return { secret: begun.secret, recoveryCodes: confirmed.recoveryCodes };
}

describe('enrolling', () => {
  test('a secret that was never proved does not switch anything on', () => {
    const h = harness();
    const person = h.firstSignIn();
    const begun = h.twoFactor.begin(person.id, person.phone);
    assert.ok(begun.ok);
    assert.deepEqual(h.twoFactor.state(person.id), { enrolled: true, confirmed: false, recoveryCodesLeft: 0 });
    /* An unscanned QR code that switched itself on would lock somebody out of their own account. */
    assert.equal(h.twoFactor.confirmed(person.id), false);
    const again = h.signIn();
    assert.ok(again.ok && again.step === 'signed-in', 'an unconfirmed enrolment must not start demanding codes');
  });
  test('typing a code back is what makes it real, and hands over the recovery codes', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { recoveryCodes } = enrol(h, person.id);
    assert.equal(recoveryCodes.length, limits.recoveryCodeCount);
    assert.deepEqual(h.twoFactor.state(person.id), { enrolled: true, confirmed: true, recoveryCodesLeft: limits.recoveryCodeCount });
  });
  test('the wrong code confirms nothing', () => {
    const h = harness();
    const person = h.firstSignIn();
    const begun = h.twoFactor.begin(person.id, person.phone);
    assert.ok(begun.ok);
    const confirmed = h.twoFactor.confirm(person.id, '000000');
    assert.equal(confirmed.ok, false);
    assert.equal(h.twoFactor.confirmed(person.id), false);
  });
  test('a confirmed second factor is not quietly replaced by a new enrolment', () => {
    const h = harness();
    const person = h.firstSignIn();
    enrol(h, person.id);
    const again = h.twoFactor.begin(person.id, person.phone);
    assert.equal(again.ok, false);
    assert.match((again as { message: string }).message, /Turn it off first/);
  });
  test('the secret is sealed in the row', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    const held = h.store.findSecondFactor(person.id);
    assert.ok(held && held.secret instanceof Uint8Array);
    assert.ok(!Buffer.from(held.secret as Uint8Array).toString('latin1').includes(secret),
      'a copy of the database file must not be a set of working second factors');
  });
  test('a server with no encryption key refuses to hold a secret at all', () => {
    const bare = loadConfig({ MYTHUSO_ENV: 'development', MYTHUSO_AUTH_PEPPER: 'f'.repeat(40) } as NodeJS.ProcessEnv);
    const store = openStore(':memory:');
    const twoFactor = new TwoFactor(store, bare);
    const refused = twoFactor.begin('someone', '+27821234567');
    assert.equal(refused.ok, false);
    assert.equal((refused as { reason: string }).reason, 'encryption-unavailable');
    store.close();
  });
});

describe('signing in with a second factor', () => {
  test('the one-time code buys a challenge, not a session', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    assert.equal(h.identity.resolve(verified.challengeToken), null, 'a challenge token is not a session token');
    const completed = h.identity.completeSecondFactor(verified.challengeToken, totp(secret, h.now()), caller);
    assert.ok(completed.ok);
    assert.equal(h.identity.resolve(completed.token)?.person.id, person.id);
  });
  test('a challenge is spent once', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    assert.ok(h.identity.completeSecondFactor(verified.challengeToken, totp(secret, h.now()), caller).ok);
    const replayed = h.identity.completeSecondFactor(verified.challengeToken, totp(secret, h.now()), caller);
    assert.equal(replayed.ok, false);
  });
  test('a challenge expires', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    h.advance((limits.secondFactorChallengeSeconds + 1) * 1000);
    const late = h.identity.completeSecondFactor(verified.challengeToken, totp(secret, h.now()), caller);
    assert.equal(late.ok, false);
    assert.equal((late as { reason: string }).reason, 'expired');
  });
  test('guessing burns the challenge rather than leaving it open', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    for (let attempt = 0; attempt < limits.maxSecondFactorAttempts; attempt++) {
      assert.equal(h.identity.completeSecondFactor(verified.challengeToken, '000000', caller).ok, false);
    }
    const right = h.identity.completeSecondFactor(verified.challengeToken, totp(secret, h.now()), caller);
    assert.equal(right.ok, false, 'the right code must not rescue a burned challenge');
  });
  test('a recovery code gets somebody in whose phone is gone, once', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { recoveryCodes } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    const used = h.identity.completeSecondFactor(verified.challengeToken, recoveryCodes[0]!, caller);
    assert.ok(used.ok);
    assert.equal(h.twoFactor.state(person.id).recoveryCodesLeft, limits.recoveryCodeCount - 1);
    const second = h.signIn();
    assert.ok(second.ok && second.step === 'second-factor');
    assert.equal(h.identity.completeSecondFactor(second.challengeToken, recoveryCodes[0]!, caller).ok, false,
      'a spent recovery code is spent');
  });
  test('the audit trail records which door was used', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { recoveryCodes } = enrol(h, person.id);
    const verified = h.signIn();
    assert.ok(verified.ok && verified.step === 'second-factor');
    h.identity.completeSecondFactor(verified.challengeToken, recoveryCodes[0]!, caller);
    const events = h.store.recentAudit(20);
    assert.ok(events.some(e => e.event === 'auth.verify.second-factor'));
    assert.ok(events.some(e => e.event === 'auth.second-factor.success' && e.detail === 'answered with a recovery code'));
  });
});

describe('turning it off', () => {
  test('a code is needed, so a picked-up phone cannot do it', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret } = enrol(h, person.id);
    assert.equal(h.twoFactor.disable(person.id, '000000').ok, false);
    assert.equal(h.twoFactor.confirmed(person.id), true);
    assert.ok(h.twoFactor.disable(person.id, totp(secret, h.now())).ok);
    assert.deepEqual(h.twoFactor.state(person.id), { enrolled: false, confirmed: false, recoveryCodesLeft: 0 });
  });
  test('the codes go with it, so an old list cannot let somebody back in', () => {
    const h = harness();
    const person = h.firstSignIn();
    const { secret, recoveryCodes } = enrol(h, person.id);
    h.twoFactor.disable(person.id, totp(secret, h.now()));
    assert.equal(h.twoFactor.check(person.id, recoveryCodes[0]!).ok, false);
  });
});

describe('who must carry one', () => {
  const vetting = JSON.parse(readFileSync(join(import.meta.dirname, '../../../packages/catalog/vetting.json'), 'utf8')) as {
    capabilities: { id: string }[];
    roles: { id: string; grants: { capability: string }[] }[];
  };
  test('every capability named here is one the vetting table actually defines', () => {
    const defined = new Set(vetting.capabilities.map(c => c.id));
    for (const capability of SECOND_FACTOR_CAPABILITIES) {
      assert.ok(defined.has(capability), `${capability} is not in packages/catalog/vetting.json`);
      assert.ok(SECOND_FACTOR_REASONS[capability], `${capability} has no reason written for the person it applies to`);
    }
  });
  test('the requirement follows the role\'s grants, not an account setting', () => {
    const grantsFor = (roleId: string) => vetting.roles.find(r => r.id === roleId)!.grants.map(g => g.capability);
    for (const role of ['doctor', 'pharmacy', 'laboratory', 'nurse', 'operator', 'guardian']) {
      assert.ok(requiresSecondFactor(grantsFor(role)), `${role} signs clinical work or opens a record`);
    }
    for (const role of ['courier', 'sponsor']) {
      assert.equal(requiresSecondFactor(grantsFor(role)), false, `${role} neither signs nor reads a record`);
    }
    assert.deepEqual(capabilitiesNeedingSecondFactor(grantsFor('doctor')).sort(), ['prescribe', 'sign-clinical-review', 'view-patient-record']);
  });
});

describe('the rule from the 2026-08-29 lockout', () => {
  /* Step-up was demanded from an account with no second factor enrolled, so nothing could answer
     it, and a correct sign-in bricked itself a tenth of a second later. */
  test('nothing is ever demanded of an account with nothing to answer with', () => {
    for (const action of ['capability', 'second-factor.disable', 'account.erasure'] as const) {
      for (const grants of [[], ['prescribe'], ['sign-clinical-review', 'view-patient-record']]) {
        const decision = decideStepUp({ action, enrolled: false, grants });
        assert.equal(decision.demand, false, `${action} with grants ${grants.join()} demanded the impossible`);
      }
    }
  });
  test('an account that owes an enrolment is asked to enrol, not locked out', () => {
    const decision = decideStepUp({ action: 'capability', enrolled: false, grants: ['prescribe'] });
    assert.equal(decision.demand, false);
    assert.equal(decision.enrolmentOwed, true);
    assert.match(decision.because, /not locked out/);
  });
  test('once there is a second factor, the demand is made', () => {
    assert.equal(decideStepUp({ action: 'capability', enrolled: true, grants: ['prescribe'] }).demand, true);
    assert.equal(decideStepUp({ action: 'capability', enrolled: true, grants: ['take-visit'] }).demand, false);
    assert.equal(decideStepUp({ action: 'second-factor.disable', enrolled: true }).demand, true);
    assert.equal(decideStepUp({ action: 'account.erasure', enrolled: true }).demand, true);
  });
});
