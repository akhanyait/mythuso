import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFounderState } from "./founder-state.ts";
import { fingerprintOf, isMasterKeyShape, masterKeyOf, openVault, VAULT_CARDS, VAULT_FILE, VAULT_KEY_VARIABLE } from "./provider-vault.ts";
import { cloudSpeech } from "./speech.ts";
import contract from "../../../../packages/catalog/founder-access.json" with { type: "json" };

/* The provider vault, held to packages/catalog/founder-access.json#vault: a key stored is a key
   encrypted, readable through envFor() alone and never through a metadata field; a locked vault refuses
   every write and says so; a disabled card is a card whose adapter finds nothing to configure; a test
   is one authenticated call that never carries the key back. The fixtures are synthetic — nonsense
   tokens with a hyphen, never beside their variable's name with an equals sign — and the master key is
   thirty-two bytes from the CSPRNG made for the test. */

const MASTER = randomBytes(32).toString("base64");
const SPEECH_FIXTURE = "fixturespeechkey0123456789abcdef";
const ELEVEN_FIXTURE = "fixture-elevenlabs-0123456789abcdef";
const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);

const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "mythuso-vault-"));
  return { state: openFounderState(dir), dir, done: () => rmSync(dir, { recursive: true }) };
};
const mustNotFetch: typeof fetch = async () => {
  throw new Error("a test that did not hand over an answer must never reach the network");
};

test("the master key is thirty-two bytes, base64, or the vault is locked", () => {
  assert.ok(masterKeyOf({ [VAULT_KEY_VARIABLE]: MASTER }));
  assert.equal(masterKeyOf({ [VAULT_KEY_VARIABLE]: randomBytes(16).toString("base64") }), null, "sixteen bytes is not the key");
  assert.equal(masterKeyOf({ [VAULT_KEY_VARIABLE]: "not base64 at all!" }), null);
  assert.equal(masterKeyOf({}), null);
  assert.ok(isMasterKeyShape(MASTER));
});

test("a stored key is encrypted at rest, 0600, read back through envFor() alone, and described without its value", () => {
  const box = sandbox();
  try {
    const vault = openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER, AZURE_SPEECH_REGION: "southafricanorth" });
    assert.equal(vault.unlocked, true);
    assert.equal(vault.persisted, true);
    const stored = vault.setKey("azure-speech", SPEECH_FIXTURE, T0);
    assert.ok(stored.ok);
    const meta = stored.answer;
    assert.equal(meta.configured, true);
    assert.equal(meta.source, "vault");
    assert.equal(meta.enabled, true);
    assert.equal(meta.lastFour, SPEECH_FIXTURE.slice(-4));
    assert.equal(meta.fingerprintPrefix, fingerprintOf(SPEECH_FIXTURE));
    assert.equal(meta.fingerprintPrefix!.length, contract.reveal.fingerprintHexLength);
    assert.equal(meta.createdAt, new Date(T0).toISOString());
    assert.equal(meta.lastRotatedAt, null);
    assert.equal(meta.setBy, "founder");
    assert.ok(!JSON.stringify(meta).includes(SPEECH_FIXTURE), "no metadata field carries the key");
    const onDisk = readFileSync(join(box.dir, VAULT_FILE), "utf8");
    assert.ok(!onDisk.includes(SPEECH_FIXTURE), "the file holds ciphertext, never the key");
    assert.equal(statSync(join(box.dir, VAULT_FILE)).mode & 0o777, 0o600);
    assert.equal(vault.envFor("azure-speech").AZURE_SPEECH_KEY, SPEECH_FIXTURE, "the adapter's view reads the plaintext");
    assert.equal(vault.envFor().AZURE_SPEECH_KEY, SPEECH_FIXTURE);
    /* And the Azure adapter, handed that view, is configured. */
    assert.equal(cloudSpeech(mustNotFetch, vault.envFor("azure-speech")).configured("tts"), true);
    /* A rotation keeps createdAt and stamps lastRotatedAt; the previous value is gone. */
    const rotated = vault.setKey("azure-speech", "fixturespeechkeyfedcba9876543210", T0 + 60_000);
    assert.ok(rotated.ok);
    assert.equal(rotated.answer.createdAt, new Date(T0).toISOString());
    assert.equal(rotated.answer.lastRotatedAt, new Date(T0 + 60_000).toISOString());
    assert.equal(vault.envFor().AZURE_SPEECH_KEY, "fixturespeechkeyfedcba9876543210");
    /* Replayed from the file by a new vault — a restart. */
    const again = openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER });
    assert.equal(again.envFor().AZURE_SPEECH_KEY, "fixturespeechkeyfedcba9876543210");
    assert.equal(again.card("azure-speech")!.source, "vault");
    /* The wrong master key reads nothing, and says the card is configured by nothing. */
    const wrong = openVault(box.state, { [VAULT_KEY_VARIABLE]: randomBytes(32).toString("base64") });
    assert.equal(wrong.envFor().AZURE_SPEECH_KEY, undefined);
  } finally {
    box.done();
  }
});

