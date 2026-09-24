import test from "node:test";
import assert from "node:assert/strict";
import {
  cloudSpeech,
  SPEECH_LOCALE,
  SPEECH_OUTPUT_FORMAT,
  SPEECH_VOICES,
} from "./speech.ts";
import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };

/* The cloud voice's own tests, added with it on 22 September 2026. The routes above it are tested
   against fakes in server.test.ts, so this file is the one that holds ./speech.ts itself to its
   promises: the environment gate, the two request shapes, the locale rule and the two readings.
   Nothing here reaches the network — both doors take their fetch as a parameter, every test hands
   them one that answers from a factory, and the unconfigured tests hand one that must never run
   at all. The locale, the format and the two voices are asserted against
   packages/catalog/assistant.json, the contract the module itself reads: a value changed in code
   and not on file fails here. */

const ENV = {
  AZURE_SPEECH_KEY: "fixture-speech-key",
  AZURE_SPEECH_REGION: "southafricanorth",
} as const;

/* A fetch that must never be reached: a door that opened without credentials, or sent something a
   test never asked it to, fails on this line rather than somewhere inside an assertion. */
const mustNotFetch: typeof fetch = async () => {
  throw new Error(
    "a test that did not hand over an answer must never reach the network",
  );
};

/* A fetch that records what would have left and answers from a factory. `init` is kept whole, so
   the assertions can read the exact headers and body the module built. */
const answering = (answer: () => Response) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: String(input), init: init ?? {} });
    return answer();
  }) as typeof fetch;
  return { calls, impl };
};

const sttAnswer = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

/* The contract's own recognition locales, read here exactly as the module reads them. */
const RECOGNITION_LOCALES: readonly string[] =
  assistant.voice.languages?.[0]?.recognitionLocales ?? [];

test("a key in a region outside South Africa is not a configured cloud voice, so no audio leaves for it", async () => {
  for (const region of ["westeurope", "eastus", "uksouth", "southafricawest"]) {
    const speech = cloudSpeech(mustNotFetch, {
      AZURE_SPEECH_KEY: ENV.AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION: region,
    });
    assert.equal(speech.configured(), false, `${region} is not a region the DPIA assessed`);
    assert.deepEqual(
      await speech.recognize({ audioBase64: "AAAA", language: "en-ZA", audioFormat: "audio/wav" }),
      { ok: false },
    );
  }
  assert.equal(
    cloudSpeech(mustNotFetch, {
      AZURE_SPEECH_KEY: ENV.AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION: "SouthAfricaNorth",
    }).configured(),
    true,
    "the assessed region, however it was capitalised, is still configured",
  );
});

test("with either half of the credentials missing the cloud voice is not configured, and no door opens", async () => {
  for (const env of [
    {},
    { AZURE_SPEECH_KEY: ENV.AZURE_SPEECH_KEY },
    { AZURE_SPEECH_REGION: ENV.AZURE_SPEECH_REGION },
    {
      AZURE_SPEECH_KEY: ENV.AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION: "south africa north",
    },
    { AZURE_SPEECH_KEY: "   ", AZURE_SPEECH_REGION: ENV.AZURE_SPEECH_REGION },
  ]) {
    const speech = cloudSpeech(mustNotFetch, env);
    assert.equal(
      speech.configured(),
      false,
      `${JSON.stringify(env)} is not a configured cloud voice`,
    );
    assert.deepEqual(
      await speech.recognize({
        audioBase64: "AAAA",
        language: "en-ZA",
        audioFormat: "audio/wav",
      }),
      { ok: false },
      "the unconfigured recognising door answers not-ok without ever reaching its fetch",
    );
    assert.deepEqual(
      await speech.synthesize({ text: "Hello", language: "en-ZA" }),
      { ok: false },
      "the unconfigured speaking door answers not-ok without ever reaching its fetch",
    );
  }
});

