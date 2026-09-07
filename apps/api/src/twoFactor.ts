/**
 * The second factor, from enrolment to the sign-in that owes a code.
 *
 * The arithmetic is in totp.ts and is checked against the RFC's own vectors. This is everything
 * around it: where the secret is kept, what a half-finished sign-in looks like, and what happens
 * when somebody loses the phone.
 *
 * ── Three decisions worth keeping ────────────────────────────────────────────────────────────
 *
 * The secret is sealed at rest with the same key sensitive.ts uses for a name, and never falls back
 * to plaintext — not even on a laptop. A TOTP secret is a password that never expires: whoever
 * holds it can mint valid codes for ever, so a copy of the database file must not be a set of
 * working second factors.
 *
 * Enrolment does not take effect until the person has typed a code back. A QR code that was never
 * successfully scanned, switched on anyway, locks somebody out of their own account — and the
 * account it locks might be the doctor on call.
 *
 * And a sign-in that has answered the one-time code but still owes an authenticator code gets a
 * challenge, not a session. Minting the session first and upgrading it afterwards means a swapped
 * SIM is already a working session for however long it takes somebody to notice.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { limits, type Config } from './config.ts';
import { DecryptionFailed, EncryptionUnavailable, open, seal } from './sensitive.ts';
import { generateRecoveryCodes, generateSecret, normaliseRecoveryCode, otpauthUri, verifyTotp } from './totp.ts';
import type { Store } from './store.ts';

export type SecondFactorState = {
 /** A secret exists. It may never have been proved to work. */
 enrolled: boolean;
 /** A code was typed back, so this account really does sign in with one. */
 confirmed: boolean;
 recoveryCodesLeft: number;
};
export type Refusal = { ok: false; reason: string; message: string };
export type Enrolment = { ok: true; secret: string; uri: string } | Refusal;
export type Confirmation = { ok: true; recoveryCodes: string[] } | Refusal;
export type Answered = { ok: true; personId: string; usedRecoveryCode: boolean } | Refusal;
export type Checked = { ok: true; usedRecoveryCode: boolean } | Refusal;

/* Reading or writing a sealed secret is the one place this module can fail for a reason that has
   nothing to do with the person in front of it. It is turned into a refusal that says so, rather
   than a stack trace that says "cannot read property of undefined". */
function keyRefusal(error: unknown): Refusal | null {
 if (error instanceof EncryptionUnavailable) {
  return { ok: false, reason: 'encryption-unavailable', message: 'This server cannot protect a second-factor secret at the moment, so it will not store or read one. Nobody is locked out; try again once it is configured.' };
 }
 if (error instanceof DecryptionFailed) {
  return { ok: false, reason: 'secret-unreadable', message: 'Your second factor could not be read back. Use a recovery code to sign in, then set it up again.' };
 }
 return null;
}

type HeldSecret = { secret: string; lastUsedStep: number | null; confirmed: boolean };

export class TwoFactor {
 readonly #store: Store;
 readonly #config: Config;
 readonly #now: () => number;
 constructor(store: Store, config: Config, now: () => number = () => Date.now()) {
  this.#store = store;
  this.#config = config;
  this.#now = now;
 }

 /* Peppered like every other stored secret in this service: a recovery code and a challenge token
    are both bearer secrets, and reading the database must not hand either of them over. */
 #hash(scope: string, value: string): string {
  return createHmac('sha256', this.#config.pepper).update(`${scope}:${value}`).digest('hex');
 }

 #secretFor(personId: string): HeldSecret | null {
  const held = this.#store.findSecondFactor(personId);
  if (!held) return null;
  const secret = open(held.secret, this.#config);
  if (secret === null) return null;
  return { secret, lastUsedStep: held.lastUsedStep, confirmed: held.confirmedAt !== null };
 }

 state(personId: string): SecondFactorState {
  const held = this.#store.findSecondFactor(personId);
  return {
   enrolled: held !== null,
   confirmed: held?.confirmedAt != null,
   recoveryCodesLeft: this.#store.countUnusedRecoveryCodes(personId)
  };
 }

 /** Whether this account signs in with a code. Answered without opening the secret. */
 confirmed(personId: string): boolean {
  return this.#store.findSecondFactor(personId)?.confirmedAt != null;
 }

