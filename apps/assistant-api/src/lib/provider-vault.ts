import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import contract from "../../../../packages/catalog/founder-access.json" with { type: "json" };
import registry from "../../../../packages/catalog/api-registry.json" with { type: "json" };
import type { FounderState } from "./founder-state.ts";
import { AZURE_API_VERSION } from "./llm-adapter.ts";

/* The provider key vault, 28 September 2026 (packages/catalog/founder-access.json#vault).

   THE FACT THIS FIXES. A provider key could be set only over SSH, by root, through
   configure-assistant-env.sh; so every registry action in the Control Tower — enable, disable, rotate,
   test, view logs — was drawn disabled for want of a vault (api-registry.json's own G32). The founder's
   instruction is that the owner controls these. This is the vault.

   WHAT IT IS. vault.json in the service's state directory: each provider key encrypted with AES-256-GCM
   under a master key the founder's env file carries — MYTHUSO_VAULT_KEY, thirty-two random bytes,
   base64, written once by deploy/ops/configure-founder-access.sh and never printed — beside the
   metadata that may be said about it (last four, SHA-256 prefix, when, by whom), and per card whether
   the provider is enabled. Root reads ciphertext in one file and the key in another; a backup of the
   state directory alone reveals nothing. Without the master key the vault is locked: reads answer the
   metadata the file holds, every write is refused with founder-vault-locked, and no plaintext ever
   exists — a key stored in the clear because the master key was missing would be exactly the file this
   exists to prevent.

   ONE FUNCTION READS A CREDENTIAL. envFor() below is the view every adapter and every configured()
   reads through: the vault's value first, then the process environment, then nothing. A card the
   founder has disabled answers undefined for every variable its registry card lists — the key and the
   region alike — so the adapter finds nothing to configure and the provider is never called, which is
   the registry's a-disabled-provider-is-never-called made true in code rather than on a screen. The
   reveal route does not read through here: its allowlist is the two Azure names in the environment,
   exactly as before, and the vault never reveals.

   THE RESIDENCY RULE IS UNCHANGED. A key in the vault configures a provider; it does not select one.
   ../speech.ts still refuses an offshore speech provider for a health-information route in production
   while docs/governance/DATA-RESIDENCY-OPTIONS.md §7 is blank, whatever the vault holds. A test here is
   one authenticated call to the provider's own listing — voices, models, the account — which carries
   no patient's words and so is not a health-information flow.

   NOTHING HERE LOGS, and nothing here returns a value: the metadata type has no field a key could
   travel in, and the one function that decrypts hands its answer to envFor() alone. */

export type Env = Record<string, string | undefined>;

export type VaultCard = { card: string; keyVariable: string };
export const VAULT_CARDS: readonly VaultCard[] = contract.vault.cards;
export const VAULT_KEY_VARIABLE: string = contract.vault.keyVariable;
export const VAULT_FILE: string = contract.state.vaultFile;
const KEY_BYTES: number = contract.vault.keyBytes;
const FINGERPRINT_HEX: number = contract.reveal.fingerprintHexLength;
const LAST: number = contract.reveal.lastCharacters;
const TEST_TIMEOUT_MS: number = contract.vault.testTimeoutMs;
/* Printable ASCII, no space, the contract's lengths. */
const KEY_SHAPE = new RegExp(`^[\\x21-\\x7e]{${contract.vault.keyShape.minimumLength},${contract.vault.keyShape.maximumLength}}$`);

type RegistryCard = {
  id: string;
  environment?: string[];
  model?: string;
  voices?: Record<string, { default: string }>;
  regions?: { hosts?: Record<string, string>; selectedBy?: string };
};
const REGISTRY_CARDS: readonly RegistryCard[] = registry.cards as RegistryCard[];
const registryCard = (id: string): RegistryCard | undefined => REGISTRY_CARDS.find((c) => c.id === id);
for (const { card, keyVariable } of VAULT_CARDS) {
  const found = registryCard(card);
  if (!found || !(found.environment ?? []).includes(keyVariable))
    throw new Error(`packages/catalog/founder-access.json#vault.cards puts ${keyVariable} on "${card}", and packages/catalog/api-registry.json's card does not list that variable. The vault holds a key its adapter reads, or nothing.`);
}
/* Every variable a card's adapter reads, per card, so a disabled card blanks all of them. */
const variablesOf = (card: string): readonly string[] => registryCard(card)?.environment ?? [];
/* The cards that read a variable — DASHSCOPE_API_KEY is two cards'. */
const cardsReading = (variable: string): VaultCard[] => VAULT_CARDS.filter((c) => c.keyVariable === variable);

