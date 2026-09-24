import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  base32Encode,
  counterFor,
  generateSecret,
  hotp,
  totp,
} from "../../api/src/totp.ts";
import {
  createFounderAccess,
  founderAccessEnabled,
  founderLine,
  hashPassword,
  parsePasswordHash,
  REVEAL_ALLOWLIST,
  verifyPassword,
  type Env,
} from "./lib/founder-access.ts";
import { createAssistantServer, liveClinicalFlows } from "./server.ts";
import type { SpeechSeam } from "./lib/speech.ts";
import contract from "../../../packages/catalog/founder-access.json" with { type: "json" };
import assistantContract from "../../../packages/catalog/apis/assistant.json" with { type: "json" };

/* Founder access, held to what it refuses (packages/catalog/founder-access.json, lib/founder-access.ts).

   The fixtures are synthetic and shaped so scripts/check-boundaries.mjs's credential sweep has nothing
   to find: the two "keys" are fixed nonsense tokens with a hyphen in them, never assembled beside their
   variable's name with an equals sign, and the password is a sentence nobody would use. Time is always
   passed in, so the TOTP window, the lock and the session's fifteen minutes are tested rather than
   waited for. Every line the service writes while a test runs is read back and held to the absence of
   the password, every code typed, the cookie and both keys. */

const PASSWORD = "correct horse battery staple, synthetic";
const OPENAI_FIXTURE = "fixture-openai-0123456789abcdef";
const SPEECH_FIXTURE = "fixture-speech-fedcba9876543210";
const SECRET = generateSecret();
const T0 = Date.UTC(2026, 8, 24, 10, 0, 0);
const STEP = contract.totp.stepSeconds * 1000;
const HEADERS = {
  "content-type": "application/json",
  [contract.request.header]: contract.request.headerValue,
  "sec-fetch-site": "same-origin",
};

let hashed: string | null = null;
const credentialHash = async () => (hashed ??= await hashPassword(PASSWORD));

const env = async (overrides: Env = {}): Promise<Env> => ({
  [contract.enable.variable]: contract.enable.value,
  [contract.credential.passwordHashVariable]: await credentialHash(),
  [contract.credential.totpSecretVariable]: SECRET,
  [REVEAL_ALLOWLIST[0]!]: OPENAI_FIXTURE,
  [REVEAL_ALLOWLIST[1]!]: SPEECH_FIXTURE,
  ...overrides,
});
const codeAt = (at: number) => totp(SECRET, at);

/* A clock a test moves. */
const clock = (start = T0) => {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
};

const notSpeaking: SpeechSeam = {
  configured: () => false,
  recognize: async () => ({ ok: false }) as never,
  synthesize: async () => ({ ok: false }) as never,
};
const notSearching = async () => {
  throw new Error("a founder test never searches");
};

