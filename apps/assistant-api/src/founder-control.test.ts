import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSecret, totp } from "../../api/src/totp.ts";
import { createFounderAccess, hashPassword, type Env } from "./lib/founder-access.ts";
import { openFounderState, type FounderState } from "./lib/founder-state.ts";
import { openSettingsHistory, SETTINGS_FILE } from "./lib/settings-history.ts";
import { fingerprintOf, openVault, VAULT_CARDS, VAULT_FILE, VAULT_KEY_VARIABLE } from "./lib/provider-vault.ts";
import { selectedSpeech } from "./lib/speech.ts";
import { createAssistantServer, liveClinicalFlows } from "./server.ts";
import type { SpeechSeam } from "./lib/speech.ts";
import contract from "../../../packages/catalog/founder-access.json" with { type: "json" };
import assistantContract from "../../../packages/catalog/apis/assistant.json" with { type: "json" };
import registry from "../../../packages/catalog/api-registry.json" with { type: "json" };

/* The founder's eight control routes of 28 September 2026 — the settings history and the provider vault
   — held through the real server to packages/catalog/apis/assistant.json: dark, no session and cross-site
   refused in the contract's words; a set answers metadata and never the key; a rotation, a deletion and
   an enable change need a fresh code and a live session; a disabled provider's adapter refuses; a test
   runs against a fake fetch; a settings change is accepted or refused by the shared rule and read back
   after a simulated restart from the file; the speak route honours a saved male voice on a presentation
   register and ignores it on an emergency; and the vault refuses without its master key. Every line the
   service writes while a test runs is read back and held to the absence of every secret. */

const PASSWORD = "correct horse battery staple, synthetic";
const OPENAI_FIXTURE = "fixture-openai-0123456789abcdef";
const SPEECH_FIXTURE = "fixturespeechkey0123456789abcdef";
const NEW_SPEECH_KEY = "fixturespeechkeyfedcba9876543210";
const ELEVEN_KEY = "fixture-elevenlabs-key-0123456789abc";
const MASTER = randomBytes(32).toString("base64");
const SECRET = generateSecret();
const T0 = Date.UTC(2026, 8, 28, 10, 0, 0);
const STEP = contract.totp.stepSeconds * 1000;
const HEADERS = {
  "content-type": "application/json",
  [contract.request.header]: contract.request.headerValue,
  "sec-fetch-site": "same-origin",
};
const AZURE_ENV = { AZURE_SPEECH_KEY: SPEECH_FIXTURE, AZURE_SPEECH_REGION: "southafricanorth" };

let hashed: string | null = null;
const credentialHash = async () => (hashed ??= await hashPassword(PASSWORD));
const founderEnv = async (overrides: Env = {}): Promise<Env> => ({
  [contract.enable.variable]: contract.enable.value,
  [contract.credential.passwordHashVariable]: await credentialHash(),
  [contract.credential.totpSecretVariable]: SECRET,
  AZURE_OPENAI_KEY: OPENAI_FIXTURE,
  ...AZURE_ENV,
  ...overrides,
});
const codeAt = (at: number) => totp(SECRET, at);
const clock = (start = T0) => {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
};
const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "mythuso-founder-control-"));
  return { dir, state: openFounderState(dir), done: () => rmSync(dir, { recursive: true }) };
};
const notSearching = async () => {
  throw new Error("a founder test never searches");
};
const notSpeaking: SpeechSeam = {
  configured: () => false,
  recognize: async () => ({ ok: false }) as never,
  synthesize: async () => ({ ok: false }) as never,
};
/* A fetch that records the SSML or the URL each call would have sent and answers a byte of audio. */
const recording = () => {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? ""), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(new Uint8Array([1]), { status: 200 });
  }) as typeof fetch;
  return { calls, impl };
};

