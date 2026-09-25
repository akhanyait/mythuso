import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { base32Decode, verifyTotp } from "../../../api/src/totp.ts";
/* One password hash in this repository, not two: the scrypt parse, the derivation and the constant-time
   compare are founder access's, imported rather than copied, so the floor in this contract is held equal
   to founder access's by the build (scripts/check-boundaries.mjs, in the live pass) and by the unit test
   that reads both. Only the contract-specific wiring — the enable line, the credential's own variables,
   the cross-site header, the cookie and the session — is this module's. */
import {
  parsePasswordHash,
  verifyPassword,
  type Env,
  type PasswordHash,
} from "./founder-access.ts";
import contract from "../../../../packages/catalog/control-tower-access.json" with { type: "json" };

/* Control Tower access — a sign-in for the people who administer the portal, and nothing else, added
   25 September 2026 on the founder's ruling of 24 September (packages/catalog/control-tower-access.json#decision).

   WHAT IT IS FOR. The Control Tower's role switcher is a preview picker: anything the portal can fetch,
   anybody on the internet can fetch. This is a real gate for the one mode where the portal is administered
   rather than demonstrated. The founder ruled that authentication waits until an SMS provider exists, and
   that until then the gate is an authenticator only — a password and an RFC 6238 code — with the identity
   service off.

   WHY IT IS BUILT THE WAY IT IS. Every control lives in this process and none of it trusts the page:

     Dark by default. Every route refuses unless BOTH the enable line is in the service's environment AND a
     well-formed credential is. A provisioning script writes the credential and never the enable line; no
     deploy writes either. A missing line is a refusal, not a 200.

     Two factors at sign-in — a password checked against an scrypt hash (founder access's parse and
     compare), and an RFC 6238 code through apps/api/src/totp.ts, the one TOTP in this repository — and a
     refusal that never says which of them failed.

     Every accepted code is burned: the step it came from and every step before it are refused, so a code
     read over a shoulder is worth nothing once it has been used.

     Five consecutive failures lock the account for fifteen minutes and end every session, and the lock is
     checked before any password is hashed.

     A session is a random 256-bit id in this process's memory, hashed before it is kept, compared in
     constant time, one at a time, fifteen minutes from sign-in with no renewal. A restart signs the
     administrator out, because nothing about a session is written down.

   WHAT IT IS NOT. It grants the portal and nothing else: there is no key reveal here, no allowlist and no
   per-action second code, because a Control Tower session hands an administrator the screens they already
   administer rather than a secret. Founder access (lib/founder-access.ts) is the only sign-in that reveals
   a key, and it stays the only one.

   Nothing in this module logs. The audit line is built by controlTowerLine() below, whose parameters
   cannot carry a password, a code or a cookie; server.ts writes it. */

export const CONTROL_TOWER = contract;

/* The environment shape is founder access's, re-exported so a caller of this module needs only this one. */
export type { Env };

export type ControlTowerRefusalId =
  | "control-tower-access-dark"
  | "control-tower-request-cross-site"
  | "control-tower-locked-out"
  | "control-tower-credentials-refused"
  | "control-tower-no-session";
export type Refused = { ok: false; refusalId: ControlTowerRefusalId };

/* ---- The credential ------------------------------------------------------------------------- */

export type ControlTowerCredential = { hash: PasswordHash; totpSecret: string };