/* The server with a founder seam of the test's making, and every line it logs. */
async function withFounderServer(
  founderEnv: Env,
  now: () => number,
  body: (base: string) => Promise<void>,
): Promise<string[]> {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const server = createAssistantServer(
    undefined,
    notSearching as never,
    notSpeaking,
    liveClinicalFlows(),
    undefined,
    createFounderAccess(founderEnv, now),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await body(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log = original.log;
    console.error = original.error;
  }
  return lines;
}
const cookieOf = (response: Response) =>
  (response.headers.get("set-cookie") ?? "").split(";")[0]!;
const refusalOf = (id: string) => {
  for (const route of assistantContract.routes)
    for (const refusal of route.refusals) if (refusal.id === id) return refusal;
  throw new Error(`no refusal ${id}`);
};
async function refused(response: Response, id: string) {
  const refusal = refusalOf(id);
  assert.equal(response.status, refusal.status, `${id} answers ${refusal.status}`);
  const body = (await response.json()) as { refusalId: string; message: string };
  assert.equal(body.refusalId, id);
  assert.equal(body.message, refusal.statement, "the contract's own sentence, word for word");
}

/* ---- TOTP is the identity service's, and the identity service's is RFC 6238 -------------------- */

test("the TOTP founder access uses answers RFC 6238's SHA-1 vectors", () => {
  const seed = Buffer.from("12345678901234567890");
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ] as const)
    assert.equal(hotp(seed, counterFor(seconds * 1000), 8), expected, `T = ${seconds}`);
  assert.equal(base32Encode(seed), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

/* ---- The password ------------------------------------------------------------------------------ */

test("scrypt: the right password verifies, a wrong one and an empty one do not", async () => {
  const parsed = parsePasswordHash(await credentialHash());
  assert.ok(parsed);
  assert.equal(parsed.log2N, contract.credential.scrypt.log2N);
  assert.equal(await verifyPassword(PASSWORD, parsed), true);
  assert.equal(await verifyPassword(`${PASSWORD} `, parsed), false);
  assert.equal(await verifyPassword("", parsed), false);
});

test("a hash weaker than the contract's floor, or malformed, is not a credential", async () => {
  const good = (await credentialHash()).split(":");
  const weaker = [...good];
  weaker[1] = String(contract.credential.scrypt.log2N - 1);
  assert.equal(parsePasswordHash(weaker.join(":")), null, "N below the floor");
  assert.equal(parsePasswordHash(good.join("$")), null, "the wrong separator");
  assert.equal(parsePasswordHash(`bcrypt:${good.slice(1).join(":")}`), null, "another scheme");
  assert.equal(parsePasswordHash(""), null);
  assert.equal(parsePasswordHash(undefined), null);
});

/* ---- Dark by default ----------------------------------------------------------------------------- */

test("founder access needs both halves: the enable line and a well-formed credential", async () => {
  const full = await env();
  assert.equal(founderAccessEnabled(full), true);
  assert.equal(founderAccessEnabled({ ...full, [contract.enable.variable]: undefined }), false, "no enable line");
  assert.equal(founderAccessEnabled({ ...full, [contract.enable.variable]: "Enabled" }), false, "close is not exact");
  assert.equal(founderAccessEnabled({ ...full, [contract.enable.variable]: "true" }), false);
  assert.equal(founderAccessEnabled({ ...full, [contract.credential.passwordHashVariable]: undefined }), false, "no hash");
  assert.equal(founderAccessEnabled({ ...full, [contract.credential.totpSecretVariable]: undefined }), false, "no secret");
  assert.equal(
    founderAccessEnabled({ ...full, [contract.credential.totpSecretVariable]: base32Encode(Buffer.alloc(10, 1)) }),
    false,
    "a secret shorter than the contract's bytes",
  );
  assert.equal(founderAccessEnabled({}), false, "an empty environment is dark");
});

test("every founder route answers the dark refusal — never a 200 — while either half is missing", async () => {
  const time = clock();
  for (const founderEnv of [
    {},
    { ...(await env()), [contract.enable.variable]: undefined },
    { ...(await env()), [contract.credential.passwordHashVariable]: undefined },
  ]) {
    await withFounderServer(founderEnv, time.now, async (base) => {
      await refused(
        await fetch(`${base}/assistant/v1/founder/session`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }),
        }),
        "founder-access-dark",
      );
      await refused(await fetch(`${base}/assistant/v1/founder/session`, { method: "DELETE", headers: HEADERS }), "founder-access-dark");
      await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: HEADERS }), "founder-access-dark");
      await refused(
        await fetch(`${base}/assistant/v1/founder/reveal`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ name: REVEAL_ALLOWLIST[0], code: codeAt(time.now()) }),
        }),
        "founder-access-dark",
      );
    });
  }
});

test("the default server — the one a deploy starts — is dark", async () => {
  const saved = process.env[contract.enable.variable];
  delete process.env[contract.enable.variable];
  const server = createAssistantServer(undefined, notSearching as never, notSpeaking);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const original = console.log;
  console.log = () => {};
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: HEADERS }), "founder-access-dark");
  } finally {
    console.log = original;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (saved !== undefined) process.env[contract.enable.variable] = saved;
  }
});

/* ---- Cross-site ---------------------------------------------------------------------------------- */

