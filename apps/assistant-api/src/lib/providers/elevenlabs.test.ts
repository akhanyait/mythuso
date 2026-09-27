import test from "node:test";
import assert from "node:assert/strict";
import { elevenLabsTts } from "./elevenlabs.ts";
import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };
import assistant from "../../../../../packages/catalog/assistant.json" with { type: "json" };
import { speechSettingsByDefault, tuningFor } from "../../../../../packages/engines/src/assistant/domain/settings.ts";

/* The ElevenLabs adapter's own tests, written with it on 28 September 2026. Nothing here reaches the
   network. What these hold the adapter to is the shape the vendor documents — one route per voice
   identifier on the host ELEVENLABS_REGION picks from the card, the key in xi-api-key, the format
   and the latency level in the query, logging switched off, the model and the knobs in the body —
   and the seam's promises: one flag for every failure, the card's languages per model, the contract's
   own voice names at the door and the account's identifiers behind it, a person's own voice only
   where the tuning says so, and never a word back that identifies one. Whether the documented shape
   is what the live API accepts is not something a fake fetch can know; the file's header says so. */

type Card = { regions: { hosts: Record<string, string> }; models: Record<string, { languages: string[] }> };
const card = registry.cards.find((c) => c.id === "elevenlabs") as unknown as Card;
const english = assistant.voice.languages.find((l) => l.id === "en")!;
const afrikaans = assistant.voice.languages.find((l) => l.id === "af")!;

/* Shaped like a key and two voice identifiers, and nothing like real ones. */
const ENV = {
  ELEVENLABS_API_KEY: "fixture-elevenlabs-key-0123456789",
  ELEVENLABS_REGION: "united-states",
  ELEVENLABS_VOICE_FEMALE: "fixtureFemaleVoice01",
  ELEVENLABS_VOICE_MALE: "fixtureMaleVoice0002",
  ELEVENLABS_VOICE_OWN: "fixtureOwnVoice00003",
} as const;

const mustNotFetch: typeof fetch = async () => {
  throw new Error("a test that did not hand over an answer must never reach the network");
};
const answering = (answer: () => Response) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: input instanceof URL ? input.href : String(input), init: init ?? {} });
    return answer();
  }) as typeof fetch;
  return { calls, impl };
};
const audio = () => new Response(Buffer.from("fake-audio"), { status: 200, headers: { "content-type": "audio/mpeg" } });
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as { text: string; model_id: string; language_code?: string; voice_settings?: Record<string, unknown> };
const presentation = tuningFor(speechSettingsByDefault, "routine").tuning;
const clinical = tuningFor(speechSettingsByDefault, "emergency").tuning;

test("without a key, a region the card names and the default label's voice identifier the adapter is not configured, and no door opens", async () => {
  for (const env of [
    {},
    { ELEVENLABS_API_KEY: ENV.ELEVENLABS_API_KEY, ELEVENLABS_REGION: "united-states" },
    { ...ENV, ELEVENLABS_REGION: "johannesburg" },
    { ...ENV, ELEVENLABS_REGION: "" },
    { ...ENV, ELEVENLABS_API_KEY: "a key with spaces 0123456789" },
    { ...ENV, ELEVENLABS_VOICE_FEMALE: "not a voice id!" },
  ]) {
    const tts = elevenLabsTts(mustNotFetch, env);
    assert.equal(tts.configured(), false, `${JSON.stringify(Object.keys(env))} does not configure the voice`);
    assert.deepEqual(await tts.synthesize({ text: "Hello", language: "en-ZA" }), { ok: false });
  }
  for (const region of Object.keys(card.regions.hosts))
    assert.equal(elevenLabsTts(mustNotFetch, { ...ENV, ELEVENLABS_REGION: region.toUpperCase() }).configured("tts"), true, `${region} is one of the card's regions`);
  const tts = elevenLabsTts(mustNotFetch, ENV);
  assert.equal(tts.configured("stt"), false, "the voice never hears");
  assert.deepEqual(await tts.recognize({ audioBase64: "AAAA", language: "en-ZA", audioFormat: "audio/wav" }), { ok: false });
});

test("the voice posts the documented shape to the region's host with logging off, the knobs for a presentation register, and answers the contract's name", async () => {
  const { calls, impl } = answering(audio);
  const tts = elevenLabsTts(impl, ENV);
  const read = await tts.synthesize({ text: "Your nurse is on the way.", language: "en-ZA", tuning: presentation });
  assert.deepEqual(read, { ok: true, audioBase64: Buffer.from("fake-audio").toString("base64"), format: "audio/mpeg", voice: english.ttsVoices!.female, language: "en-ZA" });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.hostname, card.regions.hosts["united-states"]);
  assert.equal(url.pathname, `/v1/text-to-speech/${ENV.ELEVENLABS_VOICE_FEMALE}`, "the female identifier, for the platform's default label");
  assert.equal(url.searchParams.get("enable_logging"), "false");
  assert.equal(url.searchParams.get("output_format"), speechSettingsByDefault.elevenLabs.audioQuality);
  assert.equal(url.searchParams.get("optimize_streaming_latency"), String(speechSettingsByDefault.elevenLabs.latencyMode));
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["xi-api-key"], ENV.ELEVENLABS_API_KEY, "the key travels in the vendor's own header");
  assert.equal(headers.accept, "audio/mpeg");
  const body = bodyOf(calls[0].init);
  assert.equal(body.text, "Your nurse is on the way.");
  assert.equal(body.model_id, speechSettingsByDefault.elevenLabs.model);
  assert.equal(body.language_code, undefined, "the multilingual model is handed no language code");
  assert.deepEqual(body.voice_settings, { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 }, "the settings' defaults, as the vendor's fractions");
  assert.ok(!JSON.stringify(read).includes(ENV.ELEVENLABS_VOICE_FEMALE), "no identifier leaves the adapter");
});