type Harness = {
  env: Env;
  now: () => number;
  state: FounderState | null;
  vaultEnv?: Env;
  speech?: SpeechSeam | null;
  fetchImpl?: typeof fetch;
};
/* The server with a founder seam, a state directory, a history and a vault of the test's making, and
   every line it logs. */
async function withControlServer(harness: Harness, body: (base: string, cookieFor: () => Promise<string>) => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const settings = openSettingsHistory(harness.state);
  const vault = openVault(harness.state, harness.vaultEnv ?? harness.env);
  const speech =
    harness.speech === undefined
      ? notSpeaking
      : harness.speech === null
        ? selectedSpeech(harness.fetchImpl ?? fetch, vault.envFor(), settings.speech, harness.now, (card) => vault.envFor(card), settings.presentationVoice)
        : harness.speech;
  const server = createAssistantServer(
    undefined,
    notSearching as never,
    speech,
    liveClinicalFlows(),
    undefined,
    createFounderAccess(harness.env, harness.now),
    harness.state,
    settings,
    vault,
    harness.now,
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookieFor = async () => {
    const signed = await fetch(`${base}/assistant/v1/founder/session`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ password: PASSWORD, code: codeAt(harness.now()) }),
    });
    assert.equal(signed.status, 200, "signed in");
    return (signed.headers.get("set-cookie") ?? "").split(";")[0]!;
  };
  try {
    await body(base, cookieFor);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log = original.log;
    console.error = original.error;
  }
  return lines;
}
const refusalOf = (id: string) => {
  for (const route of assistantContract.routes) for (const refusal of route.refusals) if (refusal.id === id) return refusal;
  /* An engine refusal — speech-not-configured — is declared once, at the engine level. */
  for (const refusal of assistantContract.refusals) if (refusal.id === id) return refusal;
  throw new Error(`no refusal ${id}`);
};
async function refused(response: Response, id: string) {
  const refusal = refusalOf(id);
  assert.equal(response.status, refusal.status, `${id} answers ${refusal.status}`);
  const body = (await response.json()) as { refusalId: string; message: string };
  assert.equal(body.refusalId, id);
  assert.equal(body.message, refusal.statement, "the contract's own sentence, word for word");
}
const CONTROL_ROUTES = assistantContract.routes.filter((r) => r.path.startsWith("/v1/founder/") && !["/v1/founder/session", "/v1/founder/keys", "/v1/founder/reveal"].includes(r.path));
const addressOf = (route: { path: string }) => `/assistant${route.path.replace("{card}", "azure-speech")}`;
const noSecret = (lines: string[], ...secrets: string[]) => {
  for (const line of lines) {
    for (const secret of [PASSWORD, OPENAI_FIXTURE, SPEECH_FIXTURE, NEW_SPEECH_KEY, ELEVEN_KEY, MASTER, SECRET, contract.session.cookie, ...secrets])
      assert.ok(!line.includes(secret), `a log line carries something it must never: ${line}`);
    assert.doesNotThrow(() => JSON.parse(line), "every line is one JSON object");
    assert.ok(!/\b\d{6}\b/.test(line), `a log line carries something shaped like a code: ${line}`);
  }
};

/* ---- The gate, on every one of the eight ------------------------------------------------------- */