test("a request without the founder header, or from another site, is refused before anything is read", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const body = JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) });
    const { [contract.request.header]: _dropped, ...noHeader } = HEADERS;
    await refused(await fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: noHeader, body }), "founder-request-cross-site");
    for (const site of ["cross-site", "same-site", "none"])
      await refused(
        await fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: { ...HEADERS, "sec-fetch-site": site }, body }),
        "founder-request-cross-site",
      );
    const forbidden = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: { ...HEADERS, origin: "https://attacker.invalid" },
      body,
    });
    assert.equal(forbidden.status, 403, "the origin policy refuses first");
    /* The origin policy never grants the founder header to anybody, so a browser on another site
       cannot even get past the preflight. */
    const preflight = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:5173", "access-control-request-headers": contract.request.header },
    });
    assert.ok(!(preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase().includes(contract.request.header.toLowerCase()));
  });
});

/* ---- Sign-in, the cookie and the session --------------------------------------------------------- */

test("sign-in sets exactly the specified cookie, and the session ends fifteen minutes later with no renewal", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const signed = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }),
    });
    assert.equal(signed.status, 200);
    assert.equal(signed.headers.get("cache-control"), "no-store");
    const cookie = signed.headers.get("set-cookie") ?? "";
    const [pair, ...attributes] = cookie.split("; ");
    const [name, id] = pair!.split("=");
    assert.equal(name, contract.session.cookie);
    assert.match(id!, /^[A-Za-z0-9_-]{43}$/, "256 random bits, base64url");
    assert.deepEqual(attributes, [...contract.session.attributes, `Max-Age=${contract.session.lifetimeSeconds}`]);
    assert.deepEqual(attributes, ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=900"]);
    const body = (await signed.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["expiresAt", "signedIn"], "the id travels in the cookie only");

    const withCookie = { ...HEADERS, cookie: cookieOf(signed) };
    assert.equal((await fetch(`${base}/assistant/v1/founder/keys`, { headers: withCookie })).status, 200);
    time.advance(contract.session.lifetimeSeconds * 1000 - 1);
    assert.equal((await fetch(`${base}/assistant/v1/founder/keys`, { headers: withCookie })).status, 200, "still live a millisecond before");
    time.advance(1);
    await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: withCookie }), "founder-no-session");
    await refused(
      await fetch(`${base}/assistant/v1/founder/keys`, { headers: { ...HEADERS, cookie: `${contract.session.cookie}=${"A".repeat(43)}` } }),
      "founder-no-session",
    );
  });
});

test("a wrong password, a wrong code and a reused code are refused in the same words", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const attempt = (password: string, code: string) =>
      fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: HEADERS, body: JSON.stringify({ password, code }) });
    await refused(await attempt("not the password at all", codeAt(time.now())), "founder-credentials-refused");
    const wrong = codeAt(time.now()) === "000000" ? "111111" : "000000";
    await refused(await attempt(PASSWORD, wrong), "founder-credentials-refused");
    assert.equal((await attempt(PASSWORD, codeAt(time.now()))).status, 200);
    /* The same code again, with the right password: refused, and in the words that do not say the
       password was right. */
    await refused(await attempt(PASSWORD, codeAt(time.now())), "founder-credentials-refused");
    /* A code from the step before is burned too. */
    await refused(await attempt(PASSWORD, codeAt(time.now() - STEP)), "founder-credentials-refused");
  });
});

test("a new sign-in ends the previous session, and sign-out ends the live one", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const signIn = () =>
      fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: HEADERS, body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }) });
    const first = cookieOf(await signIn());
    time.advance(STEP);
    const second = cookieOf(await signIn());
    await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: { ...HEADERS, cookie: first } }), "founder-no-session");
    const out = await fetch(`${base}/assistant/v1/founder/session`, { method: "DELETE", headers: { ...HEADERS, cookie: second } });
    assert.equal(out.status, 200);
    assert.match(out.headers.get("set-cookie") ?? "", /Max-Age=0$/);
    await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: { ...HEADERS, cookie: second } }), "founder-no-session");
  });
});