test("a configured recogniser posts the capture to the region's own stt door and hands back the words alone", async () => {
  const { calls, impl } = answering(() =>
    sttAnswer({
      RecognitionStatus: "Success",
      DisplayText: "  my chest hurts  ",
    }),
  );
  const speech = cloudSpeech(impl, ENV);
  assert.equal(speech.configured(), true);
  const heard = await speech.recognize({
    audioBase64: Buffer.from("a capture").toString("base64"),
    language: "en-ZA",
    audioFormat: "audio/wav",
  });
  assert.deepEqual(
    heard,
    { ok: true, text: "my chest hurts", language: SPEECH_LOCALE },
    "the words are trimmed and travel with the locale that actually heard them",
  );
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(
    url.startsWith(
      `https://${ENV.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/`,
    ),
    true,
    "the region is the one configured, and it is the only host anything is sent to",
  );
  assert.equal(
    url.includes(`language=${SPEECH_LOCALE}`),
    true,
    "the decided locale travels in the query",
  );
  assert.equal(
    url.includes("format=simple"),
    true,
    "simple: the words, not a lattice of alternatives",
  );
  const headers = new Headers(init.headers as Record<string, string>);
  assert.equal(headers.get("ocp-apim-subscription-key"), ENV.AZURE_SPEECH_KEY);
  assert.equal(
    headers.get("content-type"),
    "audio/wav",
    "the declared format is the body's own type",
  );
  assert.equal(
    Buffer.isBuffer(init.body),
    true,
    "the audio is the body, decoded from the base64 it arrived as",
  );
  assert.equal((init.body as Buffer).toString(), "a capture");

  /* A region typed with capitals has still configured it, and it is lowercased before it is
    interpolated into a URL — the one place a malformed region could point somewhere else. */
  const upper = answering(() =>
    sttAnswer({ RecognitionStatus: "Success", DisplayText: "hi" }),
  );
  const capitals = cloudSpeech(upper.impl, {
    AZURE_SPEECH_KEY: ENV.AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION: "SouthAfricaNorth",
  });
  assert.equal(capitals.configured(), true);
  await capitals.recognize({
    audioBase64: "AAAA",
    language: "en-ZA",
    audioFormat: "audio/wav",
  });
  assert.equal(
    upper.calls[0].url.startsWith(
      "https://southafricanorth.stt.speech.microsoft.com/",
    ),
    true,
    "the region is lowercased before it becomes a host",
  );
});

test("a declared language naming one of the contract's locales is honoured; every other declaration meets en-ZA", async () => {
  const { calls, impl } = answering(() =>
    sttAnswer({ RecognitionStatus: "Success", DisplayText: "hello" }),
  );
  const speech = cloudSpeech(impl, ENV);
  const other = RECOGNITION_LOCALES.find(
    (locale) => locale.toLowerCase() !== SPEECH_LOCALE.toLowerCase(),
  );
  assert.ok(other, "the contract carries more than one recognition locale");
  const honoured = await speech.recognize({
    audioBase64: "AAAA",
    language: other.toUpperCase(),
    audioFormat: "audio/wav",
  });
  assert.equal(
    honoured.ok && honoured.language,
    other,
    "matched case-insensitively and answered in the contract's own spelling",
  );
  assert.equal(calls[0].url.includes(`language=${other}`), true);
  const plain = await speech.recognize({
    audioBase64: "AAAA",
    language: "en",
    audioFormat: "audio/wav",
  });
  assert.equal(
    plain.ok && plain.language,
    SPEECH_LOCALE,
    'plain "en" meets the decided locale rather than a guess at a second one',
  );
  assert.equal(
    calls[1].url.includes(`language=${SPEECH_LOCALE}`),
    true,
    "the locale sent is the one decided, not the ask",
  );
  const elsewhere = await speech.recognize({
    audioBase64: "AAAA",
    language: "fr",
    audioFormat: "audio/wav",
  });
  assert.equal(
    elsewhere.ok && elsewhere.language,
    SPEECH_LOCALE,
    "a language the contract does not promise meets the one it does",
  );
});

