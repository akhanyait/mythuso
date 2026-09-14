/**
 * Whether the Health Passport may start at all, and with what.
 *
 * Every refusal here happens before a socket opens or a file is created, and every one of them is a
 * sentence out of packages/catalog/passport-gateway.json. The order is the order of what matters:
 *
 *  1. **Development only.** The service will not start without MYTHUSO_PASSPORT_DEVELOPMENT set to a
 *     phrase that cannot be set by accident, and never where MYTHUSO_ENV or NODE_ENV names anything
 *     but a development word — in any case, so `Production` and `prod` are refused as surely as
 *     `production`. The reason is in docs/PRIVACY-AND-SECURITY.md and it is not a technical one:
 *     there is no DPIA, no registered Information Officer and no data residency decision, and the
 *     master document says Passport P0 is live before the first visit only after its DPIA is signed.
 *  2. **Its own key.** A master key in MYTHUSO_PASSPORT_MASTER_KEY, 32 bytes as hex, and not the
 *     identity service's key or anything obviously derived from it.
 *  3. **Its own store.** Not the identity service's database file — compared by real path, and
 *     against the identity service's documented default as well as whatever MYTHUSO_DB says, so a
 *     relative path, a symlink or an unset variable cannot make the same file look like two.
 *  4. **The loopback, and only the loopback.**
 *
 * A configuration is only ever produced here. `wasLoaded` is how the gateway and createPassport()
 * refuse one built by hand, so importing the service does not skip the door the process goes through.
 *
 * ── What "derived from" can and cannot catch ─────────────────────────────────────────────────
 *
 * Equality is certain. Derivation is not: a key produced by some function of the identity key that
 * this file has never heard of looks exactly like a fresh random key, and no check at start-up can
 * tell them apart. What is caught is the derivations somebody would actually reach for in a hurry —
 * the identity key itself, its SHA-256, an HMAC or HKDF of it under an obvious label, and one hex
 * string containing the other. The real separation is custody: two keys in two KMS key rings with
 * two sets of people allowed near them. That does not exist, and this is not it.
 */
import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import gateway from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };

export class PassportRefusedToStart extends Error {}

export type PassportConfig = {
 readonly port: number;
 readonly host: string;
 readonly databasePath: string;
 readonly masterKey: Buffer;
};

type RefusalId = typeof gateway.refusals[number]['id'];
export const refusalOf = (id: RefusalId | string): string => {
 const found = gateway.refusals.find(candidate => candidate.id === id);
 if (!found) throw new Error(`packages/catalog/passport-gateway.json has no refusal "${id}".`);
 return found.sentence;
};

const LOADED = new WeakSet<PassportConfig>();
/** True only for a configuration loadPassportConfig produced, which means every refusal below was asked. */
export const wasLoaded = (config: PassportConfig): boolean => LOADED.has(config);

const LOOPBACK = new Set(gateway.service.loopbackHosts);
const DEVELOPMENT = new Set(gateway.service.developmentEnvironments);
const DERIVATION_LABELS = ['passport', 'mythuso-passport', 'health-passport', 'MYTHUSO_PASSPORT_MASTER_KEY'];

/* The raw key material the identity service could be holding, in every form it may be written. */
function identityMaterial(env: NodeJS.ProcessEnv): Buffer[] {
 const out: Buffer[] = [];
 for (const variable of gateway.service.identityKeyVariables) {
  const raw = (env[variable] ?? '').trim();
  if (!raw) continue;
  out.push(Buffer.from(raw, 'utf8'));
  for (const entry of raw.split(',')) {
   const material = entry.includes(':') ? entry.slice(entry.indexOf(':') + 1).trim() : entry.trim();
   if (!material) continue;
   out.push(Buffer.from(material, 'utf8'));
   if (/^[0-9a-f]+$/i.test(material) && material.length % 2 === 0) out.push(Buffer.from(material, 'hex'));
   const decoded = Buffer.from(material, 'base64');
   if (decoded.length === 32) out.push(decoded);
  }
 }
 return out;
}

function derivations(material: Buffer): Buffer[] {
 const out = [material, createHash('sha256').update(material).digest()];
 for (const label of DERIVATION_LABELS) {
  out.push(createHmac('sha256', material).update(label).digest());
  out.push(Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), label, 32)));
  out.push(Buffer.from(hkdfSync('sha256', material, label, Buffer.alloc(0), 32)));
 }
 return out;
}

export function sharesIdentityKey(masterKey: Buffer, env: NodeJS.ProcessEnv): boolean {
 const hex = masterKey.toString('hex');
 for (const material of identityMaterial(env)) {
  if (material.length >= 16) {
   const materialHex = material.toString('hex');
   const text = material.toString('utf8').toLowerCase();
   if (hex.includes(materialHex) || (text.length >= 32 && (hex.includes(text) || text.includes(hex)))) return true;
  }
  if (derivations(material).some(candidate => candidate.length === masterKey.length && candidate.equals(masterKey))) return true;
 }
 return false;
}

/* One file, however it is spelled: absolute, symlinks resolved, and for a file not yet created, its
   directory resolved. An in-memory database is no file at all and shares nothing. */
export function canonicalDatabasePath(path: string): string | null {
 const trimmed = path.trim();
 if (!trimmed || trimmed === ':memory:' || trimmed.startsWith('file::memory:')) return null;
 const absolute = resolve(trimmed.replace(/^file:/, ''));
 try { return realpathSync(absolute); } catch { /* not created yet */ }
 try { return resolve(realpathSync(dirname(absolute)), basename(absolute)); } catch { return absolute; }
}

export function loadPassportConfig(env: NodeJS.ProcessEnv = process.env): PassportConfig {
 const flag = gateway.service.developmentFlag;
 if (env[flag.variable] !== flag.value) throw new PassportRefusedToStart(refusalOf('not-development'));
 for (const variable of ['MYTHUSO_ENV', 'NODE_ENV']) {
  if (!DEVELOPMENT.has((env[variable] ?? '').trim().toLowerCase())) throw new PassportRefusedToStart(refusalOf('production-environment'));
 }

 const rawKey = (env[gateway.service.masterKeyVariable] ?? '').trim();
 if (!/^[0-9a-f]{64}$/i.test(rawKey)) throw new PassportRefusedToStart(refusalOf('no-master-key'));
 const masterKey = Buffer.from(rawKey, 'hex');
 if (sharesIdentityKey(masterKey, env)) throw new PassportRefusedToStart(refusalOf('shared-key'));

 const databasePath = (env[gateway.service.databaseVariable] ?? ':memory:').trim() || ':memory:';
 const mine = canonicalDatabasePath(databasePath);
 if (mine) {
  const identity = [env[gateway.service.identityDatabaseVariable] ?? '', ...gateway.service.identityDatabaseDefaults].map(canonicalDatabasePath);
  if (identity.includes(mine)) throw new PassportRefusedToStart(refusalOf('shared-database'));
 }

 const host = (env.MYTHUSO_PASSPORT_HOST ?? gateway.service.host).trim().toLowerCase();
 if (!LOOPBACK.has(host)) throw new PassportRefusedToStart(refusalOf('not-loopback'));

 const port = Number(env.MYTHUSO_PASSPORT_PORT ?? gateway.service.port);
 const config: PassportConfig = Object.freeze({ port: Number.isInteger(port) && port >= 0 ? port : gateway.service.port, host, databasePath, masterKey });
 LOADED.add(config);
 return config;
}