/* ---- The lock ------------------------------------------------------------------------------------ */

test("five consecutive failures lock the account for fifteen minutes and end the session", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const attempt = (password: string) =>
      fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: HEADERS, body: JSON.stringify({ password, code: codeAt(time.now()) }) });
    const open = cookieOf(await attempt(PASSWORD));
    time.advance(STEP);
    for (let i = 1; i < contract.lockout.consecutiveFailures; i++) await refused(await attempt("wrong"), "founder-credentials-refused");
    await refused(await attempt("wrong"), "founder-locked-out");
    /* Locked: the right password and a fresh code are refused too, and the session that was open is gone. */
    time.advance(STEP);
    await refused(await attempt(PASSWORD), "founder-locked-out");
    await refused(await fetch(`${base}/assistant/v1/founder/keys`, { headers: { ...HEADERS, cookie: open } }), "founder-no-session");
    time.advance(contract.lockout.lockSeconds * 1000);
    assert.equal((await attempt(PASSWORD)).status, 200, "the lock lifts by itself");
  });
});

test("a success resets the count: failures must be consecutive to lock", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const attempt = (password: string) =>
      fetch(`${base}/assistant/v1/founder/session`, { method: "POST", headers: HEADERS, body: JSON.stringify({ password, code: codeAt(time.now()) }) });
    for (let i = 1; i < contract.lockout.consecutiveFailures; i++) await refused(await attempt("wrong"), "founder-credentials-refused");
    assert.equal((await attempt(PASSWORD)).status, 200);
    time.advance(STEP);
    await refused(await attempt("wrong"), "founder-credentials-refused");
  });
});

/* ---- The reveal ---------------------------------------------------------------------------------- */

test("a reveal needs a live session AND a fresh code, and answers only the two allowlisted names", async () => {
  const time = clock();
  const lines = await withFounderServer(await env(), time.now, async (base) => {
    const reveal = (cookie: string | null, name: string, code: string) =>
      fetch(`${base}/assistant/v1/founder/reveal`, {
        method: "POST",
        headers: cookie ? { ...HEADERS, cookie } : HEADERS,
        body: JSON.stringify({ name, code }),
      });
    /* No session: a correct fresh code alone reveals nothing. */
    await refused(await reveal(null, REVEAL_ALLOWLIST[0]!, codeAt(time.now())), "founder-no-session");

    const signIn = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }),
    });
    const cookie = cookieOf(signIn);
    /* The code that signed in is burned: the reveal needs the next one. */
    await refused(await reveal(cookie, REVEAL_ALLOWLIST[0]!, codeAt(time.now())), "founder-code-refused");
    await refused(await reveal(cookie, REVEAL_ALLOWLIST[0]!, "12345"), "founder-code-refused");
    time.advance(STEP);

    /* Nothing outside the allowlist, whatever it is called. */
    for (const name of [
      contract.credential.passwordHashVariable,
      contract.credential.totpSecretVariable,
      contract.enable.variable,
      "AZURE_OPENAI_ENDPOINT",
      "AZURE_OPENAI_API_KEY",
      "PATH",
      "azure_openai_key",
      "",
    ])
      await refused(await reveal(cookie, name, codeAt(time.now())), "founder-name-not-allowed");

    const shown = await reveal(cookie, REVEAL_ALLOWLIST[0]!, codeAt(time.now()));
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get("cache-control"), "no-store");
    assert.equal(shown.headers.get("pragma"), "no-cache");
    const body = (await shown.json()) as Record<string, string>;
    assert.deepEqual(body, {
      name: REVEAL_ALLOWLIST[0],
      revealedKey: OPENAI_FIXTURE,
      lastFour: OPENAI_FIXTURE.slice(-4),
      fingerprint: createHash("sha256").update(OPENAI_FIXTURE).digest("hex").slice(0, 16),
    });
    /* The same code a second time is refused: it was burned by the reveal. */
    await refused(await reveal(cookie, REVEAL_ALLOWLIST[1]!, codeAt(time.now())), "founder-code-refused");
    time.advance(STEP);
    const speech = (await (await reveal(cookie, REVEAL_ALLOWLIST[1]!, codeAt(time.now()))).json()) as Record<string, string>;
    assert.equal(speech.revealedKey, SPEECH_FIXTURE);
  });
  for (const line of lines) {
    for (const secret of [PASSWORD, OPENAI_FIXTURE, SPEECH_FIXTURE, SECRET, contract.session.cookie])
      assert.ok(!line.includes(secret), `a log line carries something it must never: ${line}`);
    assert.doesNotThrow(() => JSON.parse(line), "every line is one JSON object");
    assert.ok(!/\b\d{6}\b/.test(line), `a log line carries something shaped like a code: ${line}`);
  }
  const reveals = lines.map((l) => JSON.parse(l)).filter((l) => l.event === "founder.reveal" && l.outcome === "accepted");
  assert.equal(reveals.length, 2, "one audit line per reveal");
  assert.deepEqual(Object.keys(reveals[0]).sort(), ["event", "fingerprint", "name", "outcome"]);
});