test("the eight control routes are declared for the founder alone, and every one is dark, cross-site-refused and session-gated in the contract's words", async () => {
  assert.equal(CONTROL_ROUTES.length, 8);
  for (const route of CONTROL_ROUTES) {
    assert.deepEqual(route.callers, ["founder"]);
    assert.equal(route.status, "built");
    assert.equal(route.enforcedBy?.mechanism, "founder-session");
    for (const id of ["founder-request-cross-site", "founder-access-dark", "founder-no-session"])
      assert.ok(route.refusals.some((r) => r.id === id), `${route.method} ${route.path} declares ${id}`);
  }
  const box = sandbox();
  try {
    const time = clock();
    /* Dark: the enable line is missing. */
    await withControlServer({ env: await founderEnv({ [contract.enable.variable]: undefined }), now: time.now, state: box.state }, async (base) => {
      for (const route of CONTROL_ROUTES)
        await refused(await fetch(`${base}${addressOf(route)}`, { method: route.method, headers: HEADERS, body: route.method === "GET" ? undefined : "{}" }), "founder-access-dark");
    });
    /* On: cross-site first, then no session. */
    await withControlServer({ env: await founderEnv(), now: time.now, state: box.state }, async (base) => {
      for (const route of CONTROL_ROUTES) {
        await refused(await fetch(`${base}${addressOf(route)}`, { method: route.method, headers: { "content-type": "application/json" }, body: route.method === "GET" ? undefined : "{}" }), "founder-request-cross-site");
        await refused(await fetch(`${base}${addressOf(route)}`, { method: route.method, headers: { ...HEADERS, "sec-fetch-site": "cross-site" }, body: route.method === "GET" ? undefined : "{}" }), "founder-request-cross-site");
        await refused(await fetch(`${base}${addressOf(route)}`, { method: route.method, headers: HEADERS, body: route.method === "GET" ? undefined : "{}" }), "founder-no-session");
      }
    });
  } finally {
    box.done();
  }
});

/* ---- The vault ------------------------------------------------------------------------------------ */

