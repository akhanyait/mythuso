import test from "node:test";
import assert from "node:assert/strict";
import { alibabaQwenAsr, alibabaQwenTts } from "./alibaba-qwen.ts";
import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };

/* The two DashScope adapters' own tests, written with them on 28 September 2026. Nothing here
   reaches the network. What these hold the adapters to is the shape the vendor documents — one
   generation door on the host DASHSCOPE_REGION picks from the card, a bearer key, the capture as a
   data URI, the words at output.choices[0].message.content[0].text, the audio at a link that is
   followed only on the provider's own domain — and the seam's promises: one flag for every failure,
   the card's languages and voices only, each adapter its one direction. Whether the documented
   shape is what the live API accepts is not something a fake fetch can know; the file's header says
   so. */

type Hosts = { singapore: string; beijing: string };
const asrCard = registry.cards.find((c) => c.id === "alibaba-qwen-asr") as { regions: { hosts: Hosts }; languages: string[]; model: string };
const ttsCard = registry.cards.find((c) => c.id === "alibaba-qwen-tts") as { regions: { hosts: Hosts }; voices: Record<string, { default: string; names: string[] }>; model: string };
const PATH = "/api/v1/services/aigc/multimodal-generation/generation";

/* Shaped like a key and nothing like one. */
const ENV = { DASHSCOPE_API_KEY: "fixture-dashscope-key-0123456789", DASHSCOPE_REGION: "singapore" } as const;

const mustNotFetch: typeof fetch = async () => {
  throw new Error("a test that did not hand over an answer must never reach the network");
};

const answering = (answer: (call: number) => Response) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: input instanceof URL ? input.href : String(input), init: init ?? {} });
    return answer(calls.length);
  }) as typeof fetch;
  return { calls, impl };
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

const heardAs = (text: string) => json({ output: { choices: [{ message: { content: [{ text }] } }] } });
const capture = { audioBase64: "AAAA", language: "en-ZA", audioFormat: "audio/wav" };
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as {
  model: string;
  input: { text?: string; voice?: string; messages?: { role: string; content: { audio?: string }[] }[] };
  parameters?: { asr_options?: { language?: string; enable_itn?: boolean } };
};

test("without a key and one of the card's two regions neither adapter is configured, and no door opens", async () => {
  for (const env of [
    {},
    { DASHSCOPE_API_KEY: ENV.DASHSCOPE_API_KEY },
    { DASHSCOPE_REGION: "singapore" },
    { DASHSCOPE_API_KEY: ENV.DASHSCOPE_API_KEY, DASHSCOPE_REGION: "frankfurt" },
    { DASHSCOPE_API_KEY: ENV.DASHSCOPE_API_KEY, DASHSCOPE_REGION: "johannesburg" },
    { DASHSCOPE_API_KEY: "a key with spaces 0123456789", DASHSCOPE_REGION: "singapore" },
  ]) {
    const asr = alibabaQwenAsr(mustNotFetch, env);
    const tts = alibabaQwenTts(mustNotFetch, env);
    assert.equal(asr.configured(), false, `${JSON.stringify(env)} does not configure the ear`);
    assert.equal(tts.configured(), false, `${JSON.stringify(env)} does not configure the voice`);
    assert.deepEqual(await asr.recognize(capture), { ok: false });
    assert.deepEqual(await tts.synthesize({ text: "Hello", language: "en-ZA" }), { ok: false });
  }
  for (const region of ["singapore", "beijing", "Singapore", " BEIJING "]) {
    const env = { DASHSCOPE_API_KEY: ENV.DASHSCOPE_API_KEY, DASHSCOPE_REGION: region };
    assert.equal(alibabaQwenAsr(mustNotFetch, env).configured("stt"), true, `${region} is one of the card's regions`);
    assert.equal(alibabaQwenTts(mustNotFetch, env).configured("tts"), true);
  }
  const asr = alibabaQwenAsr(mustNotFetch, ENV);
  const tts = alibabaQwenTts(mustNotFetch, ENV);
  assert.equal(asr.configured("tts"), false, "the ear never speaks");
  assert.equal(tts.configured("stt"), false, "the voice never hears");
  assert.deepEqual(await asr.synthesize({ text: "Hello", language: "en-ZA" }), { ok: false }, "and answers the other direction without a call");
  assert.deepEqual(await tts.recognize(capture), { ok: false });
});

