/**
 * The operator credential break-glass requires — a development-only stand-in, and it says so.
 *
 * Break-glass used to believe the request body about who was breaking the glass. That is the hole
 * apps/api/src/actor.ts exists to close in the identity service: a role typed into a body is a role
 * anybody who can send a body holds. The real answer is OIDC for a registered clinician and mutual
 * TLS for the dispatch desk (§22), and neither exists. So in P0 the credential is a signed token,
 * minted at the console on the machine the service runs on, for one of the two break-glass roles,
 * with an opaque reference and an expiry, under a signing key derived from the Passport's master key.
 *
 * It is not routed. There is no HTTP endpoint that mints one, because an endpoint that hands out the
 * credential is the body again with extra steps. Mint one with:
 *
 *   MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only MYTHUSO_PASSPORT_MASTER_KEY=… \
 *     node apps/passport/src/operator.ts dispatch-desk
 *
 * and it refuses exactly where the service refuses, because it loads the same configuration.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PassportRefusedToStart, loadPassportConfig, wasLoaded, type PassportConfig } from './config.ts';
import { GATEWAY } from './contract.ts';
import { PassportKeys, readToken, signToken } from './keys.ts';

const HOUR = 3_600_000;

export type Operator = { role: string; ref: string };

export function mintOperatorCredential(config: PassportConfig, role: string, now: number = Date.now()): string {
 if (!wasLoaded(config)) throw new PassportRefusedToStart('An operator credential is minted from a configuration the Passport loaded itself, never from one built by hand.');
 if (!GATEWAY.breakGlass.roles.includes(role)) throw new Error(`"${role}" is not a role that may break the glass: ${GATEWAY.breakGlass.roles.join(' or ')}.`);
 return signToken(new PassportKeys(config.masterKey), 'operator', {
  kind: 'operator', role, ref: `op_${randomBytes(8).toString('hex')}`, expiresAt: now + GATEWAY.breakGlass.operatorCredentialHours * HOUR
 });
}

/** Who holds a credential, or null for anything unsigned, altered, expired or for a role that may not break the glass. */
export function operatorOf(keys: PassportKeys, token: string, now: number): Operator | null {
 const read = readToken(keys, 'operator', token);
 if (!read) return null;
 const { kind, role, ref, expiresAt } = read.body;
 if (kind !== 'operator' || typeof role !== 'string' || typeof ref !== 'string' || typeof expiresAt !== 'number') return null;
 if (!GATEWAY.breakGlass.roles.includes(role) || expiresAt <= now) return null;
 return { role, ref };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  process.stdout.write(`${mintOperatorCredential(loadPassportConfig(), process.argv[2] ?? '')}\n`);
 } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
 }
}