test("a key set answers metadata only, a rotation keeps createdAt, a deletion falls back to the environment, and every write needs a fresh code", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const env = await founderEnv({ [VAULT_KEY_VARIABLE]: MASTER });
    const lines = await withControlServer({ env, now: time.now, state: box.state }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      const before = (await (await fetch(`${base}/assistant/v1/founder/providers`, { headers: withCookie })).json()) as { providers: Record<string, unknown>[]; vaultUnlocked: boolean; persisted: boolean; expiresAt: string };
      assert.equal(before.vaultUnlocked, true);
      assert.equal(before.persisted, true);
      assert.equal(before.providers.length, VAULT_CARDS.length);
      const speechBefore = before.providers.find((p) => p.card === "azure-speech")!;
      assert.equal(speechBefore.source, "environment");
      assert.equal(speechBefore.lastFour, SPEECH_FIXTURE.slice(-4));
      assert.equal(speechBefore.setBy, null);
      /* The code that signed in is burned: a set with it is refused, and nothing is stored. */
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-code-refused");
      assert.equal(statSync(box.dir).isDirectory() && !readFileSync(join(box.dir, "founder-audit.jsonl"), "utf8").includes("key-set\",\"outcome\":\"accepted"), true);
      time.advance(STEP);
      /* A fresh code stores it. The answer is metadata and never the key. */
      const set = await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) });
      assert.equal(set.status, 200);
      assert.equal(set.headers.get("cache-control"), "no-store");
      const meta = (await set.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(meta).sort(), ["card", "configured", "createdAt", "enabled", "fingerprintPrefix", "keyVariable", "lastFour", "lastRotatedAt", "setBy", "source"]);
      assert.equal(meta.source, "vault");
      assert.equal(meta.lastFour, NEW_SPEECH_KEY.slice(-4));
      assert.equal(meta.fingerprintPrefix, fingerprintOf(NEW_SPEECH_KEY));
      assert.equal(meta.createdAt, new Date(time.now()).toISOString());
      assert.equal(meta.lastRotatedAt, null);
      assert.equal(meta.setBy, "founder");
      assert.ok(!JSON.stringify(meta).includes(NEW_SPEECH_KEY));
      const onDisk = readFileSync(join(box.dir, VAULT_FILE), "utf8");
      assert.ok(!onDisk.includes(NEW_SPEECH_KEY), "encrypted at rest");
      assert.equal(statSync(join(box.dir, VAULT_FILE)).mode & 0o777, 0o600);
      /* The same code twice is burned; the reveal route still shows the ENVIRONMENT's key — the vault never reveals. */
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-code-refused");
      time.advance(STEP);
      const revealed = (await (await fetch(`${base}/assistant/v1/founder/reveal`, { method: "POST", headers: withCookie, body: JSON.stringify({ name: "AZURE_SPEECH_KEY", code: codeAt(time.now()) }) })).json()) as { revealedKey: string };
      assert.equal(revealed.revealedKey, SPEECH_FIXTURE, "the reveal reads the environment, never the vault");
      time.advance(STEP);
      /* Rotate: createdAt kept, lastRotatedAt stamped. */
      const rotated = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: "fixturespeechkeyrotated00000000001", code: codeAt(time.now()) }) })).json()) as Record<string, unknown>;
      assert.equal(rotated.createdAt, meta.createdAt);
      assert.equal(rotated.lastRotatedAt, new Date(time.now()).toISOString());
      time.advance(STEP);
      /* A malformed key, a card the vault does not hold, a missing field. */
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: "has spaces in it 0123456789", code: codeAt(time.now()) }) }), "founder-key-malformed");
      time.advance(STEP);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/ollama/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-card-not-known");
      const missing = await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY }) });
      assert.equal(missing.status, 400);
      assert.equal(((await missing.json()) as { refusalId: string }).refusalId, "required-field-missing");
      const notJson = await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: "{" });
      await refused(notJson, "invalid-request");
      /* Delete needs a fresh code too, and leaves the environment's key in force. */
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "DELETE", headers: withCookie, body: JSON.stringify({ code: "000000" }) }), "founder-code-refused");
      const deleted = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "DELETE", headers: withCookie, body: JSON.stringify({ code: codeAt(time.now()) }) })).json()) as Record<string, unknown>;
      assert.equal(deleted.source, "environment");
      assert.equal(deleted.lastFour, SPEECH_FIXTURE.slice(-4));
      assert.equal(deleted.createdAt, null);
      /* Without a session, nothing — not even with a fresh code. */
      time.advance(STEP);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: HEADERS, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-no-session");
    });
    noSecret(lines, "fixturespeechkeyrotated00000000001");
    const sets = lines.map((l) => JSON.parse(l)).filter((l) => l.event === "founder.provider.key-set" && l.outcome === "accepted");
    assert.equal(sets.length, 2, "one audit line per key stored");
    assert.deepEqual(Object.keys(sets[0]).sort(), ["card", "event", "fingerprint", "outcome"]);
    assert.equal(sets[0].card, "azure-speech");
    assert.equal(sets[0].fingerprint, fingerprintOf(NEW_SPEECH_KEY));
    /* The audit file carries the same lines, stamped. */
    const audit = readFileSync(join(box.dir, contract.audit.file), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(audit.some((l) => l.event === "founder.provider.key-set" && l.outcome === "accepted" && typeof l.at === "string"));
    assert.equal(statSync(join(box.dir, contract.audit.file)).mode & 0o777, 0o600);
    for (const line of audit) assert.ok(!JSON.stringify(line).includes(NEW_SPEECH_KEY));
  } finally {
    box.done();
  }
});