test("a stored key whose authentication tag has been cut short is not read: the tag is the full sixteen bytes or nothing", () => {
  /* 1 October 2026. GCM checks a short tag against that much of the real one and no more, so without
     authTagLength a vault file whose tag was cut to four bytes still decrypted. */
  const box = sandbox();
  try {
    const vault = openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER, AZURE_SPEECH_REGION: "southafricanorth" });
    assert.ok(vault.setKey("azure-speech", SPEECH_FIXTURE, T0).ok);
    const path = join(box.dir, VAULT_FILE);
    const file = JSON.parse(readFileSync(path, "utf8")) as { keys: Record<string, { tag: string }> };
    const [variable] = Object.keys(file.keys);
    const full = Buffer.from(file.keys[variable]!.tag, "base64");
    assert.equal(full.length, 16, "encrypt() writes the full tag");
    /* The whole tag still reads. */
    assert.equal(openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER }).envFor().AZURE_SPEECH_KEY, SPEECH_FIXTURE);
    file.keys[variable]!.tag = full.subarray(0, 4).toString("base64");
    writeFileSync(path, JSON.stringify(file));
    assert.equal(openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER }).envFor().AZURE_SPEECH_KEY, undefined, "a four-byte prefix of the right tag is refused");
  } finally {
    box.done();
  }
});

test("the vault's value comes before the environment's, and deleting it leaves the environment's in force", () => {
  const box = sandbox();
  try {
    const env = { [VAULT_KEY_VARIABLE]: MASTER, ELEVENLABS_API_KEY: ELEVEN_FIXTURE };
    const vault = openVault(box.state, env);
    assert.deepEqual(
      [vault.card("elevenlabs")!.source, vault.card("elevenlabs")!.lastFour, vault.card("elevenlabs")!.setBy],
      ["environment", ELEVEN_FIXTURE.slice(-4), null],
    );
    assert.ok(vault.setKey("elevenlabs", "fixture-elevenlabs-vault-value-0001", T0).ok);
    assert.equal(vault.envFor("elevenlabs").ELEVENLABS_API_KEY, "fixture-elevenlabs-vault-value-0001");
    const removed = vault.deleteKey("elevenlabs", T0);
    assert.ok(removed.ok);
    assert.equal(removed.answer.source, "environment");
    assert.equal(vault.envFor("elevenlabs").ELEVENLABS_API_KEY, ELEVEN_FIXTURE);
  } finally {
    box.done();
  }
});