/* ---- The file ------------------------------------------------------------------------------------ */

type StoredKey = {
  iv: string;
  tag: string;
  ciphertext: string;
  fingerprint: string;
  lastFour: string;
  createdAt: string;
  rotatedAt: string | null;
  setBy: string;
};
type VaultFile = { version: 1; keys: Record<string, StoredKey>; disabled: string[] };
const empty = (): VaultFile => ({ version: 1, keys: {}, disabled: [] });

export type KeyMetadata = {
  card: string;
  keyVariable: string;
  configured: boolean;
  source: "vault" | "environment" | null;
  enabled: boolean;
  lastFour: string | null;
  fingerprintPrefix: string | null;
  createdAt: string | null;
  lastRotatedAt: string | null;
  setBy: string | null;
};

export type VaultRefusalId =
  | "founder-card-not-known"
  | "founder-state-unavailable"
  | "founder-vault-locked"
  | "founder-key-malformed"
  | "founder-provider-disabled"
  | "founder-provider-not-configured";
/* `answer`, not `value`: the one word this service never puts beside a key's metadata, so a boundary
   sweep for a value in a founder branch has nothing to misread. */
export type VaultOutcome<T> = { ok: true; answer: T } | { ok: false; refusalId: VaultRefusalId };

export type TestOutcome = {
  card: string;
  outcome: "ok" | "refused" | "unreachable" | "failed";
  status: number | null;
  latencyMs: number;
  testedAt: string;
};

export interface ProviderVault {
  /* Whether the master key is present and well-formed. */
  readonly unlocked: boolean;
  /* Whether a state directory exists to keep the vault in. */
  readonly persisted: boolean;
  cards(): KeyMetadata[];
  card(id: unknown): KeyMetadata | null;
  setKey(card: unknown, key: unknown, now: number): VaultOutcome<KeyMetadata>;
  deleteKey(card: unknown, now: number): VaultOutcome<KeyMetadata>;
  setEnabled(card: unknown, enabled: unknown, now: number): VaultOutcome<KeyMetadata>;
  /* The credential view: the vault, then the environment; a disabled card's variables are absent.
     With a card, that card's view; without one, the whole process's, where a shared variable is
     absent only when every card reading it is disabled. */
  envFor(card?: string): Env;
  test(card: unknown, fetchImpl: typeof fetch, now: () => number): Promise<VaultOutcome<TestOutcome>>;
}

export const fingerprintOf = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, FINGERPRINT_HEX);

/* Thirty-two bytes, base64, or nothing. A key of another length is not a weaker key; it is not the
   key, and the vault stays locked rather than deriving something from it. */
export function masterKeyOf(env: Env): Buffer | null {
  const text = (env[VAULT_KEY_VARIABLE] ?? "").trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) return null;
  const bytes = Buffer.from(text, "base64");
  return bytes.length === KEY_BYTES ? bytes : null;
}

/* The line configure-founder-access.sh writes, for the test that holds the script to it. */
export const isMasterKeyShape = (text: string): boolean => masterKeyOf({ [VAULT_KEY_VARIABLE]: text }) !== null;

const AAD = (variable: string) => Buffer.from(`mythuso-vault:${variable}`);
function encrypt(master: Buffer, variable: string, value: string): Pick<StoredKey, "iv" | "tag" | "ciphertext"> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master, iv);
  cipher.setAAD(AAD(variable));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