test("disable needs a fresh code; disabled, the adapter refuses and the speak route says not configured; enable brings it back; a test refuses while it is off", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const env = await founderEnv({ [VAULT_KEY_VARIABLE]: MASTER });
    const { calls, impl } = recording();
    await withControlServer({ env, now: time.now, state: box.state, speech: null, fetchImpl: impl }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      const speak = () => fetch(`${base}/assistant/v1/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Hello.", language: "en-ZA", register: "routine" }) });
      assert.equal((await speak()).status, 200, "configured from the environment, the voice reads");
      assert.equal(((await (await fetch(`${base}/assistant/health`)).json()) as { speech: boolean }).speech, true);
      /* Off, with the burned sign-in code: refused. */
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: false, code: codeAt(time.now()) }) }), "founder-code-refused");
      time.advance(STEP);
      const off = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: false, code: codeAt(time.now()) }) })).json()) as Record<string, unknown>;
      assert.equal(off.enabled, false);
      assert.equal(off.configured, true, "the key is still held; the provider is switched off");
      const sent = calls.length;
      await refused(await speak(), "speech-not-configured");
      assert.equal(calls.length, sent, "a disabled provider is never called");
      assert.equal(((await (await fetch(`${base}/assistant/health`)).json()) as { speech: boolean }).speech, false, "health says so too");
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/test`, { method: "POST", headers: withCookie }), "founder-provider-disabled");
      /* The wrong kind of value, and a card the vault does not know. */
      time.advance(STEP);
      const wrongKind = await fetch(`${base}/assistant/v1/founder/providers/azure-speech/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: "yes", code: codeAt(time.now()) }) });
      assert.equal(wrongKind.status, 400);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/payfast/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: true, code: codeAt(time.now()) }) }), "founder-card-not-known");
      /* Back on. */
      const on = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: true, code: codeAt(time.now()) }) })).json()) as Record<string, unknown>;
      assert.equal(on.enabled, true);
      assert.equal((await speak()).status, 200);
    });
    /* The switch survives a restart: a new vault over the same file. */
    const again = openVault(box.state, env);
    assert.equal(again.card("azure-speech")!.enabled, true);
  } finally {
    box.done();
  }
});

test("a test runs one call through a fake fetch and answers the outcome and latency, never the key; not configured and unknown cards are refused", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const env = await founderEnv({ [VAULT_KEY_VARIABLE]: MASTER, ELEVENLABS_REGION: "united-states" });
    /* The route's test call goes through the global fetch; the vault takes it as a parameter, so the
       route-level proof stands on the vault's own test with the server's env view, and the route is held
       to the refusals it answers before any call. */
    const lines = await withControlServer({ env, now: time.now, state: box.state }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      await refused(await fetch(`${base}/assistant/v1/founder/providers/elevenlabs/test`, { method: "POST", headers: withCookie }), "founder-provider-not-configured");
      await refused(await fetch(`${base}/assistant/v1/founder/providers/deepseek/test`, { method: "POST", headers: withCookie }), "founder-card-not-known");
    });
    noSecret(lines);
    const vault = openVault(box.state, env);
    assert.ok(vault.setKey("elevenlabs", ELEVEN_KEY, time.now()).ok);
    let seen: Record<string, string> = {};
    const tested = await vault.test(
      "elevenlabs",
      (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        seen = (init?.headers ?? {}) as Record<string, string>;
        time.advance(80);
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
      time.now,
    );
    assert.ok(tested.ok);
    assert.equal(tested.answer.outcome, "ok");
    assert.equal(tested.answer.latencyMs, 80);
    assert.equal(seen["xi-api-key"], ELEVEN_KEY, "the vault's key is what is tested");
    assert.ok(!JSON.stringify(tested).includes(ELEVEN_KEY));
  } finally {
    box.done();
  }
});

test("the logs route answers the audit lines that name a card — and the Azure key's reveals — capped, oldest first", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const env = await founderEnv({ [VAULT_KEY_VARIABLE]: MASTER });
    await withControlServer({ env, now: time.now, state: box.state }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      time.advance(STEP);
      await fetch(`${base}/assistant/v1/founder/reveal`, { method: "POST", headers: withCookie, body: JSON.stringify({ name: "AZURE_SPEECH_KEY", code: codeAt(time.now()) }) });
      time.advance(STEP);
      await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) });
      await fetch(`${base}/assistant/v1/founder/providers/elevenlabs/test`, { method: "POST", headers: withCookie });
      const logs = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/logs`, { headers: withCookie })).json()) as { card: string; lines: Record<string, string>[]; persisted: boolean };
      assert.equal(logs.card, "azure-speech");
      assert.equal(logs.persisted, true);
      const events = logs.lines.map((l) => `${l.event}:${l.outcome}`);
      assert.ok(events.includes("founder.reveal:accepted"), "the Azure key's reveal names the card through its variable");
      assert.ok(events.includes("founder.provider.key-set:accepted"));
      assert.ok(!events.some((e) => e.startsWith("founder.provider.test")), "another card's test is not this card's log");
      for (const line of logs.lines) {
        assert.match(line.at, /^\d{4}-\d{2}-\d{2}T/);
        assert.ok(!JSON.stringify(line).includes(NEW_SPEECH_KEY) && !JSON.stringify(line).includes(SPEECH_FIXTURE));
      }
      assert.ok(logs.lines.length <= contract.audit.logsTail);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/yoco/logs`, { headers: withCookie }), "founder-card-not-known");
    });
  } finally {
    box.done();
  }
});

test("without the master key the vault is locked: reads answer, every set and delete is refused and says so", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const lines = await withControlServer({ env: await founderEnv(), now: time.now, state: box.state }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      const read = (await (await fetch(`${base}/assistant/v1/founder/providers`, { headers: withCookie })).json()) as { vaultUnlocked: boolean; providers: Record<string, unknown>[] };
      assert.equal(read.vaultUnlocked, false);
      assert.equal(read.providers.find((p) => p.card === "azure-openai")!.source, "environment");
      time.advance(STEP);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-vault-locked");
      time.advance(STEP);
      await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "DELETE", headers: withCookie, body: JSON.stringify({ code: codeAt(time.now()) }) }), "founder-vault-locked");
      assert.equal(statSync(box.dir).isDirectory(), true);
    });
    noSecret(lines);
    assert.ok(!readFileSync(join(box.dir, contract.audit.file), "utf8").includes(NEW_SPEECH_KEY));
  } finally {
    box.done();
  }
});

test("without a state directory every founder write is refused as unavailable, reads say persisted: false, and the audit goes to the journal alone", async () => {
  const time = clock();
  const lines = await withControlServer({ env: await founderEnv({ [VAULT_KEY_VARIABLE]: MASTER }), now: time.now, state: null }, async (base, cookieFor) => {
    const cookie = await cookieFor();
    const withCookie = { ...HEADERS, cookie };
    const settings = (await (await fetch(`${base}/assistant/v1/founder/settings`, { headers: withCookie })).json()) as { persisted: boolean; settingsVersion: number };
    assert.equal(settings.persisted, false);
    assert.equal(settings.settingsVersion, 1);
    const providers = (await (await fetch(`${base}/assistant/v1/founder/providers`, { headers: withCookie })).json()) as { persisted: boolean; vaultUnlocked: boolean };
    assert.equal(providers.persisted, false);
    assert.equal(providers.vaultUnlocked, true, "the master key is there; the directory is not");
    await refused(await fetch(`${base}/assistant/v1/founder/settings/changes`, { method: "POST", headers: withCookie, body: JSON.stringify({ setting: "presentation-voice-routine", from: "female", to: "male", reason: "why" }) }), "founder-state-unavailable");
    time.advance(STEP);
    await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/key`, { method: "PUT", headers: withCookie, body: JSON.stringify({ key: NEW_SPEECH_KEY, code: codeAt(time.now()) }) }), "founder-state-unavailable");
    time.advance(STEP);
    await refused(await fetch(`${base}/assistant/v1/founder/providers/azure-speech/enabled`, { method: "POST", headers: withCookie, body: JSON.stringify({ enabled: false, code: codeAt(time.now()) }) }), "founder-state-unavailable");
    const logs = (await (await fetch(`${base}/assistant/v1/founder/providers/azure-speech/logs`, { headers: withCookie })).json()) as { lines: unknown[]; persisted: boolean };
    assert.deepEqual(logs, { card: "azure-speech", lines: [], persisted: false } as never);
  });
  noSecret(lines);
  assert.ok(lines.some((l) => l.includes('"event":"founder.settings.change","outcome":"founder-state-unavailable"')));
});

