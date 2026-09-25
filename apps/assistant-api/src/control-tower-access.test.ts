import test from "node:test";
import assert from "node:assert/strict";
import { base32Encode, DIGITS, DRIFT_STEPS, generateSecret, STEP_SECONDS, totp } from "../../api/src/totp.ts";
import { hashPassword, parsePasswordHash } from "./lib/founder-access.ts";
import {
  clearedCookie,
  controlTowerAccessEnabled,
  controlTowerLine,
  createControlTowerAccess,
  crossSite,
  sessionCookie,
  type Env,
} from "./lib/control-tower-access.ts";
import contract from "../../../packages/catalog/control-tower-access.json" with { type: "json" };
import founderContract from "../../../packages/catalog/founder-access.json" with { type: "json" };

/* Control Tower access, held to what it refuses (packages/catalog/control-tower-access.json,
   lib/control-tower-access.ts). This is the lib alone — no server and no route contract yet, because the
   routes are the live pass. Time is always passed in, so the TOTP window, the lock and the session's
   fifteen minutes are tested rather than waited for. The fixtures are synthetic and shaped so
   scripts/check-boundaries.mjs's credential sweep has nothing to find: the password is a sentence nobody
   would use, and no secret is ever written beside a variable's name with an equals sign. */

const PASSWORD = "correct horse battery staple, synthetic";
const SECRET = generateSecret();
const T0 = Date.UTC(2026, 8, 25, 10, 0, 0);
const STEP = contract.totp.stepSeconds * 1000;
/* The headers a same-origin Control Tower request carries: the custom header, and Sec-Fetch-Site saying
   same-origin. Lowercased, as node:http hands them to the gate. */
const SAME_ORIGIN = {
  "content-type": "application/json",
  [contract.request.header.toLowerCase()]: contract.request.headerValue,
  "sec-fetch-site": contract.request.secFetchSite,
};

let hashed: string | null = null;
const credentialHash = async () => (hashed ??= await hashPassword(PASSWORD));

const env = async (overrides: Env = {}): Promise<Env> => ({
  [contract.enable.variable]: contract.enable.value,
  [contract.credential.passwordHashVariable]: await credentialHash(),
  [contract.credential.totpSecretVariable]: SECRET,
  ...overrides,
});
const codeAt = (at: number) => totp(SECRET, at);

/* A clock a test moves. */
const clock = (start = T0) => {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
};
/* The cookie pair a browser would send back, out of a full Set-Cookie string. */
const pairOf = (cookie: string) => cookie.split(";")[0]!;

/* ---- One scrypt floor and one TOTP, shared with founder access --------------------------------- */

test("the credential floor is founder access's, not a second one this file invented", () => {
  /* The five numbers, not the whole block: each contract explains its own floor in its own words, but the
     floor itself is one, because the lib parses and derives through founder access's scrypt. */
  for (const field of ["log2N", "r", "p", "keyLength", "saltBytes"] as const)
    assert.equal(contract.credential.scrypt[field], founderContract.credential.scrypt[field], `scrypt.${field}`);
  assert.equal(contract.credential.totpSecretBytes, founderContract.credential.totpSecretBytes);
  assert.equal(contract.session.idBytes, founderContract.session.idBytes, "256 random bits, as founder access");
});

test("the contract's TOTP numbers are apps/api/src/totp.ts's, which the lib imports", () => {
  assert.equal(contract.totp.codeDigits, DIGITS);
  assert.equal(contract.totp.stepSeconds, STEP_SECONDS);
  assert.equal(contract.totp.driftSteps, DRIFT_STEPS);
  assert.equal(contract.totp.implementation, "apps/api/src/totp.ts");
});

/* ---- Dark by default --------------------------------------------------------------------------- */