test("the ear posts the documented message shape to the region's host and hands back the words alone", async () => {
  const { calls, impl } = answering(() => heardAs("  my chest hurts  "));
  const heard = await alibabaQwenAsr(impl, ENV).recognize({ ...capture, audioFormat: "audio/wav;codecs=1" });
  assert.deepEqual(heard, { ok: true, text: "my chest hurts", language: "en-ZA" });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, `https://${asrCard.regions.hosts.singapore}${PATH}`, "Singapore is the card's host for that region");
  const headers = new Headers(init.headers as Record<string, string>);
  assert.equal(headers.get("authorization"), `Bearer ${ENV.DASHSCOPE_API_KEY}`);
  assert.equal(headers.get("content-type"), "application/json");
  const body = bodyOf(init);
  assert.equal(body.model, asrCard.model, "the model is the card's");
  assert.equal(body.input.messages?.[0].role, "user");
  assert.equal(body.input.messages?.[0].content[0].audio, "data:audio/wav;base64,AAAA", "the capture travels as a data URI, its parameters dropped");
  assert.deepEqual(body.parameters?.asr_options, { language: "en", enable_itn: false }, "the language is the contract's id, and the words are as heard");
  assert.ok(!String(init.body).includes(ENV.DASHSCOPE_API_KEY), "the key is in the header, never the body");

  const beijing = answering(() => heardAs("hi"));
  await alibabaQwenAsr(beijing.impl, { ...ENV, DASHSCOPE_REGION: "beijing" }).recognize(capture);
  assert.equal(beijing.calls[0].url, `https://${asrCard.regions.hosts.beijing}${PATH}`, "Beijing is the other host, and there is no third");
});

test("the ear hears only the languages its card records, and every bad ending is one not-ok", async () => {
  const refusing = alibabaQwenAsr(mustNotFetch, ENV);
  for (const language of ["zu", "xh", "st", "af", "fr"])
    assert.deepEqual(await refusing.recognize({ ...capture, language }), { ok: false }, `${language} is not on the card's list`);
  assert.deepEqual(asrCard.languages, ["en"], "the card is the list this test reads");
  const quiet = alibabaQwenAsr(answering(() => json({ output: { choices: [{ message: { content: [] } }] } })).impl, ENV);
  assert.deepEqual(await quiet.recognize(capture), { ok: true, text: "", language: "en-ZA" }, "a message with no text part is silence, not a fault");
  const refused = alibabaQwenAsr(answering(() => new Response("no", { status: 401 })).impl, ENV);
  assert.deepEqual(await refused.recognize(capture), { ok: false });
  const limited = alibabaQwenAsr(answering(() => json({ code: "Throttling.RateQuota" }, 429)).impl, ENV);
  assert.deepEqual(await limited.recognize(capture), { ok: false });
  const shapeless = alibabaQwenAsr(answering(() => json({ output: { text: "hi" } })).impl, ENV);
  assert.deepEqual(await shapeless.recognize(capture), { ok: false }, "a body without the documented choices is not believed");
  const garbage = alibabaQwenAsr(answering(() => new Response("not json", { status: 200 })).impl, ENV);
  assert.deepEqual(await garbage.recognize(capture), { ok: false });
  const hung = alibabaQwenAsr((async () => { throw new Error("transport"); }) as typeof fetch, ENV);
  assert.deepEqual(await hung.recognize(capture), { ok: false });
});