function decrypt(master: Buffer, variable: string, stored: StoredKey): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(stored.iv, "base64"));
    decipher.setAAD(AAD(variable));
    decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(stored.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ---- The test call per card: a listing, never a patient's words ---------------------------------- */

const HOSTNAME = /^[a-z0-9.-]{1,253}$/;
type TestCall = { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string } | null;
/* The provider's cheapest authenticated call, built from the env view the adapter itself would read: a
   card whose region or endpoint is missing has nothing to test, and answers as not configured. Azure,
   OpenAI and ElevenLabs each publish a listing that costs nothing; DashScope publishes none this
   service may name (the language model's own doors are a proposed card's code names, which the build
   refuses here), so the two Alibaba cards are tested with the smallest Qwen-TTS reading their own
   adapter makes — one fixed word, in the card's default voice — through the one path that adapter
   uses. That is a paid call of a few characters, and not a patient's word. */
const DASHSCOPE_GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const TEST_WORD = "Test";
function testCallFor(card: string, env: Env): TestCall {
  const registryEntry = registryCard(card);
  const hosts = registryEntry?.regions?.hosts ?? {};
  switch (card) {
    case "azure-openai": {
      const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? "").trim().replace(/\/+$/, "");
      const key = (env.AZURE_OPENAI_KEY ?? env.AZURE_OPENAI_API_KEY ?? "").trim();
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(endpoint) || !key) return null;
      return { url: `${endpoint}/openai/models?api-version=${AZURE_API_VERSION}`, method: "GET", headers: { "api-key": key } };
    }
    case "azure-speech": {
      const region = (env.AZURE_SPEECH_REGION ?? "").trim().toLowerCase();
      const key = (env.AZURE_SPEECH_KEY ?? "").trim();
      if (!/^[a-z0-9]{3,32}$/.test(region) || !key) return null;
      return { url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, method: "GET", headers: { "ocp-apim-subscription-key": key } };
    }
    case "elevenlabs": {
      const host = hosts[(env.ELEVENLABS_REGION ?? "").trim().toLowerCase()];
      const key = (env.ELEVENLABS_API_KEY ?? "").trim();
      if (!host || !HOSTNAME.test(host) || !key) return null;
      return { url: `https://${host}/v1/user`, method: "GET", headers: { "xi-api-key": key } };
    }
    case "alibaba-qwen-tts":
    case "alibaba-qwen-asr": {
      const host = hosts[(env.DASHSCOPE_REGION ?? "").trim().toLowerCase()];
      const key = (env.DASHSCOPE_API_KEY ?? "").trim();
      const tts = registryCard("alibaba-qwen-tts");
      const voice = tts?.voices?.en?.default;
      if (!host || !HOSTNAME.test(host) || !key || !tts?.model || !voice) return null;
      return {
        url: `https://${host}${DASHSCOPE_GENERATION_PATH}`,
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: tts.model, input: { text: TEST_WORD, voice } }),
      };
    }
    case "openai-whisper": {
      const host = hosts.default;
      const key = (env.OPENAI_API_KEY ?? "").trim();
      if (!host || !HOSTNAME.test(host) || !key) return null;
      return { url: `https://${host}/v1/models`, method: "GET", headers: { authorization: `Bearer ${key}` } };
    }
    default:
      return null;
  }
}

/* ---- The vault ----------------------------------------------------------------------------------- */

