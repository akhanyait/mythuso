import test from "node:test";
import assert from "node:assert/strict";
import {
  selectedSpeech,
  speechSelection,
  SPEECH_SELECTION,
  SPEECH_VOICE_NAMES,
  SPEECH_VOICES,
  OFFSHORE_SPEECH_REFUSAL_ID,
} from "./speech.ts";
import registry from "../../../../packages/catalog/api-registry.json" with { type: "json" };
import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };

/* The selection between speech providers, added 28 September 2026, held to its promises: the
   default is Azure in both directions and behaves as the one adapter always did; a card id in the
   environment is honoured per direction in development; in production a provider with no South
   African region is refused in the registry's own words and the direction falls back; a value that
   is no built card refuses the service outright; and the route's door admits every voice the
   contract and the registry name. ./speech.test.ts holds the Azure adapter itself and is unchanged. */

const AZURE = { AZURE_SPEECH_KEY: "fixturespeechkey0123456789abcdef", AZURE_SPEECH_REGION: "southafricanorth" } as const;
const OFFSHORE = {
  MYTHUSO_STT_PROVIDER: "openai-whisper",
  MYTHUSO_TTS_PROVIDER: "alibaba-qwen-tts",
  OPENAI_API_KEY: "fixture-openai-key-0123456789abcdef",
  DASHSCOPE_API_KEY: "fixture-dashscope-key-0123456789",
  DASHSCOPE_REGION: "singapore",
} as const;
const PRODUCTION = { NODE_ENV: "production", MYTHUSO_ASSISTANT_PRODUCTION: "acknowledged" } as const;

/* A fetch that records where each request would have gone and answers nothing useful: these tests
   care about the host, not the reading. */
const recording = () => {
  const hosts: string[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0]) => {
    hosts.push(new URL(input instanceof URL ? input.href : String(input)).hostname);
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  return { hosts, impl };
};
const capture = { audioBase64: "AAAA", language: "en-ZA", audioFormat: "audio/wav" };
const offshoreHost = (host: string) => /openai\.com$|aliyuncs\.com$/.test(host);

test("the variables and the default are the registry's own, and the default is the one provider with a South African region", () => {
  assert.deepEqual(SPEECH_SELECTION, registry.speechSelection);
  assert.equal(SPEECH_SELECTION.default, "azure-speech");
  const azure = registry.cards.find((c) => c.id === SPEECH_SELECTION.default) as { regions: { southAfricanRegion: boolean }; serves: string[] };
  assert.equal(azure.regions.southAfricanRegion, true);
  assert.deepEqual([...azure.serves].sort(), ["stt", "tts"]);
});

test("with nothing selected both directions are Azure, and the composed seam is the Azure adapter's own behaviour", async () => {
  const selection = speechSelection({ ...AZURE });
  assert.deepEqual(selection, { stt: { asked: "azure-speech", card: "azure-speech" }, tts: { asked: "azure-speech", card: "azure-speech" }, fatal: null, refused: [] });
  const { hosts, impl } = recording();
  const speech = selectedSpeech(impl, { ...AZURE });
  assert.equal(speech.configured(), true);
  assert.equal(speech.configured("stt"), true);
  assert.equal(speech.configured("tts"), true);
  await speech.recognize(capture);
  await speech.synthesize({ text: "Hello", language: "en-ZA" });
  assert.deepEqual(hosts, ["southafricanorth.stt.speech.microsoft.com", "southafricanorth.tts.speech.microsoft.com"]);
  const bare = selectedSpeech(impl, {});
  assert.equal(bare.configured(), false, "no credentials is not configured, as before");
  assert.equal(bare.configured("stt"), false);
  assert.equal(bare.configured("tts"), false);
});

test("in development a built card is honoured per direction, and each door goes to its own provider", async () => {
  const selection = speechSelection({ ...OFFSHORE });
  assert.deepEqual(selection.stt, { asked: "openai-whisper", card: "openai-whisper" });
  assert.deepEqual(selection.tts, { asked: "alibaba-qwen-tts", card: "alibaba-qwen-tts" });
  assert.equal(selection.fatal, null);
  assert.deepEqual(selection.refused, []);
  const { hosts, impl } = recording();
  const speech = selectedSpeech(impl, { ...OFFSHORE });
  assert.equal(speech.configured("stt"), true);
  assert.equal(speech.configured("tts"), true);
  assert.equal(speech.configured(), true, "both doors have what they need");
  await speech.recognize(capture);
  await speech.synthesize({ text: "Hello", language: "en" });
  assert.deepEqual(hosts, ["api.openai.com", "dashscope-intl.aliyuncs.com"]);
  /* One direction selected, the other left to the default: the ear is Whisper's, the voice is Azure's,
     and configured() as a whole is false until Azure has its credentials. */
  const mixed = selectedSpeech(impl, { MYTHUSO_STT_PROVIDER: "openai-whisper", OPENAI_API_KEY: OFFSHORE.OPENAI_API_KEY });
  assert.equal(mixed.configured("stt"), true);
  assert.equal(mixed.configured("tts"), false);
  assert.equal(mixed.configured(), false);
  const both = selectedSpeech(impl, { MYTHUSO_STT_PROVIDER: "openai-whisper", OPENAI_API_KEY: OFFSHORE.OPENAI_API_KEY, ...AZURE });
  assert.equal(both.configured(), true);
});