test("Control Tower access needs both halves: the enable line and a well-formed credential", async () => {
  const full = await env();
  assert.equal(controlTowerAccessEnabled(full), true);
  assert.equal(controlTowerAccessEnabled({ ...full, [contract.enable.variable]: undefined }), false, "no enable line");
  assert.equal(controlTowerAccessEnabled({ ...full, [contract.enable.variable]: "Enabled" }), false, "close is not exact");
  assert.equal(controlTowerAccessEnabled({ ...full, [contract.enable.variable]: "true" }), false);
  assert.equal(controlTowerAccessEnabled({ ...full, [contract.credential.passwordHashVariable]: undefined }), false, "no hash");
  assert.equal(controlTowerAccessEnabled({ ...full, [contract.credential.totpSecretVariable]: undefined }), false, "no secret");
  assert.equal(
    controlTowerAccessEnabled({ ...full, [contract.credential.totpSecretVariable]: base32Encode(Buffer.alloc(10, 1)) }),
    false,
    "a secret shorter than the contract's bytes",
  );
  assert.equal(controlTowerAccessEnabled({}), false, "an empty environment is dark");
});

test("a dark instance refuses at the gate and at sign-in, and never mints a session", async () => {
  const time = clock();
  const dark = createControlTowerAccess({}, time.now);
  assert.deepEqual(dark.gate(SAME_ORIGIN), { ok: false, refusalId: "control-tower-access-dark" });
  assert.deepEqual(await dark.signIn(PASSWORD, codeAt(time.now())), { ok: false, refusalId: "control-tower-access-dark" });
  assert.equal(dark.sessionFrom(sessionCookie("A".repeat(43))), false);
  assert.equal(dark.sessionExpiresAt(), null);
});

/* ---- Cross-site -------------------------------------------------------------------------------- */

test("the gate refuses a request without the header, or from another site, before anything is read", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  assert.equal(access.gate(SAME_ORIGIN), null, "a same-origin request with the header passes the gate");
  const { [contract.request.header.toLowerCase()]: _dropped, ...noHeader } = SAME_ORIGIN;
  assert.deepEqual(access.gate(noHeader), { ok: false, refusalId: "control-tower-request-cross-site" });
  for (const site of ["cross-site", "same-site", "none"])
    assert.deepEqual(access.gate({ ...SAME_ORIGIN, "sec-fetch-site": site }), {
      ok: false,
      refusalId: "control-tower-request-cross-site",
    });
  /* crossSite is the predicate the gate asks first. */
  assert.equal(crossSite(SAME_ORIGIN), false);
  assert.equal(crossSite(noHeader), true);
});

/* ---- Sign-in, the cookie and the session ------------------------------------------------------- */

test("sign-in mints exactly the specified cookie, and the session ends fifteen minutes later with no renewal", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  const signed = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(signed.ok, true);
  if (!signed.ok) return;
  const [head, ...attributes] = signed.cookie.split("; ");
  const [name, id] = head!.split("=");
  assert.equal(name, contract.session.cookie);
  assert.match(id!, /^[A-Za-z0-9_-]{43}$/, "256 random bits, base64url");
  assert.deepEqual(attributes, [...contract.session.attributes, `Max-Age=${contract.session.lifetimeSeconds}`]);
  assert.deepEqual(attributes, ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=900"]);
  assert.equal(signed.expiresAt, new Date(time.now() + contract.session.lifetimeSeconds * 1000).toISOString());

  const pair = pairOf(signed.cookie);
  assert.equal(access.sessionFrom(pair), true, "the live session is recognised");
  time.advance(contract.session.lifetimeSeconds * 1000 - 1);
  assert.equal(access.sessionFrom(pair), true, "still live a millisecond before");
  time.advance(1);
  assert.equal(access.sessionFrom(pair), false, "expired, with no renewal");
  assert.equal(access.sessionExpiresAt(), null);
  /* A cookie of the right shape that this process never minted is not a session. */
  time.advance(-contract.session.lifetimeSeconds * 1000);
  assert.equal(access.sessionFrom(`${contract.session.cookie}=${"A".repeat(43)}`), false);
});

test("a wrong password, a wrong code and a reused code are refused in the same words", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  const refused = { ok: false, refusalId: "control-tower-credentials-refused" } as const;
  assert.deepEqual(await access.signIn("not the password at all", codeAt(time.now())), refused);
  const wrong = codeAt(time.now()) === "000000" ? "111111" : "000000";
  assert.deepEqual(await access.signIn(PASSWORD, wrong), refused);
  const signed = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(signed.ok, true, "the right password and a fresh code sign in");
  /* The same code again, with the right password: refused, and in the words that do not say the password
     was right. */
  assert.deepEqual(await access.signIn(PASSWORD, codeAt(time.now())), refused);
  /* A code from the step before is burned too. */
  assert.deepEqual(await access.signIn(PASSWORD, codeAt(time.now() - STEP)), refused);
});