export function controlTowerCredential(env: Env): ControlTowerCredential | null {
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

/* Both halves, or nothing. The enable line is exact — "enabled", not "yes", not "true", not "Enabled" —
   for the same reason founder access's is: it is typed from the RUNBOOK, and a value close enough is how a
   switch gets thrown by a typo. */
export function controlTowerAccessEnabled(env: Env): boolean {
  return (
    (env[contract.enable.variable] ?? "").trim() === contract.enable.value &&
    controlTowerCredential(env) !== null
  );
}

/* ---- The request, before anything is read ---------------------------------------------------- */

/* A request a page on another site could have made. Sec-Fetch-Site, when a browser sends it, must say
   same-origin; the custom header must be present, and a cross-site page cannot send it without a preflight
   the origin policy never grants. */
export function crossSite(headers: IncomingHttpHeaders): boolean {
  const site = headers["sec-fetch-site"];
  if (site !== undefined && site !== contract.request.secFetchSite) return true;
  return headers[contract.request.header.toLowerCase()] !== contract.request.headerValue;
}

/* ---- Cookies --------------------------------------------------------------------------------- */

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

/* ---- The audit line --------------------------------------------------------------------------- */

export type ControlTowerEvent = (typeof contract.audit.events)[number];
/* One line, one JSON object: the event and the outcome — "accepted" or the refusal's own id. There is no
   third field, because a Control Tower session reveals no key: the parameters are the whole of what can
   reach the log, and neither can be a password, a code or a cookie. */
export function controlTowerLine(
  event: string,
  outcome: "accepted" | ControlTowerRefusalId | "invalid-request" | "required-field-missing" | "payload-too-large",
): string {
  const line: Record<string, string> = {
    event: (contract.audit.events as readonly string[]).includes(event) ? event : "control-tower.unknown",
    outcome,
  };
  return JSON.stringify(line);
}

/* ---- The account ------------------------------------------------------------------------------ */

export type SignedIn = { ok: true; cookie: string; expiresAt: string };

export interface ControlTowerAccess {
  /* The refusal every Control Tower route asks for first: cross-site, then dark. */
  gate(headers: IncomingHttpHeaders): Refused | null;
  signIn(password: unknown, code: unknown): Promise<SignedIn | Refused>;
  /* Whether the cookie header carries the live session. */
  sessionFrom(cookieHeader: string | undefined): boolean;
  sessionExpiresAt(): string | null;
  signOut(): void;
}

export function createControlTowerAccess(
  env: Env = process.env,
  now: () => number = () => Date.now(),
): ControlTowerAccess {
  /* Read once, as founder access does: the environment is a fact about how this process was started, and
     switching Control Tower access on or off is a restart, never a request. */
  const enabled = controlTowerAccessEnabled(env);
  const credential = enabled ? controlTowerCredential(env) : null;
  const lifetime = contract.session.lifetimeSeconds * 1000;
  let session: { idHash: Buffer; expiresAt: number } | null = null;
  let failures = 0;
  let lockedUntil = 0;
  let lastUsedStep: number | null = null;

  const locked = () => now() < lockedUntil;
  /* A failure counts toward the lock whichever factor it was, and the fifth ends every session. */
  const fail = (refusalId: ControlTowerRefusalId): Refused => {
    failures += 1;
    if (failures >= contract.lockout.consecutiveFailures) {
      failures = 0;
      lockedUntil = now() + contract.lockout.lockSeconds * 1000;
      session = null;
      return { ok: false, refusalId: "control-tower-locked-out" };
    }
    return { ok: false, refusalId };
  };
  const live = () => {
    if (session && now() >= session.expiresAt) session = null;
    return session;
  };

  return {
    gate(headers) {
      if (crossSite(headers)) return { ok: false, refusalId: "control-tower-request-cross-site" };
      if (!enabled || !credential) return { ok: false, refusalId: "control-tower-access-dark" };
      return null;
    },

    async signIn(password, code) {
      if (!credential) return { ok: false, refusalId: "control-tower-access-dark" };
      if (locked()) return { ok: false, refusalId: "control-tower-locked-out" };
      const passwordOk = await verifyPassword(typeof password === "string" ? password : "", credential.hash);
      /* After the await, and synchronously from here to the burn: two sign-ins racing on one code cannot
         both spend it, and a lock that landed while this one was hashing still holds. */
      if (locked()) return { ok: false, refusalId: "control-tower-locked-out" };
      const check = verifyTotp(credential.totpSecret, typeof code === "string" ? code : "", now(), lastUsedStep);
      /* A reused code with the right password is refused in the same words as a wrong password: at sign-in,
         a refusal that named the factor would tell a stranger which half they already had. */
      if (!passwordOk || !check.ok) return fail("control-tower-credentials-refused");
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
  };
}
