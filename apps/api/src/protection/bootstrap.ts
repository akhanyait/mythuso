/**
 * The authorisation that opens the vetting bootstrap, and nothing else.
 *
 * ── The hole this is wrapped around ──────────────────────────────────────────────────────────
 *
 * A high-risk vetting check needs a second, different reviewer. Somebody has to clear the first
 * reviewer, and there is nobody to do it — so the vetting module has a bootstrap: a way to seed two
 * parties and decide their own checks outside the gate. It is small, it refuses without a document
 * on file, it refuses a same-person second, and it closes for ever once a third party exists. What
 * it was not, until this file, was *hard to reach*. Anything holding the vault could call it.
 *
 * This is what it now takes: a token an operator produces at a console, from the key ring, naming
 * the parties to be seeded and the two people performing the ceremony, good for a few minutes and
 * good exactly once. A caller who does not have one cannot bootstrap; a caller who has last week's
 * cannot either.
 *
 * ── What this is honestly worth ──────────────────────────────────────────────────────────────
 *
 * It does not stop root. The key that signs a token is derived from the same ring the running
 * service holds, so anybody who can execute code in the service — or read /etc/mythuso/api.env —
 * can mint one, which docs/DATA-PROTECTION.md already says of every key on this machine. There is
 * no second signer and no hardware to hold one, and split custody at this size is theatre the same
 * document declines by name.
 *
 * What it does buy, and the reason it is worth the file:
 *
 *  · The escape hatch is no longer reachable by ordinary code. A route, a job or a stray script
 *    holding the vault has nothing to present, and a request arriving over HTTP has never held key
 *    material. It takes a deliberate act at a console, which is what a bootstrap should be.
 *  · The names are signed, not passed. Whoever mints the token states which parties are being
 *    seeded and which two people are deciding, and the vault will accept no others — so the names
 *    in the audit chain are the names somebody committed to before the ceremony, rather than
 *    whatever the last caller happened to type.
 *  · It expires and it is spent. A token found in a shell history the following week opens nothing.
 *
 * ── The token ────────────────────────────────────────────────────────────────────────────────
 *
 *   mythuso-bootstrap-v1.<base64url payload>.<hmac-sha256, hex>
 *
 * The payload is not secret and is not encrypted — it is exactly the statement being authorised, so
 * anybody reading a token can see what it would do. The HMAC is what makes it an authorisation, and
 * it is over the encoded bytes themselves rather than over a re-serialisation of the parsed payload,
 * because the second one is where signature checks go wrong: what is verified must be what is read.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { canonicalBytes, createKeyRing, type ProtectionConfig } from './crypto.ts';
import type { KeyRing } from './contract.ts';

/* Versioned, because a change to what is signed must not leave an old token verifying. The version
   is joined with a hyphen rather than a full stop: the full stop is what separates the three parts
   of a token, and a prefix containing one is a token that reads as four parts and refuses itself. */
const PREFIX = 'mythuso-bootstrap-v1';
/** Long enough for two people to read a token across a desk; short enough to be useless by lunch. */
export const BOOTSTRAP_MINUTES = 15;
export const BOOTSTRAP_MINUTES_MAX = 60;
/** Two parties, and only two — the vetting module's own reason, restated where the token is made. */
const BOOTSTRAP_PARTIES_MAX = 2;

/** What an operator is authorising: these parties, seeded and decided by these two people, until then. */
export type BootstrapGrant = {
 parties: readonly { id: string; roleId: string }[];
 /** The person taking the decision. A name, as it will appear in the audit chain for ever. */
 decidedBy: string;
 /** The second person in the room. Required: a bootstrap is the one decision nobody else reviews. */
 secondedBy: string;
 expiresAt: number;
};
/** A grant that has been signed, and the sixteen characters that identify it without disclosing it. */
export type BootstrapAuthorisation = BootstrapGrant & { nonce: string; fingerprint: string };
export type BootstrapVerdict =
 | { ok: true; authorisation: BootstrapAuthorisation }
 | { ok: false; reason: string; fingerprint: string };

/**
 * Verifying a token, and identifying one. Two methods, and neither of them can seal, open, or derive
 * anything: this is what the vetting module is handed, so that "the vault holds no key" stays true
 * while the vault can still check an authorisation.
 */
export type BootstrapAuthority = {
 verify(token: string, at: number): BootstrapVerdict;
 /** Sixteen characters of SHA-256 of the token. Safe to write in a register, in a log, or aloud. */
 fingerprint(token: string): string;
};

const encode = (value: Buffer): string => value.toString('base64url');
export const bootstrapFingerprint = (token: string): string =>
 createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 16);

/* Pinned to the oldest version configured, for the same reason the audit chain is: a token minted
   at 22:10 must still verify at 22:20 if somebody rotated a key in between, and the operator holding
   a printed token has no way of knowing which version was current when it was made. Old versions are
   kept for ever — docs/DATA-PROTECTION.md is explicit that a rotation here retires nothing — which is
   what makes pinning to the oldest safe rather than merely convenient. */
const signingVersion = (keys: KeyRing): number => Math.min(...keys.versions);

function sign(keys: KeyRing, body: string): string {
 return createHmac('sha256', keys.derive('bootstrap', signingVersion(keys)))
  .update(canonicalBytes([PREFIX, body])).digest('hex');
}

