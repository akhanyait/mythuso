import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };
import {
  languageEntry,
  localeFor,
  PLAUSIBLE_BEARER_KEY,
  STT_TIMEOUT_MS,
  TTS_TIMEOUT_MS,
  type SpeechSeam,
} from "./seam.ts";

/* Alibaba Qwen through DashScope — two adapters in one file, because they share a key, a host and
   a request door: alibabaQwenAsr hears (model qwen3-asr-flash) and alibabaQwenTts speaks (model
   qwen-tts). Built 28 September 2026 on the founder's ask.

   READ THIS FIRST IF YOU ARE THE ONE CONFIGURING IT. Every request and every reading below is
   written from Alibaba Cloud Model Studio's published documentation for the DashScope
   multimodal-generation door — POST /api/v1/services/aigc/multimodal-generation/generation, a
   Bearer key, `input.messages[].content[].audio` as a base64 data URI for recognition and
   `input.text` + `input.voice` for synthesis, the words read back at
   output.choices[0].message.content[0].text and the audio at output.audio.url or .data — and was NOT
   exercised against the live API in the change that wrote it. No key existed to try it with, and
   this repository never holds one. The first operator to set DASHSCOPE_API_KEY is the first person
   to find out whether these shapes are right; the journal's assistant.listen.failed and
   assistant.speak.failed lines are the only clues, because nothing the provider says is forwarded.

   WHERE THE AUDIO GOES. DashScope serves from Singapore (dashscope-intl.aliyuncs.com) or Beijing
   (dashscope.aliyuncs.com) and from nowhere in South Africa; DASHSCOPE_REGION picks one of the two
   hosts the card records, and the card records regions.southAfricanRegion false with the flows of a
   patient's capture and GilbertOne's spoken answer to it as health information. The documented
   synthesis answer is a link to the rendered audio that stays valid for a day on the provider's own
   storage — a copy of a health answer outside this process for that long, by the provider's own
   documentation. So ../speech.ts refuses to select either adapter in production while
   docs/governance/DATA-RESIDENCY-OPTIONS.md §7 is blank; that refusal is the selection's, and this
   file is only the adapter beneath it.

   THE ENVIRONMENT IS THE ONLY SWITCH. DASHSCOPE_API_KEY and DASHSCOPE_REGION are read on every
   call, never stored, never logged; the key travels in the Authorization header and nowhere else.
   The hosts, the models, the languages each model is documented to handle and the voices the speaking
   model is documented to have are the two cards' in packages/catalog/api-registry.json, so none of
   them is a string here: a language outside a card's list is refused before anything leaves (for
   hearing, { ok: false }; for speaking, voiceUnavailable so the route shows the contract's own
   notice), and a voice the card does not name never reaches the request body. Each adapter serves
   its one direction and answers { ok: false } for the other without a call.

   FAILURE IS ONE FLAG, NEVER AN EXCEPTION — as with every adapter behind the seam. A rendered
   audio link is followed only when it is https on the provider's own domain, within the same
   ceiling as the request that returned it, and nothing is kept once the bytes are handed back. */

export const ALIBABA_QWEN_ASR_CARD_ID = "alibaba-qwen-asr";
export const ALIBABA_QWEN_TTS_CARD_ID = "alibaba-qwen-tts";

type QwenCard = {
  id: string;
  environment: string[];
  model: string;
  regions: { hosts: Record<string, string>; selectedBy: string };
  languages?: string[];
  voices?: Record<string, { default: string; names: string[] }>;
};

const cardOf = (id: string): QwenCard => {
  const found = registry.cards.find((c) => c.id === id) as QwenCard | undefined;
  if (!found?.regions?.hosts || typeof found.model !== "string")
    throw new Error(
      `packages/catalog/api-registry.json has no "${id}" card with regions.hosts and a model; the adapter reads both from it.`,
    );
  return found;
};
const asrCard = cardOf(ALIBABA_QWEN_ASR_CARD_ID);
const ttsCard = cardOf(ALIBABA_QWEN_TTS_CARD_ID);
const HEARS: readonly string[] = asrCard.languages ?? [];
const VOICES: Record<string, { default: string; names: string[] }> =
  ttsCard.voices ?? {};

/* The one path both models are documented behind. */
const GENERATION_PATH =
  "/api/v1/services/aigc/multimodal-generation/generation";
/* A host is interpolated into a URL, so it is held to hostname characters even though it came from
   the contract. */
const HOSTNAME = /^[a-z0-9.-]{1,253}$/;
/* A rendered-audio link is followed only on the provider's own domain, over TLS. */
const PROVIDER_DOMAIN = ".aliyuncs.com";
/* What the documented non-streaming answer links to: a WAV file, 24 kHz, 16-bit, mono. */
const SPOKEN_AUDIO_MIME = "audio/wav";

function credentials(
  card: QwenCard,
  env: Record<string, string | undefined>,
): { host: string; key: string } | null {
  const region = (env.DASHSCOPE_REGION ?? "").trim().toLowerCase();
  const host = card.regions.hosts[region];
  const key = (env.DASHSCOPE_API_KEY ?? "").trim();
  return host && HOSTNAME.test(host) && PLAUSIBLE_BEARER_KEY.test(key)
    ? { host, key }
    : null;
}

