import { createHmac, createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { limits, type Config } from './config.ts';
import type { AuditEvent, Person, Store } from './store.ts';

export type StartResult =
  | { ok: true; challengeId: string; expiresAt: number; code?: string }
  | { ok: false; reason: 'invalid-phone' | 'rate-limited'; retryAfter?: number };
export type VerifyResult =
  | { ok: true; token: string; expiresAt: number; person: PublicPerson }
  | { ok: false; reason: 'unknown-challenge' | 'expired' | 'too-many-attempts' | 'wrong-code' };
export type PublicPerson = { id: string; phone: string; name: string | null };
export type Caller = { address: string; agent: string };

/** South African mobile numbers, normalised to E.164 so one person is one row. */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  const local = digits.startsWith('+27') ? digits.slice(3) : digits.startsWith('27') ? digits.slice(2)
    : digits.startsWith('0') ? digits.slice(1) : null;
  if (local === null || !/^[6-8]\d{8}$/.test(local)) return null;
  return `+27${local}`;
}
const publicPerson = (p: Person): PublicPerson => ({ id: p.id, phone: p.phone, name: p.name });

export class Identity {
  /* Written out rather than using constructor parameter properties: Node runs these files by
     stripping types, and stripping cannot rewrite a parameter property into a field. */
  readonly #store: Store;
  readonly #config: Config;
  readonly #now: () => number;
  constructor(store: Store, config: Config, now: () => number = () => Date.now()) {
    this.#store = store;
    this.#config = config;
    this.#now = now;
  }

  /* The code is short-lived and attempt-limited, so the hash does not need to be slow — brute force
     is stopped by burning the challenge, not by cost. It is hashed and peppered so that reading the
     database does not hand over a working code. */
  #hashCode(challengeId: string, code: string): string {
    return createHmac('sha256', this.#config.pepper).update(`${challengeId}:${code}`).digest('hex');
  }
  /* The cookie carries the secret; only its digest is stored. A database read grants no sessions. */
  #hashToken(token: string): string {
    return createHmac('sha256', this.#config.pepper).update(`session:${token}`).digest('hex');
  }
  #audit(event: Partial<AuditEvent> & { event: string }, caller?: Caller) {
    this.#store.appendAudit({
      at: this.#now(), personId: null, phone: null, detail: null,
      address: caller?.address ?? null,
      agentHash: caller ? createHash('sha256').update(caller.agent).digest('hex').slice(0, 16) : null,
      ...event
    });
  }

  /**
   * Begin sign-in. The response is identical whether or not the number is known: an endpoint that
   * says "no such account" is an endpoint that tells an attacker which numbers to keep.
   */
  start(rawPhone: string, caller: Caller): StartResult {
    const phone = normalisePhone(rawPhone);
    if (!phone) {
      this.#audit({ event: 'auth.start.invalid' }, caller);
      return { ok: false, reason: 'invalid-phone' };
    }
    const since = this.#now() - limits.rateWindowSeconds * 1000;
    const byPhone = this.#store.countRecentStarts('phone', phone, since);
    const byAddress = this.#store.countRecentStarts('address', caller.address, since);
    if (byPhone >= limits.startsPerPhonePerWindow || byAddress >= limits.startsPerAddressPerWindow) {
      this.#audit({ event: 'auth.start.rate-limited', phone }, caller);
      return { ok: false, reason: 'rate-limited', retryAfter: limits.rateWindowSeconds };
    }
    const challengeId = randomUUID();
    const code = String(randomInt(0, 10 ** limits.codeLength)).padStart(limits.codeLength, '0');
    const createdAt = this.#now();
    const expiresAt = createdAt + limits.codeTtlSeconds * 1000;
    this.#store.createChallenge({ id: challengeId, phone, codeHash: this.#hashCode(challengeId, code), attempts: 0, createdAt, expiresAt, consumedAt: null }, caller.address);
    this.#audit({ event: 'auth.start', phone }, caller);
    return { ok: true, challengeId, expiresAt, ...(this.#config.returnCodesInResponse ? { code } : {}) };
  }

  /** Verify a code. Success creates the person if this is their first sign-in. */
  verify(challengeId: string, code: string, caller: Caller): VerifyResult {
    const challenge = this.#store.findChallenge(challengeId);
    if (!challenge || challenge.consumedAt !== null) {
      this.#audit({ event: 'auth.verify.unknown' }, caller);
      return { ok: false, reason: 'unknown-challenge' };
    }
    if (this.#now() > challenge.expiresAt) {
      this.#audit({ event: 'auth.verify.expired', phone: challenge.phone }, caller);
      return { ok: false, reason: 'expired' };
    }
    if (challenge.attempts >= limits.maxCodeAttempts) {
      this.#audit({ event: 'auth.verify.burned', phone: challenge.phone }, caller);
      return { ok: false, reason: 'too-many-attempts' };
    }
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const supplied = Buffer.from(this.#hashCode(challengeId, code), 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      this.#store.recordChallengeAttempt(challengeId);
      const remaining = limits.maxCodeAttempts - (challenge.attempts + 1);
      this.#audit({ event: 'auth.verify.wrong-code', phone: challenge.phone, detail: `${remaining} attempts left` }, caller);
      return { ok: false, reason: 'wrong-code' };
    }
    this.#store.consumeChallenge(challengeId, this.#now());
    let person = this.#store.findPersonByPhone(challenge.phone);
    if (!person) {
      person = { id: randomUUID(), phone: challenge.phone, name: null, createdAt: this.#now() };
      this.#store.createPerson(person);
      this.#audit({ event: 'person.created', personId: person.id, phone: person.phone }, caller);
    }
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.#now();
    this.#store.createSession({
      id: randomUUID(), tokenHash: this.#hashToken(token), personId: person.id,
      createdAt, lastSeenAt: createdAt, expiresAt: createdAt + limits.sessionIdleSeconds * 1000, revokedAt: null
    });
    this.#audit({ event: 'auth.verify.success', personId: person.id, phone: person.phone }, caller);
    return { ok: true, token, expiresAt: createdAt + limits.sessionIdleSeconds * 1000, person: publicPerson(person) };
  }

  /** Resolve a cookie to a person, sliding the idle window but never past the absolute limit. */
  resolve(token: string | null): { person: PublicPerson; sessionId: string } | null {
    if (!token) return null;
    const session = this.#store.findSessionByTokenHash(this.#hashToken(token));
    if (!session || session.revokedAt !== null) return null;
    const now = this.#now();
    if (now > session.expiresAt) return null;
    if (now > session.createdAt + limits.sessionAbsoluteSeconds * 1000) {
      this.#store.revokeSession(session.id, now);
      this.#audit({ event: 'auth.session.expired', personId: session.personId });
      return null;
    }
    const person = this.#store.findPersonById(session.personId);
    if (!person) return null;
    this.#store.touchSession(session.id, now, now + limits.sessionIdleSeconds * 1000);
    return { person: publicPerson(person), sessionId: session.id };
  }

  logout(token: string | null, caller: Caller): boolean {
    if (!token) return false;
    const session = this.#store.findSessionByTokenHash(this.#hashToken(token));
    if (!session || session.revokedAt !== null) return false;
    this.#store.revokeSession(session.id, this.#now());
    this.#audit({ event: 'auth.logout', personId: session.personId }, caller);
    return true;
  }
}