/** Everything a grant has to be before it is signed. The same rules are re-checked on the way back in. */
function refuseGrant(grant: BootstrapGrant): string | null {
 if (!grant.parties.length) return 'A bootstrap authorisation that names no party authorises nothing.';
 if (grant.parties.length > BOOTSTRAP_PARTIES_MAX) {
  return `A bootstrap seeds at most ${BOOTSTRAP_PARTIES_MAX} parties: a pair who can review each other's work. Anybody after them is enrolled through the gate.`;
 }
 if (grant.parties.some(party => !party.id.trim() || !party.roleId.trim())) return 'Every party in a bootstrap authorisation needs an id and a role.';
 if (new Set(grant.parties.map(party => party.id)).size !== grant.parties.length) return 'A bootstrap authorisation names the same party twice.';
 if (!grant.decidedBy.trim() || !grant.secondedBy.trim()) return 'A bootstrap is performed by two named people, and both names go in the authorisation.';
 /* The rule the whole vetting module is built around, enforced at the point the authorisation is
    made rather than only where the decision is taken. One person authorising themselves to decide
    twice is the failure the second-reviewer rule exists to prevent, and it should be impossible to
    write down, not merely refused later. */
 if (grant.decidedBy.trim() === grant.secondedBy.trim()) return 'The second person is a different person. A bootstrap decided and seconded by one name is one person clearing themselves.';
 if (!Number.isFinite(grant.expiresAt)) return 'A bootstrap authorisation has to expire.';
 return null;
}

/**
 * Mint one, at the console.
 *
 * `minutes` is bounded rather than free: an authorisation good for a day is an environment variable
 * wearing a signature, and the thing being avoided here is precisely a standing permission.
 */
export function mintBootstrapAuthorisation(
 config: ProtectionConfig,
 grant: { parties: readonly { id: string; roleId: string }[]; decidedBy: string; secondedBy: string; minutes?: number },
 now: () => number = () => Date.now()
): { token: string; fingerprint: string; expiresAt: number } {
 const minutes = grant.minutes ?? BOOTSTRAP_MINUTES;
 if (!Number.isFinite(minutes) || minutes <= 0 || minutes > BOOTSTRAP_MINUTES_MAX) {
  throw new Error(`A bootstrap authorisation lives between one and ${BOOTSTRAP_MINUTES_MAX} minutes. Longer than that is a standing permission, which is the thing this replaces.`);
 }
 const payload: BootstrapGrant & { nonce: string } = {
  nonce: randomUUID(),
  expiresAt: now() + Math.round(minutes * 60_000),
  parties: grant.parties.map(party => ({ id: party.id.trim(), roleId: party.roleId.trim() })),
  decidedBy: grant.decidedBy.trim(),
  secondedBy: grant.secondedBy.trim()
 };
 const refusal = refuseGrant(payload);
 if (refusal) throw new Error(refusal);
 const keys = createKeyRing(config);
 const body = encode(Buffer.from(JSON.stringify(payload), 'utf8'));
 const token = `${PREFIX}.${body}.${sign(keys, body)}`;
 return { token, fingerprint: bootstrapFingerprint(token), expiresAt: payload.expiresAt };
}

/**
 * The verifier the vetting module holds.
 *
 * Everything unknown refuses, in the shape the rest of the protection module refuses in: a token
 * with the wrong number of parts, a payload that is not the object this expects, a signature that
 * does not match, a grant that breaks a rule it should never have been minted against, or a deadline
 * that has passed. The refusal names which, because an operator with an expired token and an
 * operator with the wrong server have different things to do next.
 */
export function createBootstrapAuthority(keys: KeyRing): BootstrapAuthority {
 return {
  fingerprint: bootstrapFingerprint,
  verify(token, at) {
   const fingerprint = bootstrapFingerprint(token);
   const refuse = (reason: string): BootstrapVerdict => ({ ok: false, reason, fingerprint });
   const parts = token.trim().split('.');
   if (parts.length !== 3 || `${parts[0]}` !== PREFIX) {
    return refuse(`This is not a bootstrap authorisation. One looks like "${PREFIX}.<payload>.<signature>" and is produced by: npm run bootstrap -w @mythuso/api -- authorise …`);
   }
   const body = parts[1]!;
   const expected = sign(keys, body);
   const given = Buffer.from(parts[2]!, 'utf8');
   /* Length first, because timingSafeEqual throws on a mismatch rather than answering it. A length
      difference is not a secret — it is visible in the token — so leaking it costs nothing. */
   if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected, 'utf8'))) {
    return refuse('This bootstrap authorisation was not signed by this server\'s key ring. It was minted somewhere else, altered, or made against a key this server no longer holds.');
   }
   let payload: BootstrapGrant & { nonce: string };
   try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    const parties = parsed.parties;
    if (!Array.isArray(parties) || parties.some(party => typeof party !== 'object' || party === null)) return refuse('This bootstrap authorisation does not name a list of parties.');
    payload = {
     nonce: String(parsed.nonce ?? ''),
     expiresAt: Number(parsed.expiresAt),
     parties: (parties as Record<string, unknown>[]).map(party => ({ id: String(party.id ?? ''), roleId: String(party.roleId ?? '') })),
     decidedBy: String(parsed.decidedBy ?? ''),
     secondedBy: String(parsed.secondedBy ?? '')
    };
   } catch {
    return refuse('This bootstrap authorisation carries a payload that cannot be read.');
   }
   if (!payload.nonce) return refuse('This bootstrap authorisation has no identity of its own, so it could not be spent once.');
   /* Re-checked on the way in even though minting refused the same things. A signature proves who
      wrote it, never that what they wrote was allowed, and this is the side that has to be right. */
   const refusal = refuseGrant(payload);
   if (refusal) return refuse(refusal);
   if (at >= payload.expiresAt) {
    return refuse(`This bootstrap authorisation expired at ${new Date(payload.expiresAt).toISOString()}. Mint another, in front of the second person, and perform the ceremony while it is open.`);
   }
   return { ok: true, authorisation: { ...payload, fingerprint } };
  }
 };
}
