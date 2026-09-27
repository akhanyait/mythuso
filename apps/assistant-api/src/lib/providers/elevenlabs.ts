import registry from "../../../../../packages/catalog/api-registry.json" with { type: "json" };
import assistant from "../../../../../packages/catalog/assistant.json" with { type: "json" };
import {
  languageEntry,
  localeFor,
  PLAUSIBLE_BEARER_KEY,
  TTS_TIMEOUT_MS,
  type SpeechSeam,
} from "./seam.ts";

/* ElevenLabs — the speaking half only. Built 28 September 2026 on the founder's ask, beside Azure
   Speech and Alibaba Qwen-TTS, and configured nowhere.

   READ THIS FIRST IF YOU ARE THE ONE CONFIGURING IT. The request and the reading below are written
   from ElevenLabs' published API reference for POST /v1/text-to-speech/{voice_id} — the key in the
   xi-api-key header, output_format and optimize_streaming_latency in the query, text, model_id,
   language_code and voice_settings in the body, the audio itself as the response — and were NOT
   exercised against the live API in the change that wrote them. No key existed to try it with, and
   this repository never holds one. The first operator to set ELEVENLABS_API_KEY is the first person
   to see whether the shape is right: read /assistant/health, then one /v1/speak through the panel
   with a register whose provider setting names this card, and if it fails the journal's
   assistant.speak.failed line is the only clue there will be, because this file forwards nothing the
   provider says.

   WHERE THE AUDIO GOES. ElevenLabs serves from the United States by default and offers isolated
   environments in the European Union, India and Singapore to enterprise customers only, each with its
   own account and key, and documents that processing may still happen outside the chosen location.
   Nowhere in South Africa. ELEVENLABS_REGION picks one of the four hosts the card records, and the
   card records regions.southAfricanRegion false with the flow of GilbertOne's spoken answer to it as
   health information; so ../speech.ts refuses to select this adapter in production while
   docs/governance/DATA-RESIDENCY-OPTIONS.md §7 is blank, whether the environment or an administrator's
   setting chose it. That refusal is the selection's; this file is only the adapter beneath it.

   THE VOICES ARE THE ACCOUNT'S, AND ONE OF THEM IS A PERSON'S. ElevenLabs has no fixed public list of
   voices a contract could name: a voice is an identifier in the account's own library, and the
   administrator's own recorded voice (packages/catalog/voice.json#ownVoice) is one of them. So the
   identifiers are lines in the environment — ELEVENLABS_VOICE_FEMALE and ELEVENLABS_VOICE_MALE for the
   contract's two labels, ELEVENLABS_VOICE_OWN for the administrator's own — never in this repository
   and never in a response. The door above still admits only the contract's own voice names; this
   adapter turns the name asked for into its label, the label into the identifier, and answers with
   the name, so nothing that identifies a person's voice leaves this process. The own voice is used
   only when the tuning says so, which tuningFor() says only for a presentation register the own-voice
   setting names — never an emergency, a refusal or an escalation.

   THE LANGUAGES ARE THE MODEL'S. Which model reads is the elevenlabs-model setting; which of the
   contract's languages that model is documented to speak is the card's models entry, read and not
   typed. A language the chosen model does not list is answered voiceUnavailable before any call, so
   the route shows the contract's own notice and the words stay on the screen.

   THE ENVIRONMENT IS THE ONLY SWITCH. Every variable is read on every call, never stored, never
   logged; the key travels in the vendor's own header and nowhere else. enable_logging=false is asked
   for on every request, because the vendor logs by default and a health answer is not a thing to
   leave in somebody else's log; whether the vendor honours it on the plan in use is the residency
   decision's to weigh. FAILURE IS ONE FLAG, NEVER AN EXCEPTION, as with every adapter behind the seam. */

export const ELEVENLABS_CARD_ID = "elevenlabs";

type Card = {
  id: string;
  environment: string[];
  models: Record<string, { languages: string[] }>;
  regions: { hosts: Record<string, string>; selectedBy: string };
};
const card = registry.cards.find((c) => c.id === ELEVENLABS_CARD_ID) as Card | undefined;
if (!card?.regions?.hosts || !card.models)
  throw new Error(
    `packages/catalog/api-registry.json has no "${ELEVENLABS_CARD_ID}" card with regions.hosts and models; the adapter reads both from it.`,
  );
const HOSTS = card.regions.hosts;
const MODELS = card.models;
/* The vendor's own default model, first in the card, for a request that carries no tuning. */
const DEFAULT_MODEL = Object.keys(MODELS)[0]!;
/* Which label reads when none is asked for: the contract's platform default, not a string here. */
const DEFAULT_LABEL = assistant.voice.cloud.defaultVoice as "female" | "male";

/* A host is interpolated into a URL, so it is held to hostname characters even though it came from
   the contract; a voice identifier, a model id and an output format are path or query values, held
   to the token set each uses. */