test("a disabled card answers nothing for every variable of its card, so its adapter is not configured and never called", async () => {
  const box = sandbox();
  try {
    const env = { [VAULT_KEY_VARIABLE]: MASTER, AZURE_SPEECH_KEY: SPEECH_FIXTURE, AZURE_SPEECH_REGION: "southafricanorth" };
    const vault = openVault(box.state, env);
    const off = vault.setEnabled("azure-speech", false, T0);
    assert.ok(off.ok);
    assert.equal(off.answer.enabled, false);
    assert.equal(off.answer.configured, true, "the key is still held; the card is switched off");
    assert.equal(vault.envFor("azure-speech").AZURE_SPEECH_KEY, undefined);
    assert.equal(vault.envFor("azure-speech").AZURE_SPEECH_REGION, undefined);
    const door = cloudSpeech(mustNotFetch, vault.envFor("azure-speech"));
    assert.equal(door.configured("tts"), false);
    assert.deepEqual(await door.synthesize({ text: "Hello", language: "en-ZA" }), { ok: false });
    assert.equal(vault.envFor().AZURE_SPEECH_KEY, undefined, "the whole process's view blanks it too");
    /* A test of a disabled card is refused before any call. */
    const tested = await vault.test("azure-speech", mustNotFetch, () => T0);
    assert.deepEqual(tested, { ok: false, refusalId: "founder-provider-disabled" });
    /* Back on, and the environment's value is readable again. */
    assert.ok(vault.setEnabled("azure-speech", true, T0).ok);
    assert.equal(vault.envFor("azure-speech").AZURE_SPEECH_KEY, SPEECH_FIXTURE);
    /* The variable another card reads stays readable when only one of its cards is off. */
    const dashscope = { ...env, DASHSCOPE_API_KEY: "fixture-dashscope-key-0123456789ab", DASHSCOPE_REGION: "singapore" };
    const shared = openVault(box.state, dashscope);
    assert.ok(shared.setEnabled("alibaba-qwen-asr", false, T0).ok);
    assert.equal(shared.envFor("alibaba-qwen-asr").DASHSCOPE_API_KEY, undefined);
    assert.equal(shared.envFor("alibaba-qwen-tts").DASHSCOPE_API_KEY, "fixture-dashscope-key-0123456789ab");
    assert.equal(shared.envFor().DASHSCOPE_API_KEY, "fixture-dashscope-key-0123456789ab", "shared: absent only when every card reading it is off");
    /* The disabled state survives a restart. */
    assert.equal(openVault(box.state, dashscope).card("alibaba-qwen-asr")!.enabled, false);
  } finally {
    box.done();
  }
});

test("without a master key every write is refused as locked; without a state directory as unavailable; a bad card or a bad key at the door", () => {
  const box = sandbox();
  try {
    const locked = openVault(box.state, { AZURE_SPEECH_KEY: SPEECH_FIXTURE });
    assert.equal(locked.unlocked, false);
    assert.deepEqual(locked.setKey("azure-speech", SPEECH_FIXTURE, T0), { ok: false, refusalId: "founder-vault-locked" });
    assert.deepEqual(locked.deleteKey("azure-speech", T0), { ok: false, refusalId: "founder-vault-locked" });
    assert.equal(locked.card("azure-speech")!.source, "environment", "metadata still reads the environment");
    assert.ok(locked.setEnabled("azure-speech", false, T0).ok, "a switch needs no master key: nothing is encrypted");
    const stateless = openVault(null, { [VAULT_KEY_VARIABLE]: MASTER });
    assert.equal(stateless.persisted, false);
    assert.deepEqual(stateless.setKey("azure-speech", SPEECH_FIXTURE, T0), { ok: false, refusalId: "founder-state-unavailable" });
    assert.deepEqual(stateless.setEnabled("azure-speech", false, T0), { ok: false, refusalId: "founder-state-unavailable" });
    const vault = openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER });
    assert.deepEqual(vault.setKey("ollama", "x".repeat(20), T0), { ok: false, refusalId: "founder-card-not-known" });
    assert.deepEqual(vault.setKey("azure-speech", "short", T0), { ok: false, refusalId: "founder-key-malformed" });
    assert.deepEqual(vault.setKey("azure-speech", "a key with spaces pasted in beside it 0123", T0), { ok: false, refusalId: "founder-key-malformed" });
    assert.deepEqual(vault.setKey("azure-speech", 42, T0), { ok: false, refusalId: "founder-key-malformed" });
    assert.equal(vault.card("nobody"), null);
    assert.equal(vault.cards().length, VAULT_CARDS.length);
  } finally {
    box.done();
  }
});