test("no words heard is an honest empty reading, and every other way the door ends badly is one not-ok", async () => {
  const quiet = cloudSpeech(
    answering(() => sttAnswer({ RecognitionStatus: "NoMatch" })).impl,
    ENV,
  );
  assert.deepEqual(
    await quiet.recognize({
      audioBase64: "AAAA",
      language: "en-ZA",
      audioFormat: "audio/wav",
    }),
    { ok: true, text: "", language: SPEECH_LOCALE },
    "a tap that caught no words is answered with no words, not an error",
  );
  const refused = cloudSpeech(
    answering(() => new Response("no", { status: 401 })).impl,
    ENV,
  );
  assert.deepEqual(
    await refused.recognize({
      audioBase64: "AAAA",
      language: "en-ZA",
      audioFormat: "audio/wav",
    }),
    { ok: false },
    "a refusal is one flag",
  );
  const errored = cloudSpeech(
    answering(() => sttAnswer({ RecognitionStatus: "Error" })).impl,
    ENV,
  );
  assert.deepEqual(
    await errored.recognize({
      audioBase64: "AAAA",
      language: "en-ZA",
      audioFormat: "audio/wav",
    }),
    { ok: false },
    "a status this file does not know is not believed",
  );
  const garbage = cloudSpeech(
    answering(() => new Response("not json", { status: 200 })).impl,
    ENV,
  );
  assert.deepEqual(
    await garbage.recognize({
      audioBase64: "AAAA",
      language: "en-ZA",
      audioFormat: "audio/wav",
    }),
    { ok: false },
    "a body that is not the JSON Azure promises is one flag, not a crash",
  );
  const hung = cloudSpeech(
    (async () => {
      throw new Error("transport");
    }) as typeof fetch,
    ENV,
  );
  assert.deepEqual(
    await hung.recognize({
      audioBase64: "AAAA",
      language: "en-ZA",
      audioFormat: "audio/wav",
    }),
    { ok: false },
    "a transport that hung is one flag, never an exception out of this module",
  );
});

test("a configured voice posts escaped SSML in the contract's voice and format, and hands back the mp3", async () => {
  const bytes = Buffer.from("ID3 a fake mp3 stream");
  const { calls, impl } = answering(() => new Response(bytes, { status: 200 }));
  const speech = cloudSpeech(impl, ENV);
  const read = await speech.synthesize({
    text: "Take this & that <now>",
    language: "en-ZA",
  });
  assert.deepEqual(
    read,
    {
      ok: true,
      audioBase64: bytes.toString("base64"),
      format: "audio/mpeg",
      voice: SPEECH_VOICES[0],
      language: SPEECH_LOCALE,
    },
    "no voice asked for is the female voice the contract decides",
  );
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(
    url.startsWith(
      `https://${ENV.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/`,
    ),
    true,
    "the voice's own door, in the configured region",
  );
  const headers = new Headers(init.headers as Record<string, string>);
  assert.equal(headers.get("ocp-apim-subscription-key"), ENV.AZURE_SPEECH_KEY);
  assert.equal(
    headers.get("x-microsoft-outputformat"),
    SPEECH_OUTPUT_FORMAT,
    "the format the contract decided",
  );
  const ssml = String(init.body);
  assert.equal(
    ssml.includes("&amp;"),
    true,
    "an ampersand in an answer is a character in that answer, never markup",
  );
  assert.equal(ssml.includes("&lt;now&gt;"), true);
  assert.equal(ssml.includes(`<voice name="${SPEECH_VOICES[0]}">`), true);
  assert.equal(ssml.includes(`xml:lang="${SPEECH_LOCALE}"`), true);

  const male = await speech.synthesize({
    text: "Hello",
    language: "en-ZA",
    voice: SPEECH_VOICES[1],
  });
  assert.equal(
    male.ok && male.voice,
    SPEECH_VOICES[1],
    "the male voice the contract names is honoured",
  );
  assert.equal(
    String(calls[1].init.body).includes(`<voice name="${SPEECH_VOICES[1]}">`),
    true,
  );
  const unknown = await speech.synthesize({
    text: "Hello",
    language: "en-ZA",
    voice: "en-ZA-SiphoNeural",
  });
  assert.deepEqual(
    unknown,
    { ok: false },
    "a voice the contract does not name never becomes SSML — the door checks its own string",
  );
  assert.equal(
    calls.length,
    2,
    "only the two asks with a contract voice reached the door",
  );

  const silent = cloudSpeech(
    answering(() => new Response(Buffer.alloc(0), { status: 200 })).impl,
    ENV,
  );
  assert.deepEqual(
    await silent.synthesize({ text: "Hello", language: "en-ZA" }),
    { ok: false },
    "an empty stream is not speech",
  );
  const refused = cloudSpeech(
    answering(() => new Response("no", { status: 429 })).impl,
    ENV,
  );
  assert.deepEqual(
    await refused.synthesize({ text: "Hello", language: "en-ZA" }),
    { ok: false },
    "a refusal is one flag here exactly as it is on the hearing door",
  );
});