 /**
  * Begin enrolment: a fresh secret, not yet in force.
  *
  * An abandoned attempt is replaced, so somebody who closed the page before scanning is not stuck
  * with a secret they never held. A confirmed one is never replaced silently — that would be a way
  * to swap somebody's second factor out from under them with nothing but their unlocked phone.
  */
 begin(personId: string, account: string): Enrolment {
  if (this.confirmed(personId)) {
   return { ok: false, reason: 'already-enrolled', message: 'A second factor is already set up for this account. Turn it off first, with a code, before setting up another.' };
  }
  const secret = generateSecret();
  try {
   this.#store.putSecondFactor({
    personId,
    secret: seal(secret, this.#config, { required: true, label: 'a second-factor secret' }),
    confirmedAt: null, lastUsedStep: null, createdAt: this.#now()
   });
  } catch (error) {
   const refusal = keyRefusal(error);
   if (refusal) return refusal;
   throw error;
  }
  return { ok: true, secret, uri: otpauthUri(secret, account) };
 }

 /**
  * Finish enrolment by proving the app works, and hand back the recovery codes.
  *
  * The codes are shown once and never again, because they are stored hashed — MyThuso genuinely
  * cannot produce them a second time, which is the only version of "we cannot see them" worth
  * saying out loud.
  */
 confirm(personId: string, code: string): Confirmation {
  let held: HeldSecret | null;
  try { held = this.#secretFor(personId); }
  catch (error) {
   const refusal = keyRefusal(error);
   if (!refusal) throw error;
   return refusal;
  }
  if (!held) return { ok: false, reason: 'not-started', message: 'Set up your authenticator app first.' };
  const check = verifyTotp(held.secret, code, this.#now(), held.lastUsedStep);
  if (!check.ok) return { ok: false, reason: 'wrong-code', message: check.reason };
  const codes = generateRecoveryCodes(limits.recoveryCodeCount);
  this.#store.confirmSecondFactor(personId, this.#now(), check.step);
  this.#store.replaceRecoveryCodes(personId, codes.map(c => this.#hash('recovery', normaliseRecoveryCode(c)!)));
  return { ok: true, recoveryCodes: codes };
 }

 /** Turn it off. Requires a current code, so a picked-up phone cannot quietly remove it. */
 disable(personId: string, code: string): Checked {
  const checked = this.check(personId, code);
  if (!checked.ok) return checked;
  this.remove(personId);
  return checked;
 }

 /* Removal with no code, for a caller that has already checked one. A code is spent the moment it
    is accepted, so checking the same one twice refuses the second time — which would leave a
    step-up that passed and a second factor that never came off. */
 remove(personId: string): void {
  this.#store.deleteSecondFactor(personId);
 }

 /**
  * Check a code for an account that is already signed in.
  *
  * Recovery codes count here too: somebody whose phone is in the back of a taxi still has to be
  * able to confirm the session they are sitting in front of, or a step-up becomes a way to lock a
  * clinician out of their own shift.
  */
 check(personId: string, code: string): Checked {
  let held: HeldSecret | null;
  try { held = this.#secretFor(personId); }
  catch (error) {
   const refusal = keyRefusal(error);
   if (!refusal) throw error;
   /* The secret cannot be opened, but a recovery code is only a hash comparison and needs no key.
      It is the way back in that this failure exists for. */
   return this.#spendRecoveryCode(personId, code) ? { ok: true, usedRecoveryCode: true } : refusal;
  }
  if (!held) return { ok: false, reason: 'not-enrolled', message: 'No second factor is set up for this account.' };
  const check = verifyTotp(held.secret, code, this.#now(), held.lastUsedStep);
  if (check.ok) {
   this.#store.recordSecondFactorStep(personId, check.step);
   return { ok: true, usedRecoveryCode: false };
  }
  if (this.#spendRecoveryCode(personId, code)) return { ok: true, usedRecoveryCode: true };
  return { ok: false, reason: 'wrong-code', message: check.reason };
 }

 /** Spend a recovery code. Single use, compared without leaking how much of it was right. */
 #spendRecoveryCode(personId: string, supplied: string): boolean {
  const normalised = normaliseRecoveryCode(supplied);
  if (!normalised) return false;
  const hash = Buffer.from(this.#hash('recovery', normalised), 'hex');
  for (const held of this.#store.unusedRecoveryCodes(personId)) {
   const candidate = Buffer.from(held.codeHash, 'hex');
   if (candidate.length === hash.length && timingSafeEqual(candidate, hash)) {
    this.#store.spendRecoveryCode(held.id, this.#now());
    return true;
   }
  }
  return false;
 }

 /** Open a challenge: the one-time code was right, the authenticator code is still owed. */
 issueChallenge(personId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const createdAt = this.#now();
  const expiresAt = createdAt + limits.secondFactorChallengeSeconds * 1000;
  this.#store.createSecondFactorChallenge({
   id: randomUUID(), tokenHash: this.#hash('second-factor-challenge', token), personId,
   attempts: 0, createdAt, expiresAt, consumedAt: null
  });
  return { token, expiresAt };
 }

 /**
  * Answer a challenge with a code or a recovery code.
  *
  * The person's id comes back so the caller can mint the session — which is the only place a
  * session is created for an account that carries a second factor.
  */
 answerChallenge(token: string, code: string): Answered {
  const challenge = this.#store.findSecondFactorChallenge(this.#hash('second-factor-challenge', token));
  if (!challenge || challenge.consumedAt !== null) {
   return { ok: false, reason: 'unknown-challenge', message: 'That sign-in is no longer open. Start again.' };
  }
  if (this.#now() > challenge.expiresAt) {
   return { ok: false, reason: 'expired', message: 'That sign-in has expired. Start again.' };
  }
  if (challenge.attempts >= limits.maxSecondFactorAttempts) {
   /* Burned rather than merely refused. Leaving it open lets somebody keep the same challenge and
      wait out any per-minute limit, which is the whole of the attack. */
   this.#store.consumeSecondFactorChallenge(challenge.id, this.#now());
   return { ok: false, reason: 'too-many-attempts', message: 'Too many attempts. Start signing in again.' };
  }
  this.#store.recordSecondFactorChallengeAttempt(challenge.id);
  const checked = this.check(challenge.personId, code);
  if (!checked.ok) return checked;
  this.#store.consumeSecondFactorChallenge(challenge.id, this.#now());
  return { ok: true, personId: challenge.personId, usedRecoveryCode: checked.usedRecoveryCode };
 }
}
