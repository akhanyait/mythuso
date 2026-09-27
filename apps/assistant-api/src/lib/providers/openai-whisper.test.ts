import test from "node:test";
import assert from "node:assert/strict";
import { openaiWhisper } from "./openai-whisper.ts";
import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };

/* The hosted Whisper adapter's own tests, written with it on 28 September 2026. Nothing here reaches
   the network: the door takes its fetch as a parameter, every test hands it one that answers from a
   factory, and the unconfigured tests hand one that must never run. What these hold the adapter to
   is the shape the vendor documents — a multipart form at the card's host, the key in the
   Authorization header and nowhere else — and the seam's promises: one flag for every failure, the
   contract's languages only, and nothing spoken. Whether the documented shape is what the live API
   accepts is not something a test with a fake fetch can know; the adapter's header says so. */

const card = registry.cards.find((c) => c.id === "openai-whisper") as {
  regions: { hosts: { default: string } };
  languages: string[];
  defaults: { OPENAI_TRANSCRIBE_MODEL: string };
};

/* Shaped like a key — no whitespace, long enough — and nothing like one: the build sweeps for the
   real shapes. */
const ENV = { OPENAI_API_KEY: "fixture-openai-key-0123456789abcdef" } as const;

const mustNotFetch: typeof fetch = async () => {
  throw new Error("a test that did not hand over an answer must never reach the network");
};

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

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const capture = { audioBase64: Buffer.from("a capture").toString("base64"), language: "en-ZA", audioFormat: "audio/wav" };

test("without a plausible key the adapter is not configured, and neither door opens", async () => {
  for (const env of [{}, { OPENAI_API_KEY: "   " }, { OPENAI_API_KEY: "short" }, { OPENAI_API_KEY: "a key with spaces in it 0123456789" }]) {
    const speech = openaiWhisper(mustNotFetch, env);
    assert.equal(speech.configured(), false, `${JSON.stringify(env)} is not configured`);
    assert.equal(speech.configured("stt"), false);
    assert.deepEqual(await speech.recognize(capture), { ok: false });
    assert.deepEqual(await speech.synthesize({ text: "Hello", language: "en-ZA" }), { ok: false });
  }
  const configured = openaiWhisper(mustNotFetch, ENV);
  assert.equal(configured.configured(), true);
  assert.equal(configured.configured("stt"), true);
  assert.equal(configured.configured("tts"), false, "Whisper hears; it never speaks");
  assert.deepEqual(
    await configured.synthesize({ text: "Hello", language: "en-ZA" }),
    { ok: false },
    "the speaking door answers not-ok without a call",
  );
});

test("a configured adapter posts the documented multipart form to the card's host and hands back the words alone", async () => {
  const { calls, impl } = answering(() => json({ text: "  my chest hurts  " }));
  const heard = await openaiWhisper(impl, ENV).recognize(capture);
  assert.deepEqual(heard, { ok: true, text: "my chest hurts", language: "en-ZA" });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, `https://${card.regions.hosts.default}/v1/audio/transcriptions`, "the host is the card's, and the path the documented one");
  const headers = new Headers(init.headers as Record<string, string>);
  assert.equal(headers.get("authorization"), `Bearer ${ENV.OPENAI_API_KEY}`, "the key travels as a bearer token and nowhere else");
  assert.equal(init.method, "POST");
  const body = init.body as FormData;
  assert.ok(body instanceof FormData, "the documented shape is a multipart form");
  assert.equal(body.get("model"), card.defaults.OPENAI_TRANSCRIBE_MODEL, "the model defaults to the card's own default");
  assert.equal(body.get("language"), "en", "the language is the contract's ISO-639-1 id for the locale asked");
  assert.equal(body.get("response_format"), "json");
  const file = body.get("file") as File;
  assert.ok(file instanceof Blob);
  assert.equal(file.name, "capture.wav", "the file name carries the declared container");
  assert.equal(file.type, "audio/wav");
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), "a capture", "the audio is the form's file, decoded from the base64 it arrived as");
  assert.ok(!JSON.stringify([...body.keys()]).includes(ENV.OPENAI_API_KEY), "the key is not in the form");

  const named = answering(() => json({ text: "hi" }));
  await openaiWhisper(named.impl, { ...ENV, OPENAI_TRANSCRIBE_MODEL: " gpt-4o-mini-transcribe " }).recognize({ ...capture, audioFormat: "audio/webm;codecs=opus" });
  const form = named.calls[0].init.body as FormData;
  assert.equal(form.get("model"), "gpt-4o-mini-transcribe", "an operator's model name is honoured, trimmed");
  assert.equal((form.get("file") as File).name, "capture.webm", "a format with parameters still names its container");
});

test("only the languages the card records are heard; the rest are refused before anything leaves", async () => {
  const { calls, impl } = answering(() => json({ text: "goeie dag" }));
  const af = await openaiWhisper(impl, ENV).recognize({ ...capture, language: "af" });
  assert.deepEqual(af, { ok: true, text: "goeie dag", language: "af-ZA" }, "Afrikaans is on the card's list and answers in its own locale");
  assert.equal((calls[0].init.body as FormData).get("language"), "af");
  const refusing = openaiWhisper(mustNotFetch, ENV);
  for (const language of ["zu", "zu-ZA", "xh", "st", "fr", "tn"]) {
    assert.deepEqual(await refusing.recognize({ ...capture, language }), { ok: false }, `${language} is not on the card's list`);
  }
  assert.deepEqual([...card.languages].sort(), ["af", "en"], "the card is the list this test reads");
});

test("every way the door ends badly is one not-ok, and silence is an honest empty reading", async () => {
  const quiet = openaiWhisper(answering(() => json({ text: "" })).impl, ENV);
  assert.deepEqual(await quiet.recognize(capture), { ok: true, text: "", language: "en-ZA" });
  const refused = openaiWhisper(answering(() => new Response("no", { status: 401 })).impl, ENV);
  assert.deepEqual(await refused.recognize(capture), { ok: false }, "a refusal is one flag");
  const limited = openaiWhisper(answering(() => json({ error: { message: "rate limited" } }, 429)).impl, ENV);
  assert.deepEqual(await limited.recognize(capture), { ok: false });
  const shapeless = openaiWhisper(answering(() => json({ words: [] })).impl, ENV);
  assert.deepEqual(await shapeless.recognize(capture), { ok: false }, "a body without the documented text field is not believed");
  const garbage = openaiWhisper(answering(() => new Response("not json", { status: 200 })).impl, ENV);
  assert.deepEqual(await garbage.recognize(capture), { ok: false });
  const hung = openaiWhisper((async () => { throw new Error("transport"); }) as typeof fetch, ENV);
  assert.deepEqual(await hung.recognize(capture), { ok: false }, "a transport that hung is one flag, never an exception");
});