/* A media type for the data URI: the token set a media type uses, nothing else. */
const safeMediaType = (value: string): string =>
  value.split(";")[0].replace(/[^A-Za-z0-9/+.-]/g, "").slice(0, 64) ||
  "audio/wav";

const post = (
  fetchImpl: typeof fetch,
  found: { host: string; key: string },
  body: unknown,
  signal: AbortSignal,
) =>
  fetchImpl(`https://${found.host}${GENERATION_PATH}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${found.key}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "mythuso-assistant",
    },
    body: JSON.stringify(body),
    signal,
  });

export function alibabaQwenAsr(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): SpeechSeam {
  const configured: SpeechSeam["configured"] = (direction) =>
    direction === "tts" ? false : credentials(asrCard, env) !== null;

  const recognize: SpeechSeam["recognize"] = async (request) => {
    const found = credentials(asrCard, env);
    if (!found) return { ok: false };
    const entry = languageEntry(request.language);
    if (!entry || !HEARS.includes(entry.id)) return { ok: false };
    const locale = localeFor(request.language);
    try {
      /* The documented shape: the capture as a data URI in a user message, the language the
         contract gives the capture in asr_options, and no inverse text normalisation — the words as
         heard, which the panel shows for correction before anything is sent. */
      const audio = `data:${safeMediaType(request.audioFormat)};base64,${request.audioBase64.trim()}`;
      const response = await post(
        fetchImpl,
        found,
        {
          model: asrCard.model,
          input: { messages: [{ role: "user", content: [{ audio }] }] },
          parameters: { asr_options: { language: entry.id, enable_itn: false } },
        },
        AbortSignal.timeout(STT_TIMEOUT_MS),
      );
      if (!response.ok) return { ok: false };
      const heard = (await response.json()) as {
        output?: {
          choices?: { message?: { content?: { text?: unknown }[] } }[];
        };
      };
      const content = heard.output?.choices?.[0]?.message?.content;
      if (!Array.isArray(content)) return { ok: false };
      const text = content.find((part) => typeof part?.text === "string")?.text;
      /* A message with no text part is silence, not a fault. */
      return {
        ok: true,
        text: typeof text === "string" ? text.trim() : "",
        language: locale,
      };
    } catch {
      return { ok: false };
    }
  };

  const synthesize: SpeechSeam["synthesize"] = async () => ({ ok: false });

  return { configured, recognize, synthesize };
}

export function alibabaQwenTts(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): SpeechSeam {
  const configured: SpeechSeam["configured"] = (direction) =>
    direction === "stt" ? false : credentials(ttsCard, env) !== null;

  const recognize: SpeechSeam["recognize"] = async () => ({ ok: false });

  const synthesize: SpeechSeam["synthesize"] = async (request) => {
    const found = credentials(ttsCard, env);
    if (!found) return { ok: false };
    const locale = localeFor(request.language);
    /* The card names voices for the languages the model is documented to speak, and for no other:
       a language without an entry is answered voiceUnavailable before any call, so the route shows
       the contract's notice and the words stay on the screen. */
    const entry = languageEntry(request.language);
    const voices = entry ? VOICES[entry.id] : undefined;
    if (!voices) return { ok: false, voiceUnavailable: true, language: locale };
    const asked = request.voice?.trim() ?? "";
    if (asked && !voices.names.includes(asked)) return { ok: false };
    const voice = asked || voices.default;
    /* One ceiling for the request and for following the link it answers with. */
    const signal = AbortSignal.timeout(TTS_TIMEOUT_MS);
    try {
      const response = await post(
        fetchImpl,
        found,
        { model: ttsCard.model, input: { text: request.text, voice } },
        signal,
      );
      if (!response.ok) return { ok: false };
      const spoken = (await response.json()) as {
        output?: { audio?: { url?: unknown; data?: unknown } };
      };
      const audio = spoken.output?.audio;
      let bytes: Buffer | null = null;
      if (typeof audio?.data === "string" && audio.data.trim()) {
        bytes = Buffer.from(audio.data.trim(), "base64");
      } else if (typeof audio?.url === "string") {
        const link = new URL(audio.url);
        if (link.protocol !== "https:" || !link.hostname.endsWith(PROVIDER_DOMAIN))
          return { ok: false };
        const file = await fetchImpl(link, {
          method: "GET",
          headers: { "user-agent": "mythuso-assistant" },
          signal,
        });
        if (!file.ok) return { ok: false };
        bytes = Buffer.from(await file.arrayBuffer());
      }
      if (!bytes?.length) return { ok: false };
      return {
        ok: true,
        audioBase64: bytes.toString("base64"),
        format: SPOKEN_AUDIO_MIME,
        voice,
        language: locale,
      };
    } catch {
      return { ok: false };
    }
  };

  return { configured, recognize, synthesize };
}