test("the metadata read says present, last four and fingerprint — never a key", async () => {
  const time = clock();
  await withFounderServer(await env({ [REVEAL_ALLOWLIST[1]!]: undefined }), time.now, async (base) => {
    const signIn = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }),
    });
    const read = await fetch(`${base}/assistant/v1/founder/keys`, { headers: { ...HEADERS, cookie: cookieOf(signIn) } });
    const text = await read.text();
    assert.ok(!text.includes(OPENAI_FIXTURE), "the key is not in the metadata");
    const body = JSON.parse(text) as { keys: Record<string, unknown>[] };
    assert.deepEqual(body.keys, [
      {
        name: REVEAL_ALLOWLIST[0],
        present: true,
        lastFour: OPENAI_FIXTURE.slice(-4),
        fingerprint: createHash("sha256").update(OPENAI_FIXTURE).digest("hex").slice(0, 16),
      },
      { name: REVEAL_ALLOWLIST[1], present: false, lastFour: null, fingerprint: null },
    ]);
    time.advance(STEP);
    await refused(
      await fetch(`${base}/assistant/v1/founder/reveal`, {
        method: "POST",
        headers: { ...HEADERS, cookie: cookieOf(signIn) },
        body: JSON.stringify({ name: REVEAL_ALLOWLIST[1], code: codeAt(time.now()) }),
      }),
      "founder-key-not-set",
    );
  });
});

test("wrong codes at a reveal count toward the lock, and the lock ends the session", async () => {
  const time = clock();
  await withFounderServer(await env(), time.now, async (base) => {
    const signIn = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ password: PASSWORD, code: codeAt(time.now()) }),
    });
    const cookie = cookieOf(signIn);
    const wrong = () =>
      fetch(`${base}/assistant/v1/founder/reveal`, {
        method: "POST",
        headers: { ...HEADERS, cookie },
        body: JSON.stringify({ name: REVEAL_ALLOWLIST[0], code: codeAt(time.now() + 10 * STEP) }),
      });
    for (let i = 1; i < contract.lockout.consecutiveFailures; i++) await refused(await wrong(), "founder-code-refused");
    await refused(await wrong(), "founder-locked-out");
    await refused(await wrong(), "founder-no-session");
  });
});

/* ---- The audit line ------------------------------------------------------------------------------ */

test("the audit line carries no name outside the allowlist and no fingerprint of the wrong shape", () => {
  const line = JSON.parse(
    founderLine("founder.reveal", "accepted", { name: contract.credential.passwordHashVariable, fingerprint: OPENAI_FIXTURE }),
  );
  assert.deepEqual(line, { event: "founder.reveal", outcome: "accepted" });
  assert.deepEqual(JSON.parse(founderLine("not-an-event", "accepted")), { event: "founder.unknown", outcome: "accepted" });
});

test("the allowlist is exactly the two Azure keys", () => {
  assert.deepEqual([...REVEAL_ALLOWLIST], ["AZURE_OPENAI_KEY", "AZURE_SPEECH_KEY"]);
});