test("in production an offshore selection is refused in the registry's words, the direction falls back, and no audio leaves for it", async () => {
  const statement = registry.refusals.find((r) => r.id === OFFSHORE_SPEECH_REFUSAL_ID)!.statement;
  for (const production of [PRODUCTION, { NODE_ENV: "production" }, { MYTHUSO_ASSISTANT_PRODUCTION: "acknowledged" }]) {
    const selection = speechSelection({ ...OFFSHORE, ...production });
    assert.equal(selection.fatal, null, "a refused selection is not a misconfiguration: the service starts");
    assert.deepEqual(selection.stt, { asked: "openai-whisper", card: "azure-speech" });
    assert.deepEqual(selection.tts, { asked: "alibaba-qwen-tts", card: "azure-speech" });
    assert.equal(selection.refused.length, 2, "one sentence per refused direction");
    const [stt, tts] = selection.refused;
    assert.ok(stt.startsWith("MYTHUSO_STT_PROVIDER=openai-whisper is refused in production: "), stt);
    assert.ok(tts.startsWith("MYTHUSO_TTS_PROVIDER=alibaba-qwen-tts is refused in production: "), tts);
    for (const line of selection.refused) {
      assert.ok(line.includes(statement), "the reason is the registry's statement, read and not typed");
      assert.ok(line.includes("docs/governance/DATA-RESIDENCY-OPTIONS.md §7"), "and it names the document");
      assert.ok(line.includes("azure-speech"), "and says what carries on instead");
      assert.ok(!line.includes(OFFSHORE.OPENAI_API_KEY) && !line.includes(OFFSHORE.DASHSCOPE_API_KEY), "and carries no key");
    }
  }
  /* The composed seam in that production process: Azure where configured, not configured where not,
     and never the offshore host. */
  const { hosts, impl } = recording();
  const withoutAzure = selectedSpeech(impl, { ...OFFSHORE, ...PRODUCTION });
  assert.equal(withoutAzure.configured("stt"), false, "with Azure unconfigured the ear is not configured — the route answers speech-not-configured");
  assert.equal(withoutAzure.configured("tts"), false);
  assert.deepEqual(await withoutAzure.recognize(capture), { ok: false });
  assert.deepEqual(await withoutAzure.synthesize({ text: "Hello", language: "en" }), { ok: false });
  const withAzure = selectedSpeech(impl, { ...OFFSHORE, ...PRODUCTION, ...AZURE });
  assert.equal(withAzure.configured(), true);
  await withAzure.recognize(capture);
  await withAzure.synthesize({ text: "Hello", language: "en-ZA" });
  assert.ok(hosts.length === 2 && hosts.every((h) => !offshoreHost(h)), `nothing reached an offshore host: ${hosts.join(", ")}`);
  /* Azure itself, selected by name in production, is not refused: its region is South African. */
  const azureNamed = speechSelection({ MYTHUSO_STT_PROVIDER: "azure-speech", MYTHUSO_TTS_PROVIDER: " azure-speech ", ...PRODUCTION, ...AZURE });
  assert.deepEqual(azureNamed.refused, []);
  assert.equal(azureNamed.tts.card, "azure-speech");
});

test("a value that is no built card for its direction refuses the service at start-up, naming the cards", () => {
  const unknown = speechSelection({ MYTHUSO_STT_PROVIDER: "deepgram-nova-3" });
  assert.ok(unknown.fatal, "a proposed card is not a provider");
  assert.ok(unknown.fatal!.startsWith("Refusing to start: MYTHUSO_STT_PROVIDER=deepgram-nova-3 "), unknown.fatal);
  assert.ok(unknown.fatal!.includes("azure-speech") && unknown.fatal!.includes("openai-whisper") && unknown.fatal!.includes("alibaba-qwen-asr"), "the cards that can listen are named");
  assert.ok(!unknown.fatal!.includes("alibaba-qwen-tts"), "and a card that cannot listen is not");
  const wrongWay = speechSelection({ MYTHUSO_TTS_PROVIDER: "openai-whisper" });
  assert.ok(wrongWay.fatal?.startsWith("Refusing to start: MYTHUSO_TTS_PROVIDER=openai-whisper "), "a card that only hears cannot be the voice");
  assert.ok(wrongWay.fatal!.includes("alibaba-qwen-tts") && !wrongWay.fatal!.includes("alibaba-qwen-asr"));
  const typo = speechSelection({ MYTHUSO_STT_PROVIDER: "Azure Speech" });
  assert.ok(typo.fatal, "an id is exact");
  const llm = speechSelection({ MYTHUSO_TTS_PROVIDER: "azure-openai" });
  assert.ok(llm.fatal, "a language model is not a voice");
});

test("the door's voice names are the contract's and every built card's, read and not typed", () => {
  const cards = registry.cards as { category: string; buildStatus: string; voices?: Record<string, { default: string; names: string[] }> }[];
  const fromCards = cards.filter((c) => c.category === "speech" && c.buildStatus === "built").flatMap((c) => Object.values(c.voices ?? {}).flatMap((v) => v.names));
  assert.ok(fromCards.includes("Cherry") && fromCards.includes("Ethan"), "the Qwen card names its voices");
  for (const name of [...SPEECH_VOICES, ...fromCards]) assert.ok(SPEECH_VOICE_NAMES.includes(name), `${name} is admitted at the door`);
  const languages = assistant.voice.languages as { ttsAvailable?: boolean; ttsVoices?: { female: string; male: string } }[];
  for (const language of languages)
    if (language.ttsAvailable && language.ttsVoices)
      assert.ok(SPEECH_VOICE_NAMES.includes(language.ttsVoices.female) && SPEECH_VOICE_NAMES.includes(language.ttsVoices.male));
  assert.equal(new Set(SPEECH_VOICE_NAMES).size, SPEECH_VOICE_NAMES.length, "each name once");
  assert.ok(!SPEECH_VOICE_NAMES.includes("Sunny"), "a voice the card does not name is not admitted, however the vendor documents it");
});
