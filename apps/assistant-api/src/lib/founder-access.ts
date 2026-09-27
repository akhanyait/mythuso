import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { base32Decode, verifyTotp } from "../../../api/src/totp.ts";
import contract from "../../../../packages/catalog/founder-access.json" with { type: "json" };

/* Founder access — a sign-in for one person and a guarded reveal of two keys, added 24 September 2026
   on the founder's instruction (packages/catalog/founder-access.json#decision).

   WHAT IT IS FOR. The founder holds the Azure resources behind the assistant, and the one time a key
   has to be read back — a key pasted with text around it, a rotation to check — has meant a terminal
   on the box. This lets the founder read the two Azure keys from the Control Tower instead, and
   nothing else from anywhere.

   WHY IT IS BUILT THE WAY IT IS. The Control Tower has no authentication of its own: its role
   switcher is a preview picker, so anything the portal can fetch, anybody on the internet can fetch.
   Every control here therefore lives in this process, and none of it trusts the page:

     Dark by default. Every founder route refuses unless BOTH the enable line is in the service's
     environment AND a well-formed credential is. The provisioning script writes the credential and
     never the enable line; no deploy writes either. A missing line is a refusal, not a 200.

     Two factors at sign-in — a password checked against an scrypt hash, and an RFC 6238 code through
     apps/api/src/totp.ts, the one TOTP implementation in this repository — and a refusal that never
     says which of them failed.

     A fresh code for every reveal, on top of the session. A stolen cookie alone reads the keys'
     metadata for at most two hours and reveals nothing.

     Every accepted code is burned: the step it came from and every step before it are refused, so a
     code read over a shoulder is worth nothing once it has been used.

     Five consecutive failures lock the account for fifteen minutes and end every session, and the
     lock is checked before any password is hashed.

     A session is a random 256-bit id in this process's memory, hashed before it is kept, compared in
     constant time, one at a time, two hours from sign-in with no renewal (fifteen minutes until the
     founder's amendment of 28 September 2026). A restart signs the
     founder out, because nothing about a session is written down.

     Exactly two names can be revealed, read from the contract, and a name outside them is refused
     before the environment is read.

   WHAT IT IS NOT. It is not a vault and not key custody: the keys stay in /etc/mythuso/assistant.env,
   and root on the box reads them whether this exists or not. It does not stop the founder's own
   compromised browser, which sees what the founder sees. docs/governance/FOUNDER-ACCESS.md is the
   full account, residual risks included.

   Nothing in this module logs. The audit line is built by founderLine() below, whose parameters
   cannot carry a password, a code, a cookie or a value; server.ts writes it. */

export type Env = Record<string, string | undefined>;

export const FOUNDER = contract;
/* The allowlist, as the contract holds it and nowhere else. scripts/check-boundaries.mjs holds the
   contract to exactly the two Azure key names, and this file to reading the list from there. */
export const REVEAL_ALLOWLIST: readonly string[] = contract.reveal.allowlist;
export type FounderRefusalId =
  | "founder-access-dark"
  | "founder-request-cross-site"
  | "founder-locked-out"
  | "founder-credentials-refused"
  | "founder-no-session"
  | "founder-code-refused"
  | "founder-name-not-allowed"
  | "founder-key-not-set";
export type Refused = { ok: false; refusalId: FounderRefusalId };

/* ---- The credential ------------------------------------------------------------------------- */

export type PasswordHash = {
  log2N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
};

const floor = contract.credential.scrypt;
const B64URL = /^[A-Za-z0-9_-]+$/;

/* scrypt:<log2N>:<r>:<p>:<salt>:<key>, base64url. Anything that does not parse, or asks for less work
   than the contract's floor, is not a credential — a hash written at N = 2^10 by a hurried script
   would be a password protected by nothing, so it switches founder access off rather than on. */