test("the locale, the format and the two voices are the contract's own, read and not typed", () => {
  assert.equal(SPEECH_LOCALE, assistant.voice.cloud.recognitionLocale);
  assert.equal(SPEECH_OUTPUT_FORMAT, assistant.voice.cloud.outputFormat);
  assert.deepEqual(
    [...SPEECH_VOICES],
    [assistant.voice.cloud.voices.female, assistant.voice.cloud.voices.male],
    "the two voices are the contract's own, in its own order",
  );
  assert.equal(
    assistant.voice.cloud.audioStored,
    false,
    "nothing here may keep a recording, and the contract says so in the words a person reads",
  );
});

/* The multi-language voices, added with the multi-language backend of 23 September 2026. The
   contract now names a cloud voice for some languages and not others, and the speaking door has to
   honour that split: a language Azure has no neural voice for is refused before any call leaves,
   and one it does have is spoken in that language's own voice, resolved from the contract rather
   than typed here. */
const CATALOG_LANGUAGES = assistant.voice.languages as Array<{
  id: string;
  recognitionLocales: string[];
  ttsAvailable?: boolean;
  ttsVoices?: { female: string; male: string };
}>;

test("a language the contract has no cloud voice for is answered voiceUnavailable, without any Azure call", async () => {
  /* zu, xh and st are in the contract's voice.languages marked ttsAvailable:false, and the further
     South African languages (tn, nso, …) are not carried at all. Either way the speaking door must
     refuse before it reaches the network — mustNotFetch throws if it is called — and say why, so the
     route can show the contract's voiceUnavailableNotice rather than an internal error. The hearing
     door is untouched: it still recognises whatever Azure hears, so a zu-ZA capture is still read. */
  const speech = cloudSpeech(mustNotFetch, ENV);
  for (const language of ["zu", "zu-ZA", "xh", "st", "tn", "nso"]) {
    const read = await speech.synthesize({ text: "Sawubona", language });
    assert.equal(read.ok, false, `${language} has no cloud voice`);
    assert.equal(
      !read.ok && read.voiceUnavailable,
      true,
      `${language} is answered voiceUnavailable, not as a failure`,
    );
  }
});

test("an Afrikaans answer is spoken in an Afrikaans voice, resolved from the contract", async () => {
  const bytes = Buffer.from("ID3 a fake afrikaans mp3");
  const { calls, impl } = answering(() => new Response(bytes, { status: 200 }));
  const speech = cloudSpeech(impl, ENV);
  const af = CATALOG_LANGUAGES.find((language) => language.id === "af");
  const afVoices = af?.ttsVoices;
  assert.ok(af?.ttsAvailable && afVoices, "the contract carries an Afrikaans voice");
  const read = await speech.synthesize({ text: "Goeie dag", language: "af" });
  assert.deepEqual(
    read,
    {
      ok: true,
      audioBase64: bytes.toString("base64"),
      format: "audio/mpeg",
      voice: afVoices.female,
      language: "af-ZA",
    },
    "no voice asked for is the Afrikaans female voice the contract decides, in the af-ZA locale",
  );
  const ssml = String(calls[0].init.body);
  assert.equal(ssml.includes(`<voice name="${afVoices.female}">`), true);
  assert.equal(ssml.includes(`xml:lang="af-ZA"`), true);
  /* The male voice the contract names for Afrikaans is honoured when a caller asks for it, even
     though it is not one of the two en-ZA voices SPEECH_VOICES carries. */
  const male = await speech.synthesize({
    text: "Goeie dag",
    language: "af",
    voice: afVoices.male,
  });
  assert.equal(
    male.ok && male.voice,
    afVoices.male,
    "the Afrikaans male voice the contract names is honoured",
  );
});