/* ---- The settings history ------------------------------------------------------------------------- */

test("a settings change is accepted or refused by the shared rule, read back after a simulated restart, and the speak route honours a saved male voice on a presentation register and ignores it on an emergency", async () => {
  const box = sandbox();
  try {
    const time = clock();
    const env = await founderEnv();
    const { calls, impl } = recording();
    const speak = (base: string, register: string | undefined, language = "en-ZA") =>
      fetch(`${base}/assistant/v1/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "A visit costs from R399.", language, register }) });
    const voiceOf = async (response: Response) => ((await response.json()) as { voice: string }).voice;
    const lines = await withControlServer({ env, now: time.now, state: box.state, speech: null, fetchImpl: impl }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const withCookie = { ...HEADERS, cookie };
      const read = (await (await fetch(`${base}/assistant/v1/founder/settings`, { headers: withCookie })).json()) as { settingsVersion: number; settings: Record<string, unknown>[]; history: unknown[]; persisted: boolean; expiresAt: string };
      assert.equal(read.settingsVersion, 1);
      assert.equal(read.persisted, true);
      assert.deepEqual(read.history, []);
      assert.equal(read.settings.find((s) => s.setting === "presentation-voice-routine")!.inForce, "female");
      assert.deepEqual(Object.keys(read).sort(), ["expiresAt", "history", "persisted", "settings", "settingsVersion"]);
      assert.equal(await voiceOf(await speak(base, "routine")), "en-ZA-LeahNeural", "before: the platform default");
      /* Refused by the shared rules, in the shared words. */
      const change = (body: unknown) => fetch(`${base}/assistant/v1/founder/settings/changes`, { method: "POST", headers: withCookie, body: JSON.stringify(body) });
      await refused(await change({ setting: "presentation-voice-routine", from: "female", to: "male" }), "setting-change-without-reason");
      await refused(await change({ setting: "presentation-voice-routine", from: "female", to: "neutral", reason: "why" }), "setting-out-of-range");
      await refused(await change({ setting: "no-such-setting", from: "female", to: "male", reason: "why" }), "setting-not-known");
      await refused(await change({ setting: "presentation-voice-routine", from: "male", to: "female", reason: "why" }), "settings-version-stale");
      await refused(await change({ setting: "presentation-voice-routine", from: "female", to: "female", reason: "why" }), "setting-unchanged");
      const missing = await change({ setting: "presentation-voice-routine", to: "male", reason: "why" });
      assert.equal(missing.status, 400);
      /* Accepted: no code is asked for a setting — the session is the founder's signature. */
      const accepted = await change({ setting: "presentation-voice-routine", from: "female", to: "male", reason: "I made everything male." });
      assert.equal(accepted.status, 200);
      const made = (await accepted.json()) as { settingsVersion: number; appliesFrom: string };
      assert.equal(made.settingsVersion, 2);
      assert.equal(made.appliesFrom, new Date(time.now()).toISOString());
      /* The voice test now hears the male voice on the presentation register, and the female one on an emergency. */
      assert.equal(await voiceOf(await speak(base, "routine")), "en-ZA-LukeNeural", "the founder's male reaches the voice");
      assert.match(calls.at(-1)!.body, /<voice name="en-ZA-LukeNeural">/);
      assert.equal(await voiceOf(await speak(base, "emergency")), "en-ZA-LeahNeural", "an emergency ignores the history");
      assert.equal(await voiceOf(await speak(base, "refusal")), "en-ZA-LeahNeural");
      assert.equal(await voiceOf(await speak(base, undefined)), "en-ZA-LeahNeural", "no register: the default");
      assert.equal(await voiceOf(await speak(base, "navigation")), "en-ZA-LeahNeural", "a register nobody changed");
      assert.equal(await voiceOf(await speak(base, "routine", "af")), "af-ZA-WillemNeural", "per language");
      /* Read back: the history names the change against the administrator role, with the founder as the reference. */
      const after = (await (await fetch(`${base}/assistant/v1/founder/settings`, { headers: withCookie })).json()) as { settingsVersion: number; history: Record<string, unknown>[]; settings: Record<string, unknown>[] };
      assert.equal(after.settingsVersion, 2);
      assert.equal(after.history.length, 1);
      assert.deepEqual(Object.keys(after.history[0]!).sort(), ["at", "byRef", "byRole", "from", "reason", "setting", "settingsVersion", "to"]);
      assert.equal(after.history[0]!.byRef, "founder");
      assert.equal(after.history[0]!.byRole, "admin");
      assert.equal(after.settings.find((s) => s.setting === "presentation-voice-routine")!.setAtVersion, 2);
      /* A stale expectedVersion is refused; the right one is accepted. */
      await refused(await change({ setting: "azure-presentation-speed-percent", from: 100, to: 120, reason: "faster", expectedVersion: 1 }), "settings-version-stale");
      assert.equal((await change({ setting: "azure-presentation-speed-percent", from: 100, to: 120, reason: "faster", expectedVersion: 2 })).status, 200);
      assert.match(calls.at(-1)?.body ?? "", /./);
      await speak(base, "routine");
      assert.match(calls.at(-1)!.body, /<prosody rate="\+20%">/, "the speech settings reach the reading too");
    });
    noSecret(lines);
    const changes = lines.map((l) => JSON.parse(l)).filter((l) => l.event === "founder.settings.change");
    assert.ok(changes.some((l) => l.outcome === "accepted" && l.setting === "presentation-voice-routine"));
    assert.ok(changes.some((l) => l.outcome === "setting-out-of-range"));
    for (const line of changes) assert.ok(!("to" in line) && !("from" in line), "a settings audit line names the setting, never the value");
    /* The file, and a simulated restart: a new server over the same directory reads the male voice. */
    const file = readFileSync(join(box.dir, SETTINGS_FILE), "utf8").trim().split("\n");
    assert.equal(file.length, 2);
    assert.equal(statSync(join(box.dir, SETTINGS_FILE)).mode & 0o777, 0o600);
    await withControlServer({ env, now: time.now, state: openFounderState(box.dir), speech: null, fetchImpl: impl }, async (base, cookieFor) => {
      const cookie = await cookieFor();
      const read = (await (await fetch(`${base}/assistant/v1/founder/settings`, { headers: { ...HEADERS, cookie } })).json()) as { settingsVersion: number };
      assert.equal(read.settingsVersion, 3, "replayed from the file");
      assert.equal(await voiceOf(await speak(base, "routine")), "en-ZA-LukeNeural", "after a restart the founder's voice still reads");
      assert.equal(await voiceOf(await speak(base, "emergency")), "en-ZA-LeahNeural");
    });
  } finally {
    box.done();
  }
});

test("no field of any founder answer is named like key material, and the vault's cards are exactly the built providers with a key variable", () => {
  const never = new Set((registry.keyMetadata.neverFields as string[]).map((n) => n.toLowerCase()));
  const walk = (fields: { field: string; fields?: unknown[] }[], where: string) => {
    for (const f of fields) {
      assert.ok(!never.has(f.field.toLowerCase()) || (where === "POST /v1/founder/reveal" && f.field === "revealedKey"), `${where} answers "${f.field}"`);
      if (Array.isArray(f.fields)) walk(f.fields as never, where);
    }
  };
  for (const route of assistantContract.routes.filter((r) => r.path.startsWith("/v1/founder/")))
    walk(route.response as never, `${route.method} ${route.path}`);
  for (const { card, keyVariable } of VAULT_CARDS) {
    const found = registry.cards.find((c) => c.id === card) as { buildStatus: string; environment: string[] };
    assert.equal(found.buildStatus, "built", `${card} is built`);
    assert.ok(found.environment.includes(keyVariable), `${card} reads ${keyVariable}`);
  }
});