test("a new sign-in ends the previous session, and sign-out ends the live one", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  const first = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(first.ok, true);
  const firstPair = pairOf((first as { cookie: string }).cookie);
  time.advance(STEP);
  const second = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(second.ok, true);
  const secondPair = pairOf((second as { cookie: string }).cookie);
  assert.equal(access.sessionFrom(firstPair), false, "one session at a time: the first is gone");
  assert.equal(access.sessionFrom(secondPair), true);
  access.signOut();
  assert.equal(access.sessionFrom(secondPair), false, "sign-out ends the live session");
  assert.match(clearedCookie(), /Max-Age=0$/);
});

/* ---- The lock ---------------------------------------------------------------------------------- */

test("five consecutive failures lock the account for fifteen minutes and end the session", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  const signed = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(signed.ok, true);
  const openPair = pairOf((signed as { cookie: string }).cookie);
  time.advance(STEP);
  for (let i = 1; i < contract.lockout.consecutiveFailures; i++)
    assert.deepEqual(await access.signIn("wrong", codeAt(time.now())), { ok: false, refusalId: "control-tower-credentials-refused" });
  assert.deepEqual(await access.signIn("wrong", codeAt(time.now())), { ok: false, refusalId: "control-tower-locked-out" });
  /* Locked: the right password and a fresh code are refused too, and the session that was open is gone. */
  time.advance(STEP);
  assert.deepEqual(await access.signIn(PASSWORD, codeAt(time.now())), { ok: false, refusalId: "control-tower-locked-out" });
  assert.equal(access.sessionFrom(openPair), false);
  time.advance(contract.lockout.lockSeconds * 1000);
  const after = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(after.ok, true, "the lock lifts by itself");
});

test("a success resets the count: failures must be consecutive to lock", async () => {
  const time = clock();
  const access = createControlTowerAccess(await env(), time.now);
  for (let i = 1; i < contract.lockout.consecutiveFailures; i++)
    assert.deepEqual(await access.signIn("wrong", codeAt(time.now())), { ok: false, refusalId: "control-tower-credentials-refused" });
  const signed = await access.signIn(PASSWORD, codeAt(time.now()));
  assert.equal(signed.ok, true);
  time.advance(STEP);
  assert.deepEqual(await access.signIn("wrong", codeAt(time.now())), {
    ok: false,
    refusalId: "control-tower-credentials-refused",
  }, "the count started again from one");
});

/* ---- The audit line ---------------------------------------------------------------------------- */

test("the audit line is one JSON object carrying an event and an outcome, and nothing else", () => {
  const accepted = JSON.parse(controlTowerLine("control-tower.sign-in", "accepted"));
  assert.deepEqual(accepted, { event: "control-tower.sign-in", outcome: "accepted" });
  assert.deepEqual(JSON.parse(controlTowerLine("not-an-event", "accepted")), {
    event: "control-tower.unknown",
    outcome: "accepted",
  });
  for (const line of [
    controlTowerLine("control-tower.sign-in", "control-tower-credentials-refused"),
    controlTowerLine("control-tower.sign-out", "accepted"),
    controlTowerLine("control-tower.session", "control-tower-no-session"),
  ]) {
    assert.doesNotThrow(() => JSON.parse(line), "every line is one JSON object");
    assert.ok(!line.includes(PASSWORD) && !line.includes(SECRET), "a line carries no secret");
    assert.ok(!/\b\d{6}\b/.test(line), `a line carries something shaped like a code: ${line}`);
    assert.deepEqual(Object.keys(JSON.parse(line)).sort(), ["event", "outcome"]);
  }
});

test("the password is hashed at the shared floor and verifies there", async () => {
  const parsed = parsePasswordHash(await credentialHash());
  assert.ok(parsed);
  assert.equal(parsed.log2N, contract.credential.scrypt.log2N);
  assert.equal(parsed.r, contract.credential.scrypt.r);
  assert.equal(parsed.p, contract.credential.scrypt.p);
});