test("a test is one authenticated call to the provider's listing, answering ok, refused, failed or unreachable with the latency and never the key", async () => {
  const box = sandbox();
  try {
    const env = {
      [VAULT_KEY_VARIABLE]: MASTER,
      AZURE_SPEECH_KEY: SPEECH_FIXTURE,
      AZURE_SPEECH_REGION: "southafricanorth",
      ELEVENLABS_API_KEY: ELEVEN_FIXTURE,
      ELEVENLABS_REGION: "united-states",
      OPENAI_API_KEY: "fixture-openai-key-0123456789abcdef",
      DASHSCOPE_API_KEY: "fixture-dashscope-key-0123456789ab",
      DASHSCOPE_REGION: "singapore",
      AZURE_OPENAI_ENDPOINT: "https://example.invalid",
      AZURE_OPENAI_KEY: "fixture-azure-openai-0123456789abcdef",
    };
    const vault = openVault(box.state, env);
    let clock = T0;
    const now = () => clock;
    const calls: { url: string; init: RequestInit }[] = [];
    const answering = (status: number): typeof fetch => (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      clock += 120;
      return new Response("{}", { status });
    }) as typeof fetch;
    const ok = await vault.test("azure-speech", answering(200), now);
    assert.ok(ok.ok);
    assert.deepEqual(ok.answer, { card: "azure-speech", outcome: "ok", status: 200, latencyMs: 120, testedAt: new Date(T0).toISOString() });
    assert.equal(calls[0]!.url, "https://southafricanorth.tts.speech.microsoft.com/cognitiveservices/voices/list");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["ocp-apim-subscription-key"], SPEECH_FIXTURE);
    assert.equal(calls[0]!.init.method, "GET");
    const refused = await vault.test("elevenlabs", answering(401), now);
    assert.ok(refused.ok && refused.answer.outcome === "refused");
    assert.equal(calls[1]!.url, "https://api.elevenlabs.io/v1/user");
    const failed = await vault.test("openai-whisper", answering(500), now);
    assert.ok(failed.ok && failed.answer.outcome === "failed" && failed.answer.status === 500);
    assert.equal(calls[2]!.url, "https://api.openai.com/v1/models");
    const qwen = await vault.test("alibaba-qwen-tts", answering(200), now);
    assert.ok(qwen.ok && qwen.answer.outcome === "ok");
    assert.equal(calls[3]!.url, "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
    assert.equal(calls[3]!.init.method, "POST");
    assert.match(String(calls[3]!.init.body), /"text":"Test"/);
    const azure = await vault.test("azure-openai", answering(200), now);
    assert.ok(azure.ok && azure.answer.outcome === "ok");
    assert.match(calls[4]!.url, /^https:\/\/example\.invalid\/openai\/models\?api-version=/);
    const unreachable = await vault.test("azure-speech", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch, now);
    assert.ok(unreachable.ok);
    assert.equal(unreachable.answer.outcome, "unreachable");
    assert.equal(unreachable.answer.status, null);
    for (const outcome of [ok, refused, failed, qwen, azure, unreachable])
      assert.ok(!JSON.stringify(outcome).includes("fixture"), "no test answer carries a key");
    /* Nothing to test without a credential. */
    const bare = openVault(box.state, { [VAULT_KEY_VARIABLE]: MASTER });
    assert.deepEqual(await bare.test("azure-speech", mustNotFetch, now), { ok: false, refusalId: "founder-provider-not-configured" });
    assert.deepEqual(await bare.test("ollama", mustNotFetch, now), { ok: false, refusalId: "founder-card-not-known" });
  } finally {
    box.done();
  }
});
