/**
 * Configuration, and the refusals that go with it.
 *
 * This service holds identity only — a name and a mobile number. It holds no health information,
 * which is why it can exist before the POPIA controls that special personal information requires.
 * The moment a clinical record lands here, docs/PRIVACY-AND-SECURITY.md applies in full.
 */
export type Config = {
  environment: 'development' | 'production';
  port: number;
  pepper: string;
  allowedOrigins: string[];
  databasePath: string;
  returnCodesInResponse: boolean;
  cookieSecure: boolean;
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
    cookieSecure: production
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
  sessionAbsoluteSeconds: 12 * 60 * 60
};
