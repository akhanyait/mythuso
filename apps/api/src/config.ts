/**
 * Configuration, and the refusals that go with it.
 *
 * This service holds two things. Identity: a mobile number, a name if one was given, and for an
 * account that has set one up, the sealed secret its authenticator app shares with it. And workforce
 * vetting: for a nurse, courier, pharmacy, laboratory or site that MyThuso vets, the certificates
 * and clearances their checks were verified against, sealed by the protection module and opened only
 * through the gate. Both are written out table by table, in the words a person would use, in
 * personalData.ts.
 *
 * Since offline capture there is a third thing, and it was built to keep that sentence true rather
 * than in spite of it: the intake ledger. When a nurse's phone syncs after a spell with no signal,
 * the server records that an entry arrived — which device, which capturer, against which record,
 * what the device believed the time was and what the server's own time was — decides about it,
 * orders it and detects any conflict. It records no reading. The payload is sealed by the gate and
 * handed straight back to the device with the receipt; what stays here is a digest of the sealed
 * bytes, so the key ring is on this side and the ciphertext is not.
 *
 * And since versioned consent there is a fourth, which is the one that had to be built the most
 * carefully: what a person agreed to, in which words, on what day and by what route — and, in its
 * own table, who opened whose record, when, under what lawful basis and what capability. The second
 * of those is the closest this service comes to the line, and it stays the right side of it because
 * it records *that* a record was opened and never what was in it. There is no column it could go
 * in, packages/catalog/consent.json names the column words that may never appear, and
 * scripts/check-boundaries.mjs checks the schema against that list rather than against a memory.
 *
 * It holds no health information, which is why it can exist before the POPIA controls that special
 * personal information requires. A police clearance is not a clinical finding and a SANC certificate
 * is not a diagnosis — they are information about the people who give care, not about the people who
 * receive it — and a line saying an entry arrived at half past two is not the reading that arrived.
 * So neither the vetting module nor the intake ledger changed that sentence, and neither was allowed
 * to. The moment a clinical record lands here, docs/PRIVACY-AND-SECURITY.md applies in full, and
 * scripts/check-boundaries.mjs fails the build rather than letting one arrive quietly.
 */
import { parseKey } from './sensitive.ts';

