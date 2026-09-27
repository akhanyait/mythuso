import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };
import {
  audioSubtype,
  languageEntry,
  localeFor,
  PLAUSIBLE_BEARER_KEY,
  STT_TIMEOUT_MS,
  type SpeechSeam,
} from "./seam.ts";

/* OpenAI Whisper, hosted — the hearing half only. Built 28 September 2026 on the founder's ask.

   READ THIS FIRST IF YOU ARE THE ONE CONFIGURING IT. The request and the reading below are written
   from OpenAI's published API reference for POST /v1/audio/transcriptions — a multipart form with
   `file`, `model`, `language` and `response_format`, answered as JSON with a `text` field — and were
   NOT exercised against the live API in the change that wrote them. No key existed to try it with,
   and this repository never holds one. The first operator to set OPENAI_API_KEY is the first person
   to see whether the shape is right: read /assistant/health, then one /v1/listen through the panel,
   and if it fails the journal's assistant.listen.failed line is the only clue there will be, because
   this file forwards nothing the provider says.

   WHERE THE AUDIO GOES. OpenAI publishes no processing region a customer can pin and none in South
   Africa; the card in packages/catalog/api-registry.json records that as regions.southAfricanRegion
   false, and the flow of a patient's capture to it as health information. So ../speech.ts refuses to
   select this provider in production while docs/governance/DATA-RESIDENCY-OPTIONS.md §7 is blank,
   and that refusal is the selection's, not this file's: this file is an adapter, it works wherever
   it is called, and the decision about where a patient's voice may go is made in one place above it.

   THE ENVIRONMENT IS THE ONLY SWITCH. OPENAI_API_KEY is read on every call, never stored, never
   logged and sent in the Authorization header alone; OPENAI_TRANSCRIBE_MODEL names the model and
   defaults to the card's own default. The host is the card's, so the one address this file can post
   to is a line in the contract rather than a string here. The languages it is asked to hear are the
   contract's, and only the ones the card records the model as documented to hear: a capture in a
   language outside that list is refused before anything leaves, because a transcription in the wrong
   language is worse than none. It speaks nothing: synthesize answers { ok: false } without a call.

   FAILURE IS ONE FLAG, NEVER AN EXCEPTION — exactly as the Azure adapter: a missing key, a refusal,
   a timeout under the shared ceiling, a body that is not the JSON promised, all { ok: false }. */

export const OPENAI_WHISPER_CARD_ID = "openai-whisper";

type WhisperCard = {
  id: string;
  environment: string[];
  defaults?: Record<string, string>;
  regions: { hosts: Record<string, string> };
  languages: string[];
};

/* The card is the adapter's contract: its host, its default model and the languages it may hear. A
   registry without the card is a build without this provider, and the throw says so at import. */
const card = registry.cards.find((c) => c.id === OPENAI_WHISPER_CARD_ID) as
  | WhisperCard
  | undefined;
if (!card?.regions?.hosts?.default || !Array.isArray(card.languages))
  throw new Error(
    `packages/catalog/api-registry.json has no "${OPENAI_WHISPER_CARD_ID}" card with regions.hosts.default and languages; the adapter reads both from it.`,
  );
const HOST: string = card.regions.hosts.default;
const HEARS: readonly string[] = card.languages;
const DEFAULT_MODEL: string =
  card.defaults?.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

/* A host is interpolated into a URL, so it is held to hostname characters even though it came from
   the contract — the same care the Azure adapter takes with its region. */
const HOSTNAME = /^[a-z0-9.-]{1,253}$/;
/* A model name is a form field; it is letters, digits, dots, hyphens and underscores or it is not
   configured. */
const MODEL_NAME = /^[A-Za-z0-9._-]{1,64}$/;

function credentials(
  env: Record<string, string | undefined>,
): { key: string; model: string } | null {
  const key = (env.OPENAI_API_KEY ?? "").trim();
  const model = (env.OPENAI_TRANSCRIBE_MODEL ?? "").trim() || DEFAULT_MODEL;
  return PLAUSIBLE_BEARER_KEY.test(key) &&
    MODEL_NAME.test(model) &&
    HOSTNAME.test(HOST)
    ? { key, model }
    : null;
}

/* A media type for the multipart part: the token set a media type uses, nothing else, and a fallback
   that is a media type. The route refuses an empty format before this runs. */
const safeMediaType = (value: string): string =>
  value.replace(/[^A-Za-z0-9/+.;=_-]/g, "").slice(0, 128) || "audio/wav";

export function openaiWhisper(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): SpeechSeam {
  const configured: SpeechSeam["configured"] = (direction) =>
    direction === "tts" ? false : credentials(env) !== null;

  const recognize: SpeechSeam["recognize"] = async (request) => {
    const found = credentials(env);
    if (!found) return { ok: false };
    const entry = languageEntry(request.language);
    if (!entry || !HEARS.includes(entry.id)) return { ok: false };
    const locale = localeFor(request.language);
    try {
      /* The documented multipart form. The file name's extension is how the service is told the
         container, so it is derived from the declared format; `language` is the ISO-639-1 id the
         contract gives the language, which is what the reference asks for; and `json` because the
         words are all this seam hands back. */
      const bytes = Buffer.from(request.audioBase64.trim(), "base64");
      const body = new FormData();
      body.set(
        "file",
        new Blob([bytes], { type: safeMediaType(request.audioFormat) }),
        `capture.${audioSubtype(request.audioFormat)}`,
      );
      body.set("model", found.model);
      body.set("language", entry.id);
      body.set("response_format", "json");
      const response = await fetchImpl(
        `https://${HOST}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${found.key}`,
            accept: "application/json",
            "user-agent": "mythuso-assistant",
          },
          body,
          signal: AbortSignal.timeout(STT_TIMEOUT_MS),
        },
      );
      if (!response.ok) return { ok: false };
      const heard = (await response.json()) as { text?: unknown };
      if (typeof heard.text !== "string") return { ok: false };
      /* An empty transcription is silence, not a fault — the same reading Azure's NoMatch gets. */
      return { ok: true, text: heard.text.trim(), language: locale };
    } catch {
      return { ok: false };
    }
  };

  /* Whisper hears; it does not speak. The card serves stt alone, and the answer is the seam's own
     not-ok rather than a call to a door that does not exist. */
  const synthesize: SpeechSeam["synthesize"] = async () => ({ ok: false });

  return { configured, recognize, synthesize };
}