export function parsePasswordHash(text: string | undefined): PasswordHash | null {
  const parts = (text ?? "").trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [log2N, r, p] = parts.slice(1, 4).map((n) => (/^\d{1,3}$/.test(n!) ? Number(n) : NaN));
  if (!Number.isInteger(log2N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (log2N! < floor.log2N || log2N! > 24 || r! < floor.r || r! > 32 || p! < floor.p || p! > 16)
    return null;
  if (!B64URL.test(parts[4]!) || !B64URL.test(parts[5]!)) return null;
  const salt = Buffer.from(parts[4]!, "base64url");
  const key = Buffer.from(parts[5]!, "base64url");
  if (salt.length < floor.saltBytes || key.length < floor.keyLength) return null;
  return { log2N: log2N!, r: r!, p: p!, salt, key };
}

const scryptOptions = (h: { log2N: number; r: number; p: number }): ScryptOptions => ({
  N: 2 ** h.log2N,
  r: h.r,
  p: h.p,
  /* scrypt needs 128·N·r bytes; node refuses anything over maxmem, which defaults to 32 MiB. Twice
     the need, so the parameters decide the cost rather than a default nobody chose. */
  maxmem: 256 * 2 ** h.log2N * h.r,
});

const derive = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, length, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

/* The hash a credential is written as. The provisioning script computes the same thing with inline
   node on the box, because the box has no copy of this file; the tests hold the two to one format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(floor.saltBytes);
  const key = await derive(password, salt, floor.keyLength, scryptOptions(floor));
  return ["scrypt", floor.log2N, floor.r, floor.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/* Constant time: the derived key is compared with timingSafeEqual, and the derivation runs whatever
   the password is — an empty one included — so how long a refusal takes says nothing about why. */
export async function verifyPassword(password: string, hash: PasswordHash): Promise<boolean> {
  const derived = await derive(password, hash.salt, hash.key.length, scryptOptions(hash));
  return derived.length === hash.key.length && timingSafeEqual(derived, hash.key);
}

export type FounderCredential = { hash: PasswordHash; totpSecret: string };

export function founderCredential(env: Env): FounderCredential | null {
  const hash = parsePasswordHash(env[contract.credential.passwordHashVariable]);
  const totpSecret = (env[contract.credential.totpSecretVariable] ?? "").trim();
  if (!hash || !/^[A-Z2-7]+=*$/.test(totpSecret)) return null;
  try {
    if (base32Decode(totpSecret).length < contract.credential.totpSecretBytes) return null;
  } catch {
    return null;
  }
  return { hash, totpSecret };
}

/* Both halves, or nothing. The enable line is exact — "enabled", not "yes", not "true", not
   "Enabled" — for the same reason the production acknowledgement is: it is typed from the RUNBOOK,
   and a value close enough is how a switch gets thrown by a typo. */
export function founderAccessEnabled(env: Env): boolean {
  return (
    (env[contract.enable.variable] ?? "").trim() === contract.enable.value &&
    founderCredential(env) !== null
  );
}

/* ---- The request, before anything is read ---------------------------------------------------- */

/* A request a page on another site could have made. Sec-Fetch-Site, when a browser sends it, must say
   same-origin; the custom header must be present, and a cross-site page cannot send it without a
   preflight the origin policy never grants. */
export function crossSite(headers: IncomingHttpHeaders): boolean {
  const site = headers["sec-fetch-site"];
  if (site !== undefined && site !== contract.request.secFetchSite) return true;
  return headers[contract.request.header.toLowerCase()] !== contract.request.headerValue;
}

/* ---- Cookies ----------------------------------------------------------------------------------- */

const COOKIE = contract.session.cookie;
export const sessionCookie = (id: string): string =>
  `${COOKIE}=${id}; ${contract.session.attributes.join("; ")}; Max-Age=${contract.session.lifetimeSeconds}`;
export const clearedCookie = (): string =>
  `${COOKIE}=; ${contract.session.attributes.join("; ")}; Max-Age=0`;
const presented = (cookieHeader: string | undefined): string | null => {
  for (const part of (cookieHeader ?? "").split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE}=`)) {
      const id = trimmed.slice(COOKIE.length + 1);
      return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
    }
  }
  return null;
};
const digest = (text: string): Buffer => createHash("sha256").update(text).digest();

/* ---- What may be said about a key -------------------------------------------------------------- */

export const fingerprintOf = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, contract.reveal.fingerprintHexLength);
export const lastCharactersOf = (value: string): string =>
  value.slice(-contract.reveal.lastCharacters);

export type KeyMetadata = {
  name: string;
  present: boolean;
  lastFour: string | null;
  fingerprint: string | null;
};

/* ---- The audit line ---------------------------------------------------------------------------- */

export type FounderEvent = (typeof contract.audit.events)[number];
/* One line, one JSON object: the event, the outcome — "accepted" or the refusal's own id — and, for a
   reveal or a metadata read of one key, its allowlisted name and fingerprint prefix. The parameters
   are the whole of what can reach the log, and none of them can be a password, a code, a cookie or a
   value: the name is checked against the allowlist and the fingerprint against its own shape here,
   so a caller that passed anything else writes neither. */
export function founderLine(
  event: string,
  outcome: "accepted" | FounderRefusalId | "invalid-request" | "required-field-missing" | "payload-too-large",
  key?: { name: string; fingerprint: string | null },
): string {
  const line: Record<string, string> = {
    event: (contract.audit.events as readonly string[]).includes(event) ? event : "founder.unknown",
    outcome,
  };
  if (key && REVEAL_ALLOWLIST.includes(key.name)) line.name = key.name;
  if (key?.fingerprint && new RegExp(`^[0-9a-f]{${contract.reveal.fingerprintHexLength}}$`).test(key.fingerprint))
    line.fingerprint = key.fingerprint;
  return JSON.stringify(line);
}

/* ---- The account ------------------------------------------------------------------------------- */

export type SignedIn = { ok: true; cookie: string; expiresAt: string };
export type Revealed = {
  ok: true;
  name: string;
  value: string;
  lastFour: string;
  fingerprint: string;
};

export interface FounderAccess {
  /* The refusal every founder route asks for first: cross-site, then dark. */
  gate(headers: IncomingHttpHeaders): Refused | null;
  signIn(password: unknown, code: unknown): Promise<SignedIn | Refused>;
  /* Whether the cookie header carries the live session. */
  sessionFrom(cookieHeader: string | undefined): boolean;
  sessionExpiresAt(): string | null;
  signOut(): void;
  keys(): KeyMetadata[];
  reveal(name: unknown, code: unknown): Revealed | Refused;
}

export function createFounderAccess(
  env: Env = process.env,
  now: () => number = () => Date.now(),
): FounderAccess {
  /* Read once, as the activation gate is: the environment is a fact about how this process was
     started, and switching founder access on or off is a restart, never a request. */
  const enabled = founderAccessEnabled(env);
  const credential = enabled ? founderCredential(env) : null;
  const lifetime = contract.session.lifetimeSeconds * 1000;
  let session: { idHash: Buffer; expiresAt: number } | null = null;
  let failures = 0;
  let lockedUntil = 0;
  let lastUsedStep: number | null = null;

  const locked = () => now() < lockedUntil;
  /* A failure counts toward the lock whichever factor it was, and the fifth ends every session. */
  const fail = (refusalId: FounderRefusalId): Refused => {
    failures += 1;
    if (failures >= contract.lockout.consecutiveFailures) {
      failures = 0;
      lockedUntil = now() + contract.lockout.lockSeconds * 1000;
      session = null;
      return { ok: false, refusalId: "founder-locked-out" };
    }
    return { ok: false, refusalId };
  };
  const live = () => {
    if (session && now() >= session.expiresAt) session = null;
    return session;
  };

  return {
    gate(headers) {
      if (crossSite(headers)) return { ok: false, refusalId: "founder-request-cross-site" };
      if (!enabled || !credential) return { ok: false, refusalId: "founder-access-dark" };
      return null;
    },

    async signIn(password, code) {
      if (!credential) return { ok: false, refusalId: "founder-access-dark" };
      if (locked()) return { ok: false, refusalId: "founder-locked-out" };
      const passwordOk = await verifyPassword(typeof password === "string" ? password : "", credential.hash);
      /* After the await, and synchronously from here to the burn: two sign-ins racing on one code
         cannot both spend it, and a lock that landed while this one was hashing still holds. */
      if (locked()) return { ok: false, refusalId: "founder-locked-out" };
      const check = verifyTotp(credential.totpSecret, typeof code === "string" ? code : "", now(), lastUsedStep);
      /* A reused code with the right password is refused in the same words as a wrong password: at
         sign-in, a refusal that named the factor would tell a stranger which half they already had. */
      if (!passwordOk || !check.ok) return fail("founder-credentials-refused");
      lastUsedStep = check.step;
      failures = 0;
      const id = randomBytes(contract.session.idBytes).toString("base64url");
      const expiresAt = now() + lifetime;
      session = { idHash: digest(id), expiresAt };
      return { ok: true, cookie: sessionCookie(id), expiresAt: new Date(expiresAt).toISOString() };
    },

    sessionFrom(cookieHeader) {
      const current = live();
      const id = presented(cookieHeader);
      if (!current || !id || locked()) return false;
      return timingSafeEqual(digest(id), current.idHash);
    },

    sessionExpiresAt() {
      const current = live();
      return current ? new Date(current.expiresAt).toISOString() : null;
    },

    signOut() {
      session = null;
    },

    keys() {
      return REVEAL_ALLOWLIST.map((name) => {
        const value = env[name] ?? "";
        return value
          ? { name, present: true, lastFour: lastCharactersOf(value), fingerprint: fingerprintOf(value) }
          : { name, present: false, lastFour: null, fingerprint: null };
      });
    },

    reveal(name, code) {
      if (!credential) return { ok: false, refusalId: "founder-access-dark" };
      if (locked()) return { ok: false, refusalId: "founder-locked-out" };
      /* The allowlist before the environment: a name outside it is refused without anything being
         read, so no request can make this process look up the password hash, the TOTP secret or a
         line somebody adds to an env file next year. */
      if (typeof name !== "string" || !REVEAL_ALLOWLIST.includes(name))
        return { ok: false, refusalId: "founder-name-not-allowed" };
      const value = env[name] ?? "";
      if (!value) return { ok: false, refusalId: "founder-key-not-set" };
      const check = verifyTotp(credential.totpSecret, typeof code === "string" ? code : "", now(), lastUsedStep);
      if (!check.ok) return fail("founder-code-refused");
      lastUsedStep = check.step;
      failures = 0;
      return { ok: true, name, value, lastFour: lastCharactersOf(value), fingerprint: fingerprintOf(value) };
    },
  };
}