test("a clinical register or no tuning is read at the vendor's own defaults, never in the own voice, and the male label resolves to its identifier", async () => {
  const { calls, impl } = answering(audio);
  const tts = elevenLabsTts(impl, ENV);
  await tts.synthesize({ text: "Call 10177 now.", language: "en", tuning: clinical });
  assert.equal(bodyOf(calls[0].init).voice_settings, undefined, "no knob reaches an emergency answer");
  assert.ok(calls[0].url.includes(ENV.ELEVENLABS_VOICE_FEMALE), "the language's own voice, not a person's");
  await tts.synthesize({ text: "Hello", language: "en", voice: english.ttsVoices!.male });
  assert.ok(calls[1].url.includes(`/v1/text-to-speech/${ENV.ELEVENLABS_VOICE_MALE}?`));
  assert.equal(bodyOf(calls[1].init).voice_settings, undefined, "a request with no tuning at all sends the vendor's defaults");
  assert.equal(new URL(calls[1].url).searchParams.get("output_format"), null, "and asks for no format");
});

test("the administrator's own voice reads only where the tuning says so, and a label with no identifier is a language with no voice", async () => {
  const { calls, impl } = answering(audio);
  const own = tuningFor({ ...speechSettingsByDefault, ownVoice: "every-presentation-register" }, "routine").tuning;
  assert.equal(own.ownVoice, true);
  const read = await elevenLabsTts(impl, ENV).synthesize({ text: "Hello", language: "en", tuning: own });
  assert.ok(read.ok && read.voice === english.ttsVoices!.female, "the answer still names the contract's voice, never the person");
  assert.ok(calls[0].url.includes(`/v1/text-to-speech/${ENV.ELEVENLABS_VOICE_OWN}?`), "the own identifier is what was asked");
  const withoutOwn = elevenLabsTts(impl, { ...ENV, ELEVENLABS_VOICE_OWN: undefined });
  await withoutOwn.synthesize({ text: "Hello", language: "en", tuning: own });
  assert.ok(calls[1].url.includes(ENV.ELEVENLABS_VOICE_FEMALE), "no own identifier: the label's voice reads, and nothing fails");
  const withoutMale = elevenLabsTts(mustNotFetch, { ...ENV, ELEVENLABS_VOICE_MALE: undefined });
  assert.deepEqual(await withoutMale.synthesize({ text: "Hello", language: "en", voice: english.ttsVoices!.male }), { ok: false, voiceUnavailable: true, language: "en-ZA" });
  const clinicalOwn = tuningFor({ ...speechSettingsByDefault, ownVoice: "every-presentation-register" }, "refusal").tuning;
  assert.equal(clinicalOwn.ownVoice, false, "a clinical register is never read in a person's voice, whatever the setting");
});

test("a language the chosen model does not list is answered voiceUnavailable before any call, and a name from another language is refused", async () => {
  const tts = elevenLabsTts(mustNotFetch, ENV);
  assert.deepEqual(await tts.synthesize({ text: "Sawubona", language: "zu", tuning: presentation }), { ok: false, voiceUnavailable: true, language: "zu-ZA" });
  assert.deepEqual(await tts.synthesize({ text: "Goeie môre", language: "af", tuning: presentation }), { ok: false, voiceUnavailable: true, language: "af-ZA" }, "the default model lists no Afrikaans");
  assert.deepEqual(await tts.synthesize({ text: "Hello", language: "en", voice: afrikaans.ttsVoices!.female }), { ok: false }, "an Afrikaans name for an English reading is nobody's voice here");
  const v3 = tuningFor({ ...speechSettingsByDefault, elevenLabs: { ...speechSettingsByDefault.elevenLabs, model: "eleven_v3" } }, "routine").tuning;
  const { calls, impl } = answering(audio);
  const read = await elevenLabsTts(impl, ENV).synthesize({ text: "Goeie môre", language: "af", tuning: v3 });
  assert.ok(read.ok && read.voice === afrikaans.ttsVoices!.female && read.language === "af-ZA", "v3 lists Afrikaans, and the reading names the contract's Afrikaans voice");
  assert.equal(bodyOf(calls[0].init).model_id, "eleven_v3");
  assert.ok(card.models.eleven_v3.languages.includes("af"));
});

test("a flash model is handed the language code; every way a call ends badly is one flag", async () => {
  const flash = tuningFor({ ...speechSettingsByDefault, elevenLabs: { ...speechSettingsByDefault.elevenLabs, model: "eleven_flash_v2_5" } }, "routine").tuning;
  const { calls, impl } = answering(audio);
  await elevenLabsTts(impl, ENV).synthesize({ text: "Hello", language: "en", tuning: flash });
  assert.equal(bodyOf(calls[0].init).language_code, "en");
  for (const answer of [
    () => new Response("nope", { status: 401 }),
    () => new Response(Buffer.alloc(0), { status: 200 }),
    () => { throw new Error("transport hung"); },
  ]) {
    const failing = answering(answer);
    assert.deepEqual(await elevenLabsTts(failing.impl, ENV).synthesize({ text: "Hello", language: "en", tuning: presentation }), { ok: false });
  }
});