export type Config = {
  environment: 'development' | 'production';
  port: number;
  host: string;
  pepper: string;
  allowedOrigins: string[];
  databasePath: string;
  returnCodesInResponse: boolean;
  cookieSecure: boolean;
  encryptionKey: string;
  protectionKeys: string;
  protectionKeyCurrent: string;
  protectionIndexVersion: string;
  /* The accredited identity verification provider, if one has been contracted. Empty is the honest
     default and the state of the platform today: with nothing named here, Home Affairs is served
     from the not-integrated adapter and the service says so rather than sandboxing quietly. */
  identityProvider: string;
  identityPartnerId: string;
  identityApiKey: string;
  identitySandbox: boolean;
  identityCallbackUrl: string;
  /* True only where MYTHUSO_ENV says development in so many words. Unset is not development:
     loadConfig refuses to start. See identityProvider.ts. */
  explicitDevelopment: boolean;
  /* Who is accountable for the consents this service records. POPIA makes the responsible party's
     Information Officer the person a data subject complains to and the Regulator writes to; a
     service recording consent with nobody named is recording a signature with no counterparty. */
  informationOfficer: string;
  /* A development convenience, and one that must never exist in production. See the refusal below. */
  consentAssumeCarriedOver: boolean;
  /* Whether a request that arrives from the loopback may name the caller it came from, in the last
     address of X-Forwarded-For. True only where MYTHUSO_TRUST_PROXY says `loopback` in so many words —
     the deployment in which nginx on the same box is the only way in. See callerAddress() in
     server.ts for what is trusted and why nothing else is. */
  trustProxy: boolean;
};
export class ConfigError extends Error {}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  /* Normalised the way the Passport's check is: case and surrounding space do not change what an
     environment is, so `Production` is production. An environment that is named and is not
     development is treated as production — failing closed, because a mistyped `prodution` that ran
     as development would hand out one-time codes. Unset or empty is not development either: that
     used to be the laptop default, and it is the fail-open this service will not start with.
     `MYTHUSO_ENV=development` is the explicit local path. `explicitDevelopment` is that same word,
     because the one thing that may only happen in development somebody chose on purpose is an
     unsigned identity callback. */
  const declaredEnvironment = (env.MYTHUSO_ENV ?? '').trim().toLowerCase();
  if (!declaredEnvironment) {
    throw new ConfigError('MYTHUSO_ENV is not set. An unset or empty environment is not development: set MYTHUSO_ENV=development on a local laptop, or name production. This service will not start, rather than returning one-time codes or skipping the pepper, SMS and https checks.');
  }
  const environment = declaredEnvironment === 'development' ? 'development' : 'production';
  const explicitDevelopment = declaredEnvironment === 'development';
  const production = environment === 'production';
  const pepper = env.MYTHUSO_AUTH_PEPPER ?? '';
  /* A pepper is what stops a stolen database from being a stolen set of codes and sessions.
     Development may generate an ephemeral one; production may not start without a real one. */
  if (production && pepper.length < 32) {
    throw new ConfigError('MYTHUSO_AUTH_PEPPER must be set to at least 32 characters in production');
  }
  /* The one-time code is only ever returned in a response so a developer can sign in without an SMS
     provider. If that ever happened in production, every account would be open to anyone who could
     reach the endpoint. It is refused rather than discouraged. */
  const returnCodesInResponse = env.MYTHUSO_RETURN_CODES === 'true';
  if (production && returnCodesInResponse) {
    throw new ConfigError('MYTHUSO_RETURN_CODES cannot be enabled in production: it would hand out one-time codes');
  }
  if (production && !env.MYTHUSO_SMS_PROVIDER) {
    throw new ConfigError('MYTHUSO_SMS_PROVIDER must be configured in production so codes can actually be delivered');
  }
  /* The key that seals a name and a second-factor secret at rest. A malformed one is refused here
     rather than at the first write, so a typo in the environment is a service that will not start
     instead of a service that turns out to hold nothing it can read. Its absence is allowed even in
     production: the service still signs people in, and it is the writes that are refused — see
     sensitive.ts, which is where the refusal lives. */
  /* The protection module's own key ring, separate from the identity service's single key: it is
     versioned, and a rotation has to be able to hold two versions at once. Validated here so a typo
     refuses to start rather than refusing the first write, hours later, to whoever is standing in
     front of a patient. */
  const protectionKeys = (env.MYTHUSO_PROTECTION_KEYS ?? '').trim();
  const protectionKeyCurrent = (env.MYTHUSO_PROTECTION_KEY_CURRENT ?? '').trim();
  const protectionIndexVersion = (env.MYTHUSO_PROTECTION_INDEX_VERSION ?? '').trim();
  const encryptionKey = (env.MYTHUSO_ENCRYPTION_KEY ?? '').trim();
  if (encryptionKey) {
    try { parseKey(encryptionKey); }
    catch (error) { throw new ConfigError(error instanceof Error ? error.message : 'MYTHUSO_ENCRYPTION_KEY is not a 32-byte key'); }
  }
  /* The ring itself is parsed by the protection module's own composition root, not here: nothing
     outside apps/api/src/protection may import the crypto, and scripts/check-boundaries.mjs fails
     the build if it does. Blind indexes are built under one pinned version — rotating the record
     keys must not invalidate every index in the database — so with more than one version present,
     which one that is has to be stated rather than guessed. */
  if (protectionKeys.includes(',') && !protectionIndexVersion) {
    throw new ConfigError('MYTHUSO_PROTECTION_INDEX_VERSION must name a version when more than one protection key is held');
  }
  /* The identity provider's credentials. Refused here as well as in the adapter, because the two
     refusals are about different things: the adapter refuses to be built without a key, and this
     refuses a *configuration* that could only ever have been a mistake — a provider named in
     production with nothing behind it, or a production service asked to run a sandbox. A sandboxed
     identity check records a person as confirmed against Home Affairs when Home Affairs has never
     been asked, and afterwards the row looks the same as a real one. */
  const identityProvider = (env.MYTHUSO_IDENTITY_PROVIDER ?? '').trim();
  const identityPartnerId = (env.MYTHUSO_IDENTITY_PARTNER_ID ?? '').trim();
  const identityApiKey = (env.MYTHUSO_IDENTITY_API_KEY ?? '').trim();
  const identitySandbox = (env.MYTHUSO_IDENTITY_SANDBOX ?? '').trim() === 'true';
  if (production && identityProvider && !(identityPartnerId && identityApiKey)) {
    throw new ConfigError(`MYTHUSO_IDENTITY_PROVIDER names "${identityProvider}" and there is no partner id or API key behind it. In production this refuses to start rather than falling back to a sandbox.`);
  }
  if (production && identitySandbox) {
    throw new ConfigError('MYTHUSO_IDENTITY_SANDBOX cannot be enabled in production: a sandbox session answers whatever it is told to, and the answer it records is indistinguishable afterwards from one Home Affairs gave');
  }
  const allowedOrigins = (env.MYTHUSO_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(o => o.trim()).filter(Boolean);
  if (production && allowedOrigins.some(o => o.startsWith('http://'))) {
    throw new ConfigError('Allowed origins must be https in production');
  }
  /* ---- Consent, and the log of who opened a record ------------------------------------------
     Three refusals, in the same spirit as the ones above: things this service must not be allowed
     to run without, rather than things it warns about and carries on. */
  /* A consent is given to somebody. POPIA requires the responsible party to register an Information
     Officer, and that person is who a data subject takes a withdrawal or a complaint to. A service
     that records consent in production and cannot say who is accountable for it has recorded one
     half of an agreement. Development runs without one, because there is nobody to complain to
     about a consent nobody gave. */
  const informationOfficer = (env.MYTHUSO_INFORMATION_OFFICER ?? '').trim();
  if (production && !informationOfficer) {
    throw new ConfigError('MYTHUSO_INFORMATION_OFFICER must name the registered Information Officer in production. A consent is given to a responsible party, and a service that records consent without being able to say who is accountable for it has written down one half of an agreement.');
  }
  /* The exact shape of MYTHUSO_RETURN_CODES, and for the same reason. It exists so a developer
     seeding a database does not have to re-answer every consent screen after a wording change. In
     production it would silently convert consent to old wording into consent to new wording, which
     is the one thing packages/catalog/consent.json says can never happen — and afterwards the row
     would look exactly like a consent somebody actually gave. */
  const consentAssumeCarriedOver = env.MYTHUSO_CONSENT_ASSUME_CARRIED_OVER === 'true';
  if (production && consentAssumeCarriedOver) {
    throw new ConfigError('MYTHUSO_CONSENT_ASSUME_CARRIED_OVER cannot be enabled in production: it would treat consent given to superseded wording as consent to the wording in force, and afterwards nothing would distinguish it from a consent somebody actually gave.');
  }
  /* The gate is what decides an access and what writes the tamper-evident entry the access log
     cross-references. With no key ring there is no gate, no chain and no decision — so every read of
     somebody's record would happen unlogged and undetectable. That is tolerable in development,
     where there is no record and nobody to read it; it is not tolerable in a production service
     whose whole claim is that it can say who opened what. */
  if (production && !protectionKeys) {
    throw new ConfigError('MYTHUSO_PROTECTION_KEYS must be configured in production. Without the key ring there is no gate, so no access to a record is decided, none is written into the tamper-evident chain, and the log of who opened what would be a table nothing writes to.');
  }
  return {
    environment,
    explicitDevelopment,
    port: Number(env.MYTHUSO_PORT ?? 8787),
    /* Bind loopback unless MYTHUSO_HOST names another host. This app had no listen host of its own;
       the public site name in deploy is not a bind address, so the default stays 127.0.0.1. */
    host: (env.MYTHUSO_HOST ?? '').trim() || '127.0.0.1',
    pepper: pepper || `development-only-${process.pid}`,
    allowedOrigins,
    databasePath: env.MYTHUSO_DB ?? ':memory:',
    returnCodesInResponse: returnCodesInResponse || !production,
    cookieSecure: production,
    encryptionKey,
    protectionKeys,
    protectionKeyCurrent,
    protectionIndexVersion,
    identityProvider,
    identityPartnerId,
    identityApiKey,
    identitySandbox,
    identityCallbackUrl: (env.MYTHUSO_IDENTITY_CALLBACK_URL ?? '').trim(),
    informationOfficer,
    consentAssumeCarriedOver,
    trustProxy: (env.MYTHUSO_TRUST_PROXY ?? '').trim() === 'loopback'
  };
}
export const limits = {
  codeLength: 6,
  codeTtlSeconds: 10 * 60,
  maxCodeAttempts: 5,
  startsPerPhonePerWindow: 5,
  startsPerAddressPerWindow: 20,
  rateWindowSeconds: 15 * 60,
  sessionIdleSeconds: 30 * 60,
  sessionAbsoluteSeconds: 12 * 60 * 60,
  /* A half-finished sign-in — the one-time code accepted, the authenticator code still owed. Short,
     because it is one sign-in rather than a session. */
  secondFactorChallengeSeconds: 10 * 60,
  maxSecondFactorAttempts: 6,
  /* ---- What a legitimate caller may do, and the honest status of this number -----------------
     docs/PRIVACY-AND-SECURITY.md said for months that everything except the sign-in door was
     unlimited, and left it there with a reason that was correct: "a limiter is a decision about
     what a legitimate caller may do and nobody has made it". Somebody has now made it, and it is
     recorded here as what it is.

     **Sixty writes per caller per fifteen minutes is a proposal, not a measurement.** Nobody has
     watched a real session, because there are no real sessions. What it was arrived at from is the
     busiest honest sequence this service can currently produce: a reviewer clearing a newly
     enrolled party is one enrolment, one submission per check, one decision per check and one
     second reviewer per high-risk check — roughly twenty-five writes for one party — and a reviewer
     working through two of them in a sitting doubles it. Sixty leaves that room and still refuses a
     script, which would be making thousands rather than dozens. Sign-up is nowhere near it: a
     consent decision per purpose, a name and an enrolment is under twenty.

     It shares `rateWindowSeconds` with the sign-in limits, because two windows would be two things
     to reason about at three in the morning. When the first real caller exists, this number should
     be checked against what they actually do and changed — and the change is one constant. */
  writesPerCallerPerWindow: 60,
  recoveryCodeCount: 10,
  /* Seven days between asking to be erased and being erased. Long enough for somebody who did not
     mean it, or whose phone was taken, to stop it; short enough that "when is it gone" is answered
     in a week. */
  erasureGraceDays: 7,
  /* How long spent sign-in material is kept before the sweep clears it. A consumed one-time code
     and the address that asked for it have done their work within a day. */
  spentCodeRetentionDays: 1,
  endedSessionRetentionDays: 30
};