export function openVault(state: FounderState | null, env: Env = process.env): ProviderVault {
  const master = masterKeyOf(env);
  /* Read once and held; every write goes to the file first and to this copy second. */
  let file: VaultFile = state ? (state.readJson<VaultFile>(VAULT_FILE) ?? empty()) : empty();
  if (file.version !== 1 || typeof file.keys !== "object" || !Array.isArray(file.disabled))
    throw new Error(`${VAULT_FILE} is not a vault this service can read. It is replaced whole by this service and never edited.`);
  const save = (next: VaultFile) => {
    state!.writeJson(VAULT_FILE, next);
    file = next;
  };
  const cardOf = (id: unknown): VaultCard | null =>
    typeof id === "string" ? (VAULT_CARDS.find((c) => c.card === id) ?? null) : null;
  const enabled = (card: string) => !file.disabled.includes(card);
  /* The plaintext of a vault key, for envFor() alone. */
  const vaultValue = (variable: string): string | undefined => {
    const stored = file.keys[variable];
    if (!stored || !master) return undefined;
    return decrypt(master, variable, stored) ?? undefined;
  };
  const plausible = (value: string | undefined): boolean => !!value && KEY_SHAPE.test(value.trim());

  const metadata = (entry: VaultCard): KeyMetadata => {
    const stored = file.keys[entry.keyVariable];
    const fromVault = stored !== undefined && master !== null;
    const inEnvironment = plausible(env[entry.keyVariable]);
    const environmentValue = inEnvironment ? (env[entry.keyVariable] ?? "").trim() : "";
    return {
      card: entry.card,
      keyVariable: entry.keyVariable,
      configured: fromVault || inEnvironment,
      source: fromVault ? "vault" : inEnvironment ? "environment" : null,
      enabled: enabled(entry.card),
      lastFour: fromVault ? stored.lastFour : inEnvironment ? environmentValue.slice(-LAST) : null,
      fingerprintPrefix: fromVault ? stored.fingerprint : inEnvironment ? fingerprintOf(environmentValue) : null,
      createdAt: fromVault ? stored.createdAt : null,
      lastRotatedAt: fromVault ? stored.rotatedAt : null,
      setBy: fromVault ? stored.setBy : null,
    };
  };

  const envFor = (card?: string): Env => {
    const disabledFor = (variable: string): boolean => {
      if (card !== undefined) return !enabled(card) && variablesOf(card).includes(variable);
      const owners = VAULT_CARDS.filter((c) => variablesOf(c.card).includes(variable));
      return owners.length > 0 && owners.every((c) => !enabled(c.card));
    };
    return new Proxy({} as Env, {
      get(_target, name) {
        if (typeof name !== "string") return undefined;
        if (disabledFor(name)) return undefined;
        return vaultValue(name) ?? env[name];
      },
      has(_target, name) {
        return typeof name === "string" && !disabledFor(name) && (vaultValue(name) ?? env[name]) !== undefined;
      },
    });
  };

  return {
    unlocked: master !== null,
    persisted: state !== null,
    cards: () => VAULT_CARDS.map(metadata),
    card(id) {
      const entry = cardOf(id);
      return entry ? metadata(entry) : null;
    },
    setKey(id, key, now) {
      /* The card before anything else, then the two things a write needs, then the value's shape;
         the value itself is read only after every refusal has had its chance. */
      const entry = cardOf(id);
      if (!entry) return { ok: false, refusalId: "founder-card-not-known" };
      if (!state) return { ok: false, refusalId: "founder-state-unavailable" };
      if (!master) return { ok: false, refusalId: "founder-vault-locked" };
      const value = typeof key === "string" ? key.trim() : "";
      if (!KEY_SHAPE.test(value)) return { ok: false, refusalId: "founder-key-malformed" };
      const previous = file.keys[entry.keyVariable];
      const at = new Date(now).toISOString();
      const stored: StoredKey = {
        ...encrypt(master, entry.keyVariable, value),
        fingerprint: fingerprintOf(value),
        lastFour: value.slice(-LAST),
        createdAt: previous?.createdAt ?? at,
        rotatedAt: previous ? at : null,
        setBy: contract.settings.byRef,
      };
      save({ ...file, keys: { ...file.keys, [entry.keyVariable]: stored } });
      return { ok: true, answer: metadata(entry) };
    },
    deleteKey(id, _now) {
      const entry = cardOf(id);
      if (!entry) return { ok: false, refusalId: "founder-card-not-known" };
      if (!state) return { ok: false, refusalId: "founder-state-unavailable" };
      if (!master) return { ok: false, refusalId: "founder-vault-locked" };
      const { [entry.keyVariable]: _gone, ...keys } = file.keys;
      save({ ...file, keys });
      return { ok: true, answer: metadata(entry) };
    },
    setEnabled(id, on, _now) {
      const entry = cardOf(id);
      if (!entry) return { ok: false, refusalId: "founder-card-not-known" };
      if (!state) return { ok: false, refusalId: "founder-state-unavailable" };
      const disabled = file.disabled.filter((c) => c !== entry.card);
      save({ ...file, disabled: on === true ? disabled : [...disabled, entry.card] });
      return { ok: true, answer: metadata(entry) };
    },
    envFor,
    async test(id, fetchImpl, now) {
      const entry = cardOf(id);
      if (!entry) return { ok: false, refusalId: "founder-card-not-known" };
      if (!enabled(entry.card)) return { ok: false, refusalId: "founder-provider-disabled" };
      const call = testCallFor(entry.card, envFor(entry.card));
      if (!call) return { ok: false, refusalId: "founder-provider-not-configured" };
      const started = now();
      const testedAt = new Date(started).toISOString();
      const latency = () => Math.max(0, Math.round(now() - started));
      try {
        const response = await fetchImpl(call.url, {
          method: call.method,
          headers: { ...call.headers, accept: "application/json", "user-agent": "mythuso-assistant" },
          body: call.body,
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        /* The body is never read: a listing is the provider's, and what this answers is whether the
           credential was accepted, not what the provider offers. */
        const outcome: TestOutcome["outcome"] = response.ok ? "ok" : response.status === 401 || response.status === 403 ? "refused" : "failed";
        return { ok: true, answer: { card: entry.card, outcome, status: response.status, latencyMs: latency(), testedAt } };
      } catch {
        return { ok: true, answer: { card: entry.card, outcome: "unreachable", status: null, latencyMs: latency(), testedAt } };
      }
    },
  };
}

/* The cards a variable configures, for the audit line: a key set on one Alibaba card configures both. */
export const cardsOfVariable = cardsReading;
