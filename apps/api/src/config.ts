/**
 * Configuration, and the refusals that go with it.
 *
 * This service holds identity only — a mobile number, a name if one was given, and for an account
 * that has set one up, the sealed secret its authenticator app shares with it. It is written out
 * table by table, in the words a person would use, in personalData.ts.
 *
 * It holds no health information, which is why it can exist before the POPIA controls that special
 * personal information requires. The moment a clinical record lands here,
 * docs/PRIVACY-AND-SECURITY.md applies in full.
 */
import { parseKey } from './sensitive.ts';

export type Config = {
  environment: 'development' | 'production';
  port: number;
  pepper: string;
  allowedOrigins: string[];
  databasePath: string;
  returnCodesInResponse: boolean;
  cookieSecure: boolean;
  encryptionKey: string;
  protectionKeys: string;
  protectionKeyCurrent: string;
  protectionIndexVersion: string;
};
export class ConfigError extends Error {}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const environment = env.MYTHUSO_ENV === 'production' ? 'production' : 'development';
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
  const allowedOrigins = (env.MYTHUSO_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(o => o.trim()).filter(Boolean);
  if (production && allowedOrigins.some(o => o.startsWith('http://'))) {
    throw new ConfigError('Allowed origins must be https in production');
  }
  return {
    environment,
    port: Number(env.MYTHUSO_PORT ?? 8787),
    pepper: pepper || `development-only-${process.pid}`,
    allowedOrigins,
    databasePath: env.MYTHUSO_DB ?? ':memory:',
    returnCodesInResponse: returnCodesInResponse || !production,
    cookieSecure: production,
    encryptionKey,
    protectionKeys,
    protectionKeyCurrent,
    protectionIndexVersion
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