const HOSTNAME = /^[a-z0-9.-]{1,253}$/;
const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;
const TOKEN = /^[a-z0-9_.-]{2,48}$/;
/* Every format the settings offer is an MP3 stream, so the media type is one value. */
const SPOKEN_AUDIO_MIME = "audio/mpeg";

function credentials(
  env: Record<string, string | undefined>,
): { host: string; key: string } | null {
  const region = (env.ELEVENLABS_REGION ?? "").trim().toLowerCase();
  const host = HOSTS[region];
  const key = (env.ELEVENLABS_API_KEY ?? "").trim();
  return host && HOSTNAME.test(host) && PLAUSIBLE_BEARER_KEY.test(key)
    ? { host, key }
    : null;
}
const voiceIdOf = (value: string | undefined): string | null => {
  const id = (value ?? "").trim();
  return VOICE_ID.test(id) ? id : null;
};
/* The identifier behind each of the contract's two labels, read by name so the build can see which
   lines this adapter reads and hold the card to exactly those. */
const labelledVoice = (env: Record<string, string | undefined>, label: "female" | "male"): string | null =>
  voiceIdOf(label === "female" ? env.ELEVENLABS_VOICE_FEMALE : env.ELEVENLABS_VOICE_MALE);

export function elevenLabsTts(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): SpeechSeam {
  /* Configured means a reading could happen: the key, a region the card names, and at least the
     identifier for the platform's default label. */
  const configured: SpeechSeam["configured"] = (direction) =>
    direction === "stt"
      ? false
      : credentials(env) !== null && labelledVoice(env, DEFAULT_LABEL) !== null;

  const recognize: SpeechSeam["recognize"] = async () => ({ ok: false });

  const synthesize: SpeechSeam["synthesize"] = async (request) => {
    const found = credentials(env);
    /* Not configured is one flag, as for every adapter: a box with no key, no region or no default
       voice never gets as far as asking which language was wanted. */
    if (!found || !configured("tts")) return { ok: false };
    const locale = localeFor(request.language);
    const tuning = request.tuning;
    const model = tuning?.elevenLabs.model ?? DEFAULT_MODEL;
    const spoken = MODELS[model];
    const entry = languageEntry(request.language);
    /* A language the chosen model is not documented to speak, or one the contract carries no voice
       for at all, is answered before any call: the words stay on the screen. */
    if (!spoken || !entry?.ttsAvailable || !entry.ttsVoices || !spoken.languages.includes(entry.id))
      return { ok: false, voiceUnavailable: true, language: locale };
    /* The name asked for is one of the contract's, in this language, or nothing; it becomes a label
       and the label an identifier. A name from another language, or one the contract does not own,
       is refused here as every adapter refuses it. */
    const asked = request.voice?.trim() ?? "";
    const label: "female" | "male" | null =
      !asked ? DEFAULT_LABEL
      : asked === entry.ttsVoices.female ? "female"
      : asked === entry.ttsVoices.male ? "male"
      : null;
    if (!label) return { ok: false };
    const name = entry.ttsVoices[label];
    const own = tuning?.ownVoice ? voiceIdOf(env.ELEVENLABS_VOICE_OWN) : null;
    const voiceId = own ?? labelledVoice(env, label);
    if (!voiceId) return { ok: false, voiceUnavailable: true, language: locale };
    const format = tuning?.elevenLabs.audioQuality ?? "";
    const query = new URLSearchParams({ enable_logging: "false" });
    if (TOKEN.test(format)) query.set("output_format", format);
    if (tuning && Number.isInteger(tuning.elevenLabs.latencyMode)) query.set("optimize_streaming_latency", String(tuning.elevenLabs.latencyMode));
    const body: Record<string, unknown> = { text: request.text, model_id: model };
    /* The vendor documents language enforcement for its Flash and Turbo models; the others are
       handed no code and detect the language themselves. */
    if (/flash|turbo/.test(model)) body.language_code = entry.id;
    /* The knobs that change how the voice sounds travel only for a presentation register: a request
       without them — a clinical register, a request with no tuning at all — is read at the vendor's
       own defaults, whatever the settings say. */
    const knobs = tuning?.presentation?.elevenLabs;
    if (knobs)
      body.voice_settings = {
        stability: knobs.stabilityPercent / 100,
        similarity_boost: knobs.similarityPercent / 100,
        style: knobs.stylePercent / 100,
        use_speaker_boost: knobs.speakerBoost,
        speed: knobs.speedPercent / 100,
      };
    try {
      const response = await fetchImpl(
        `https://${found.host}/v1/text-to-speech/${voiceId}?${query.toString()}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": found.key,
            "content-type": "application/json",
            accept: SPOKEN_AUDIO_MIME,
            "user-agent": "mythuso-assistant",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(tuning?.timeoutMs ?? TTS_TIMEOUT_MS),
        },
      );
      if (!response.ok) return { ok: false };
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) return { ok: false };
      return {
        ok: true,
        audioBase64: bytes.toString("base64"),
        format: SPOKEN_AUDIO_MIME,
        voice: name,
        language: locale,
      };
    } catch {
      return { ok: false };
    }
  };

  return { configured, recognize, synthesize };
}