test("the voice posts the documented text and voice, follows the answer's link on the provider's own domain, and hands back the audio", async () => {
  const bytes = Buffer.from("RIFF a fake wav stream");
  const link = `https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/fixture.wav`;
  const { calls, impl } = answering((call) => (call === 1 ? json({ output: { audio: { url: link, expires_at: 0 } } }) : new Response(bytes, { status: 200 })));
  const read = await alibabaQwenTts(impl, ENV).synthesize({ text: "Take this & that", language: "en" });
  assert.deepEqual(read, { ok: true, audioBase64: bytes.toString("base64"), format: "audio/wav", voice: ttsCard.voices.en.default, language: "en-ZA" }, "no voice asked for is the card's default for the language, in the contract's locale");
  assert.equal(calls.length, 2, "the request, then the link it answered with");
  assert.equal(calls[0].url, `https://${ttsCard.regions.hosts.singapore}${PATH}`);
  const body = bodyOf(calls[0].init);
  assert.equal(body.model, ttsCard.model);
  assert.deepEqual(body.input, { text: "Take this & that", voice: ttsCard.voices.en.default }, "the words go as they are; there is no markup to escape");
  assert.equal(calls[1].url, link);
  assert.equal(calls[1].init.method, "GET");
  assert.equal(new Headers(calls[1].init.headers as Record<string, string>).get("authorization"), null, "the key is not sent to the storage host");

  const inline = alibabaQwenTts(answering(() => json({ output: { audio: { data: bytes.toString("base64") } } })).impl, ENV);
  const direct = await inline.synthesize({ text: "Hello", language: "en-ZA", voice: "Ethan" });
  assert.equal(direct.ok && direct.voice, "Ethan", "a voice the card names is honoured");
  assert.equal(direct.ok && direct.audioBase64, bytes.toString("base64"), "audio carried inline is used without a second request");
});

test("the voice refuses a link off the provider's domain, a voice the card does not name, and every bad ending", async () => {
  for (const link of ["https://evil.example/fixture.wav", "http://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/fixture.wav", "ftp://x.aliyuncs.com/f"]) {
    const { calls, impl } = answering(() => json({ output: { audio: { url: link } } }));
    assert.deepEqual(await alibabaQwenTts(impl, ENV).synthesize({ text: "Hello", language: "en" }), { ok: false }, `${link} is not followed`);
    assert.equal(calls.length, 1, "and nothing was fetched from it");
  }
  const named = alibabaQwenTts(mustNotFetch, ENV);
  for (const voice of ["en-ZA-LeahNeural", "Sunny", "cherry"])
    assert.deepEqual(await named.synthesize({ text: "Hello", language: "en", voice }), { ok: false }, `"${voice}" is not a name the card gives this language`);
  const empty = alibabaQwenTts(answering(() => json({ output: { audio: {} } })).impl, ENV);
  assert.deepEqual(await empty.synthesize({ text: "Hello", language: "en" }), { ok: false }, "an answer with neither link nor audio is not speech");
  const silent = alibabaQwenTts(answering((call) => (call === 1 ? json({ output: { audio: { url: "https://x.aliyuncs.com/f.wav" } } }) : new Response(Buffer.alloc(0), { status: 200 }))).impl, ENV);
  assert.deepEqual(await silent.synthesize({ text: "Hello", language: "en" }), { ok: false }, "an empty stream is not speech");
  const gone = alibabaQwenTts(answering((call) => (call === 1 ? json({ output: { audio: { url: "https://x.aliyuncs.com/f.wav" } } }) : new Response("no", { status: 404 }))).impl, ENV);
  assert.deepEqual(await gone.synthesize({ text: "Hello", language: "en" }), { ok: false });
  const refused = alibabaQwenTts(answering(() => new Response("no", { status: 429 })).impl, ENV);
  assert.deepEqual(await refused.synthesize({ text: "Hello", language: "en" }), { ok: false });
  const hung = alibabaQwenTts((async () => { throw new Error("transport"); }) as typeof fetch, ENV);
  assert.deepEqual(await hung.synthesize({ text: "Hello", language: "en" }), { ok: false });
});

test("a language the card names no voice for is answered voiceUnavailable, without any call", async () => {
  const speech = alibabaQwenTts(mustNotFetch, ENV);
  for (const [language, locale] of [["zu", "zu-ZA"], ["xh-ZA", "xh-ZA"], ["st", "st-ZA"], ["af", "af-ZA"], ["fr", "en-ZA"], ["tn", "en-ZA"]]) {
    const read = await speech.synthesize({ text: "Sawubona", language });
    assert.deepEqual(read, { ok: false, voiceUnavailable: true, language: locale }, `${language} has no documented Qwen voice`);
  }
  assert.deepEqual(Object.keys(ttsCard.voices), ["en"], "the card names voices for English alone");
});
