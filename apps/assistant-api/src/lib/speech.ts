import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import registry from "../../../../packages/catalog/api-registry.json" with { type: "json" };
import modelProviders from "../../../../packages/catalog/model-providers.json" with { type: "json" };
import { assistantActivation } from "./activation.ts";
import {
  alibabaQwenAsr,
  alibabaQwenTts,
  ALIBABA_QWEN_ASR_CARD_ID,
  ALIBABA_QWEN_TTS_CARD_ID,
} from "./providers/alibaba-qwen.ts";
import {
  openaiWhisper,
  OPENAI_WHISPER_CARD_ID,
} from "./providers/openai-whisper.ts";
import { elevenLabsTts, ELEVENLABS_CARD_ID } from "./providers/elevenlabs.ts";
import {
  captureTuningFor,
  contractDefaults,
  contractVoices,
  monthlyCeiling,
  readingFor,
  voiceLabelFor,
  type PresentationVoiceSource,
  type SpeechSettingsSource,
} from "./speech-settings.ts";
import {
  CATALOG_LANGUAGES,
  languageEntry,
  localeFor,
  SPEECH_LOCALE,
  STT_TIMEOUT_MS,
  TTS_TIMEOUT_MS,
  type SpeechDirection,
  type SpeechSeam,
} from "./providers/seam.ts";

export { SPEECH_LOCALE } from "./providers/seam.ts";
export type {
  ReadSpeech,
  RecognisedSpeech,
  SpeechDirection,
  SpeechSeam,
} from "./providers/seam.ts";

/* The cloud voice, added 22 September 2026 with push-to-talk's two built routes.

   WHAT THIS IS. The Azure Speech REST adapter behind POST /assistant/v1/listen and
   POST /assistant/v1/speak — cloudSpeech() below — and, since 28 September 2026, the selection
   between it and the two providers the founder asked for beside it, OpenAI Whisper and Alibaba
   Qwen, whose adapters live in ./providers. Each is one door in each direction — a capture turned
   into words, and words that already exist turned into sound — and nothing else. It carries no
   model and writes no sentence: every word it speaks came from the catalogue, and every word it
   hears is handed back as a string its caller owns. The routes above hold the contract's refusals;
   this file holds the requests, the readings, and the one decision about which provider answers.

   THE ENVIRONMENT GATE IS THE ONLY SWITCH. Every Azure call re-reads AZURE_SPEECH_REGION and
   AZURE_SPEECH_KEY from this process's environment: both present means the cloud voice is
   configured, either missing means it is not, the routes answer the contract's
   speech-not-configured refusal and the browser's own voice carries on exactly as before. The
   values are never logged, never returned and never written anywhere; the region is validated as
   a hostname label before it is interpolated into a URL, so a malformed value cannot point a
   request at another host, and the key travels in Azure's own subscription header and nowhere
   else. This module opens no file, writes no recording and touches no filesystem at all: the
   capture lives as bytes in memory for the length of one request, and there is no code path in
   it that could keep one.

   WHICH PROVIDER ANSWERS IS A LINE IN THE CONTRACT, READ ONCE AT START. api-registry.json's
   speechSelection names two variables — MYTHUSO_STT_PROVIDER and MYTHUSO_TTS_PROVIDER — whose
   values are card ids, and a default, azure-speech, the one speech provider with a South African
   region. selectedSpeech() reads both when the server is built and composes one seam: hearing
   through the stt card's adapter, speaking through the tts card's, and configured() per direction
   so a route asks about its own door. A value naming no built speech card that serves that
   direction is a misconfiguration the service refuses to start on, naming the cards it could have
   been, exactly as the activation gate refuses on a missing acknowledgement.

   AN OFFSHORE PROVIDER IS REFUSED IN PRODUCTION WHILE THE RESIDENCY DECISION IS BLANK. A patient's
   capture and GilbertOne's spoken answer are health information (api-registry.json dataFlows).
   Whisper processes in the United States and DashScope in Singapore or Beijing; each card records
   regions.southAfricanRegion false. docs/governance/DATA-RESIDENCY-OPTIONS.md §7 — the decision
   the responsible party and the Information Officer sign — has no option chosen, which
   model-providers.json's residencyToday.decided mirrors and the build holds equal to the document.
   So in production (NODE_ENV production, or the acknowledgement line present) a selection of such a
   card is refused at start-up in the registry's own words, and the direction falls back to the
   default: Azure where it is configured, the speech-not-configured refusal where it is not. Never
   the offshore provider, and never quietly. There is deliberately no variable that overrides this:
   the document's first section says who decides, and it is not whoever holds root on the box. In
   development the selection is honoured, which is how the adapters are exercised at all.

   THE LOCALE AND THE VOICES ARE DECISIONS ON FILE. The recognition locale, the output format and
   the founder's two en-ZA voices are read from packages/catalog/assistant.json's voice.cloud,
   never typed here, so which voice reads a health answer in South Africa stays a line the
   accountable people can read rather than a string in code, and every language's own recognition
   locales and neural voices are read from its voice.languages. A caller's declared language is
   honoured when it names one of the contract's own recognition locales — en-ZA, en-GB, en-US and,
   since the multi-language backend of 23 September 2026, zu-ZA, xh-ZA, af-ZA and st-ZA — or a bare
   language id, which meets that language's own first locale; anything else meets the cloud voice's
   decided locale, en-ZA. Only some of those languages have a voice that speaks them: voice.languages
   marks each one ttsAvailable, and a language with no neural voice is answered without any Azure
   call so the route can show the contract's voiceUnavailableNotice rather than fail — the words are
   still written, only the reading aloud is missing. Another provider's voices are its card's, in
   api-registry.json, and SPEECH_VOICE_NAMES below is every name from both places: what the route's
   door admits.

   FAILURE IS ONE FLAG, NEVER AN EXCEPTION. Both doors return { ok: false } for every way an
   external call can end badly — an unconfigured process, a refusal, a timeout under the
   AbortSignal ceilings (30 seconds for a capture being read, 15 for one sentence being voiced),
   a transport that hung, a body that is not the JSON Azure promises — so the route above maps
   every one of them to the same non-revealing internal-error sentence, exactly as the turn
   route treats a provider's raw error. Nothing Azure says is forwarded, and nothing about the
   audio or the words is ever logged. */

export const SPEECH_OUTPUT_FORMAT: string = assistant.voice.cloud.outputFormat;
/* The two voices a caller may name explicitly in a speak request, and the ones the route validates
   against. They stay the cloud voice's own en-ZA pair; a language's own voices are resolved from
   the contract per request below, so an Afrikaans answer is spoken in an Afrikaans voice without
   the caller having to name one. */
export const SPEECH_VOICES: readonly string[] = [
  assistant.voice.cloud.voices.female,
  assistant.voice.cloud.voices.male,
];
/* Which of the two labels reads when nothing has chosen one — the contract's own line, not the first
   entry above. Since 28 September 2026 a presentation register may be handed the other label by the
   founder's setting in force; a clinical-delivery register is always read in this one. */
const DEFAULT_LABEL = assistant.voice.cloud.defaultVoice as "female" | "male";

/* The registry's speech cards, as this file reads them: which directions each serves, whether it
   has a South African region, its residency tier, and — for a speaking provider other than Azure —
   the voices its card names per language. */
type SpeechCard = {
  id: string;
  category: string;
  buildStatus: string;
  serves?: string[];
  regions?: { southAfricanRegion?: boolean };
  residency?: { tier: string | null };
  voices?: Record<string, { default: string; names: string[] }>;
};
const BUILT_SPEECH_CARDS: readonly SpeechCard[] = (
  registry.cards as SpeechCard[]
).filter((card) => card.category === "speech" && card.buildStatus === "built");

/* Every voice name the contract owns, across every language that has one — the en-ZA pair above
   and, since the web started naming a language's own voice on 24 September 2026, the af-ZA pair —
   and, since 28 September, every voice a built speech card in api-registry.json names. This is what
   the route's door validates against. It validated against SPEECH_VOICES alone until 27 September,
   so a request naming af-ZA-AdriNeural — exactly what the patient panel sends for an Afrikaans
   answer — was refused with 400 before the language-aware check below could see it, and every
   Afrikaans reply was quietly read by the browser's voice instead. Each adapter still holds a name
   to the language it was asked with. */
export const SPEECH_VOICE_NAMES: readonly string[] = [
  ...new Set([
    ...SPEECH_VOICES,
    ...CATALOG_LANGUAGES.flatMap((language) =>
      language.ttsAvailable && language.ttsVoices
        ? [language.ttsVoices.female, language.ttsVoices.male]
        : [],
    ),
    ...BUILT_SPEECH_CARDS.flatMap((card) =>
      Object.values(card.voices ?? {}).flatMap((entry) => entry.names),
    ),
  ]),
];

/* What the audio comes back as. The contract's outputFormat is the encoder's own name for the
   stream (audio-24khz-48kbitrate-mono-mp3); what a player needs is the media type. */
const SPOKEN_AUDIO_MIME = "audio/mpeg";

/* The region and the key, read the way every credential in this service is read: by name, at the
   moment it is needed, and never stored. Both are required — a key with no region has nowhere to
   go. Lowercased because Azure's region names are, and an operator who typed "SouthAfricaNorth"
   has still configured it.

   PINNED TO SOUTH AFRICA, 24 September 2026. The region used to be any plausible hostname label,
   so a key created in westeurope sent a South African patient's voice to Europe — a cross-border
   transfer POPIA s72 governs, of speech that may carry health information. The Watchful DPIA
   (docs/scope/02, §4 and §8) names southafricanorth for cloud speech. Any other region is treated
   exactly as no region: the cloud voice is not configured and the route answers as it does on a
   box with no key, rather than sending the audio somewhere the DPIA did not assess. */
export const SPEECH_REGIONS: readonly string[] = ["southafricanorth"];

/* A key that could be an Azure Speech key: letters and digits only, 32 characters (the older hex
   form) up to 84 and a little beyond (the current form), and never a space. Added 24 September 2026,
   when production's key turned out to be 140 characters with spaces in it — something pasted in
   with it — while /assistant/health said `speech:true` because a value was present. Every request
   it made failed, and the panel asked it on every reply. A key that cannot be a key is now "not
   configured", so health says so and the panel does not ask. This checks shape only; whether Azure
   accepts the key is still settled by the first request. */
const PLAUSIBLE_SPEECH_KEY = /^[A-Za-z0-9]{32,128}$/;

function cloudCredentials(
  env: Record<string, string | undefined>,
): { region: string; key: string } | null {
  const region = (env.AZURE_SPEECH_REGION ?? "").trim().toLowerCase();
  const key = (env.AZURE_SPEECH_KEY ?? "").trim();
  return PLAUSIBLE_SPEECH_KEY.test(key) && SPEECH_REGIONS.includes(region)
    ? { region, key }
    : null;
}

/* SSML is XML, so the words are escaped before they are placed inside it: an ampersand or an
   angle bracket in an answer is a character in that answer, never markup. */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/* A declared audio format is a header value, and a header value carries no controls: everything
   outside the token set a media type uses is stripped before it is sent. The routes refuse an
   empty format before this runs; the fallback is for shape, not for policy. */
const safeFormat = (value: string): string =>
  value.replace(/[^A-Za-z0-9/+.;=_-]/g, "").slice(0, 128) ||
  "application/octet-stream";
/* Azure's three words for strong language in a transcript, the values of the
   azure-recognition-profanity setting; anything else sends no parameter. */
const PROFANITY: readonly string[] = ["raw", "masked", "removed"];
/* An Azure output-format name is one token of its own alphabet; a setting value is held to it
   before it becomes a header. */
const OUTPUT_FORMAT = /^[a-z0-9-]{8,64}$/;
/* A speed or pitch setting is a whole percentage of normal; Azure wants the difference, signed. */
const prosodyPercent = (percent: number): string | null =>
  Number.isInteger(percent) && percent > 0 && percent < 1000 ? `${percent >= 100 ? "+" : ""}${percent - 100}%` : null;

/* The Azure cloud voice, as a seam. fetch and the environment are parameters so the tests can hand
   this its own: one fake fetch to see exactly what would leave, one empty environment to prove the
   unconfigured path refuses before anything is sent. The production caller passes nothing and gets
   the platform's fetch and this process's own environment, read fresh on every call. It is the
   default in both directions; selectedSpeech() below is what server.ts holds. */
export function cloudSpeech(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): SpeechSeam {
  const configured = (): boolean => cloudCredentials(env) !== null;

  const recognize: SpeechSeam["recognize"] = async (request) => {
    const credentials = cloudCredentials(env);
    if (!credentials) return { ok: false };
    const locale = localeFor(request.language);
    try {
      /* Azure's one-shot recognition: the audio in the body, the locale in the query, "simple"
         so the answer is the words rather than a lattice of alternatives this service would
         have to pick from — and it picks nothing. */
      /* Since 28 September 2026 the administrator's settings say how strong language is handed
         back — raw, masked or removed, Azure's own three words — and how long the call may take;
         a request with no tuning is heard exactly as before. */
      const profanity = request.tuning?.profanity ?? "";
      const query = `language=${encodeURIComponent(locale)}&format=simple${PROFANITY.includes(profanity) ? `&profanity=${profanity}` : ""}`;
      const response = await fetchImpl(
        `https://${credentials.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${query}`,
        {
          method: "POST",
          headers: {
            "ocp-apim-subscription-key": credentials.key,
            "content-type": safeFormat(request.audioFormat),
            accept: "application/json",
            "user-agent": "mythuso-assistant",
          },
          body: Buffer.from(request.audioBase64.trim(), "base64"),
          signal: AbortSignal.timeout(request.tuning?.timeoutMs ?? STT_TIMEOUT_MS),
        },
      );
      if (!response.ok) return { ok: false };
      const heard = (await response.json()) as {
        RecognitionStatus?: unknown;
        DisplayText?: unknown;
      };
      /* NoMatch is silence, not a fault: a tap that caught no words is answered with no words,
         and the caller shows what that means. Every other status — an error, a shape this file
         does not know — is one failure, above. */
      if (heard.RecognitionStatus === "NoMatch") {
        return { ok: true, text: "", language: locale };
      }
      if (heard.RecognitionStatus !== "Success") return { ok: false };
      return {
        ok: true,
        text:
          typeof heard.DisplayText === "string" ? heard.DisplayText.trim() : "",
        language: locale,
      };
    } catch {
      return { ok: false };
    }
  };

  const synthesize: SpeechSeam["synthesize"] = async (request) => {
    const credentials = cloudCredentials(env);
    if (!credentials) return { ok: false };
    const locale = localeFor(request.language);
    /* The contract names a cloud voice for some languages and not others: voice.languages marks
       each one ttsAvailable. A language with no neural voice — isiZulu, isiXhosa, Sesotho, and the
       further South African languages Azure has no voice for — is answered here, before any Azure
       call, so nothing is spent synthesising a language that cannot be spoken and the route above
       can say so plainly (voiceUnavailable) rather than fail. The words stay on the screen either
       way; only the reading aloud is missing. */
    const entry = languageEntry(request.language);
    const voices = entry?.ttsAvailable ? entry.ttsVoices : undefined;
    if (!voices) return { ok: false, voiceUnavailable: true, language: locale };
    /* The route checks the voice against SPEECH_VOICE_NAMES and answers its own 400 for an unknown
       name; this is the same check once more, narrowed to the two voices the contract names for THIS
       language, because a door that would place a caller's string inside SSML must be sure the
       string is one the contract owns. With no voice asked for, the language's own female voice
       speaks — an Afrikaans answer in af-ZA-AdriNeural, an English one in the contract's default. */
    const asked = request.voice?.trim() ?? "";
    if (
      asked &&
      !SPEECH_VOICES.includes(asked) &&
      asked !== voices.female &&
      asked !== voices.male
    )
      return { ok: false };
    const voice = asked || voices[request.voiceLabel ?? DEFAULT_LABEL];
    /* Speed and pitch travel as SSML prosody only for a presentation register — tuningFor() hands a
       clinical register none — and only away from a hundred, so the default changes nothing about
       what is sent. The encoding reaches every register: it changes what a phone downloads, not how
       the words sound. Both values were admitted by the settings rules before they got here and are
       held to their shapes once more, because a value placed inside SSML or a header must be sure. */
    const knobs = request.tuning?.presentation?.azure;
    const rate = knobs && knobs.speedPercent !== 100 ? prosodyPercent(knobs.speedPercent) : null;
    const pitch = knobs && knobs.pitchPercent !== 100 ? prosodyPercent(knobs.pitchPercent) : null;
    const prosody = rate || pitch ? `<prosody${rate ? ` rate="${rate}"` : ""}${pitch ? ` pitch="${pitch}"` : ""}>` : "";
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
      `<voice name="${voice}">${prosody}${escapeXml(request.text)}${prosody ? "</prosody>" : ""}</voice></speak>`;
    const asked_format = request.tuning?.azureAudioQuality ?? "";
    const outputFormat = OUTPUT_FORMAT.test(asked_format) ? asked_format : SPEECH_OUTPUT_FORMAT;
    try {
      /* The voice endpoint, with the output format the contract decided. One call is one stretch
         of speech: the caller that wants sound before the last sentence of an answer is voiced
         asks for the next stretch itself, which is what makes the reading stream sentence by
         sentence without anything here holding a queue. */
      const response = await fetchImpl(
        `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "ocp-apim-subscription-key": credentials.key,
            "content-type": "application/ssml+xml",
            "x-microsoft-outputformat": outputFormat,
            "user-agent": "mythuso-assistant",
          },
          body: ssml,
          signal: AbortSignal.timeout(request.tuning?.timeoutMs ?? TTS_TIMEOUT_MS),
        },
      );
      if (!response.ok) return { ok: false };
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) return { ok: false };
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

/* ---- The selection, 28 September 2026 --------------------------------------------------------- */

export const AZURE_SPEECH_CARD_ID = "azure-speech";
/* The two variables and the default, read from the registry so the names live in one place. */
export const SPEECH_SELECTION = registry.speechSelection as {
  stt: string;
  tts: string;
  default: string;
};
/* The refusal the production gate speaks in: the registry's own statement, read and not typed. A
   registry without it is a build without the gate's words, and the throw says so at import. */
export const OFFSHORE_SPEECH_REFUSAL_ID =
  "no-offshore-speech-for-health-information-without-a-residency-decision";
const TIER_3_REFUSAL_ID = "no-health-information-to-a-tier-3-provider";
const refusalStatement = (id: string): string => {
  const found = registry.refusals.find((refusal) => refusal.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/api-registry.json has no "${id}" refusal; the speech selection refuses in its words.`,
    );
  return found.statement;
};
const OFFSHORE_STATEMENT = refusalStatement(OFFSHORE_SPEECH_REFUSAL_ID);
const TIER_3_STATEMENT = refusalStatement(TIER_3_REFUSAL_ID);

/* Every built speech card's adapter, by the card's id. A card the registry records as built with
   no entry here is a card this file cannot select — the build holds the two lists equal. */
type Adapter = (
  fetchImpl?: typeof fetch,
  env?: Record<string, string | undefined>,
) => SpeechSeam;
const ADAPTERS: Record<string, Adapter> = {
  [AZURE_SPEECH_CARD_ID]: cloudSpeech,
  [OPENAI_WHISPER_CARD_ID]: openaiWhisper,
  [ALIBABA_QWEN_ASR_CARD_ID]: alibabaQwenAsr,
  [ALIBABA_QWEN_TTS_CARD_ID]: alibabaQwenTts,
  [ELEVENLABS_CARD_ID]: elevenLabsTts,
};

export type SpeechSelection = {
  /* Per direction: the card the environment asked for (or the default), and the card that will
     actually answer — the same unless the ask was refused. */
  stt: { asked: string; card: string };
  tts: { asked: string; card: string };
  /* Since 28 September 2026 an administrator's setting may name a built speaking card for a
     presentation register (packages/catalog/voice.json). These are the speaking cards that may answer
     such a setting on this box: every built one in development, and in production only those the
     residency rule below admits. A card outside the list falls back to the default, and the refusal
     is printed once at start-up in `refused`, so nobody believes a setting sent a voice offshore. */
  admittedTts: string[];
  /* A value naming no built speech card for its direction. The service does not start on this. */
  fatal: string | null;
  /* The production refusals, one sentence each, printed once at start-up. The service starts, on
     the default. */
  refused: string[];
};

/* Which card answers each direction, decided from the environment once. Production is NODE_ENV
   production or the acknowledgement line — either is a box that answers the public — and the
   residency decision is model-providers.json's residencyToday.decided, which the build holds equal
   to §7's "Option chosen" row. */
export function speechSelection(
  env: Record<string, string | undefined> = process.env,
): SpeechSelection {
  const activation = assistantActivation(env);
  const production = activation.production || activation.acknowledged;
  const decided = modelProviders.residencyToday.decided === true;
  const fatal: string[] = [];
  const refused: string[] = [];
  const pick = (direction: SpeechDirection): { asked: string; card: string } => {
    const variable = SPEECH_SELECTION[direction];
    const asked = (env[variable] ?? "").trim() || SPEECH_SELECTION.default;
    const serving = BUILT_SPEECH_CARDS.filter((card) =>
      (card.serves ?? []).includes(direction),
    );
    const card = serving.find((candidate) => candidate.id === asked);
    if (!card || !ADAPTERS[card.id]) {
      fatal.push(
        `Refusing to start: ${variable}=${asked} names no built speech provider that can ${direction === "stt" ? "listen" : "speak"}. It is one of ${serving.map((c) => c.id).join(", ")}, or unset for ${SPEECH_SELECTION.default}. Fix the line in this service's environment and start again.`,
      );
      return { asked, card: SPEECH_SELECTION.default };
    }
    const offshore = card.regions?.southAfricanRegion === false;
    const tier = card.residency?.tier ?? null;
    const fallback = `${SPEECH_SELECTION.default} ${direction === "stt" ? "listens" : "speaks"} instead, or the speech-not-configured refusal answers where it too is not configured.`;
    if (production && offshore && (!decided || tier === null)) {
      refused.push(
        `${variable}=${asked} is refused in production: ${OFFSHORE_STATEMENT} ${fallback}`,
      );
      return { asked, card: SPEECH_SELECTION.default };
    }
    if (production && tier === "contractual") {
      refused.push(
        `${variable}=${asked} is refused in production: ${TIER_3_STATEMENT} ${fallback}`,
      );
      return { asked, card: SPEECH_SELECTION.default };
    }
    return { asked, card: card.id };
  };
  const stt = pick("stt");
  const tts = pick("tts");
  /* Which speaking cards a register's setting may reach: the same residency rule as pick(), asked of
     every built speaking card rather than the one the environment named. */
  const admittedTts: string[] = [];
  const refusedForSettings: string[] = [];
  for (const card of BUILT_SPEECH_CARDS.filter((c) => (c.serves ?? []).includes("tts") && ADAPTERS[c.id])) {
    const offshore = card.regions?.southAfricanRegion === false;
    const tier = card.residency?.tier ?? null;
    if ((production && offshore && (!decided || tier === null)) || (production && tier === "contractual"))
      refusedForSettings.push(card.id);
    else admittedTts.push(card.id);
  }
  if (refusedForSettings.length)
    refused.push(
      `A presentation register's provider setting naming ${refusedForSettings.join(" or ")} is refused in production: ${OFFSHORE_STATEMENT} ${SPEECH_SELECTION.default} speaks for that register instead.`,
    );
  return { stt, tts, admittedTts, fatal: fatal[0] ?? null, refused };
}

/* The seam server.ts holds. Hearing is one provider, composed from the selection above. Speaking,
   since 28 September 2026, is decided per request from the administrator's settings: the register
   the request names is read through the card the settings name for it, with the tuning
   packages/engines/src/assistant/domain/settings.ts's tuningFor() decided — a presentation register
   gets its provider and every knob, a clinical register or no register gets the environment's own
   selection with the delivery mechanics alone — and a card the settings name that is not admitted on
   this box, or not configured, or that does not answer, falls back to the environment's selection
   when the fallback setting says so and to { ok: false } when it does not. The monthly ceiling is
   asked before any provider is, and counted after one answered. With nothing selected and nothing
   changed, this is Azure in both directions and behaves exactly as cloudSpeech() alone did.
   configured() with no direction is both doors — the health route's one boolean — and with a
   direction it is that door alone, which is what each route asks before it reads a body. */
export function selectedSpeech(
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
  settings: SpeechSettingsSource = contractDefaults,
  now: () => number = Date.now,
  /* Since 28 September 2026: the credential view each adapter reads through — the provider vault's
     envFor(card), which puts the vault's value before the environment and blanks a disabled card's
     variables — and the presentation voice in force per register, from the founder's settings history.
     A caller passing neither gets the environment and the contract's default label, exactly as before. */
  envFor: (card: string) => Record<string, string | undefined> = () => env,
  voices: PresentationVoiceSource = contractVoices,
): SpeechSeam {
  const selection = speechSelection(env);
  const stt = ADAPTERS[selection.stt.card](fetchImpl, envFor(selection.stt.card));
  const tts = ADAPTERS[selection.tts.card](fetchImpl, envFor(selection.tts.card));
  const speakers = new Map(selection.admittedTts.map((id) => [id, id === selection.tts.card ? tts : ADAPTERS[id](fetchImpl, envFor(id))]));
  const ceiling = monthlyCeiling(settings);
  return {
    configured: (direction) =>
      direction === "stt"
        ? stt.configured("stt")
        : direction === "tts"
          ? tts.configured("tts")
          : stt.configured("stt") && tts.configured("tts"),
    recognize: (request) => stt.recognize({ ...request, tuning: request.tuning ?? captureTuningFor(settings) }),
    synthesize: async (request) => {
      const reading = readingFor(settings, request.register ?? null);
      const chosen = reading.provider ? speakers.get(reading.provider) : undefined;
      const door = chosen?.configured("tts") ? chosen : reading.fallbackToDefault ? tts : null;
      if (!door) return { ok: false };
      const moment = now();
      if (!ceiling.admits(request.text.length, moment)) return { ok: false, ceilingReached: true };
      /* The founder's presentation voice reaches a reading only when the caller named no voice and the
         register is a presentation one: voiceLabelFor() answers undefined for every other register, so
         an emergency answer is read in the platform's default label whatever the history says. */
      const voiceLabel = request.voice ? undefined : voiceLabelFor(voices, request.register ?? null);
      const read = await door.synthesize({ ...request, voiceLabel, tuning: request.tuning ?? reading.tuning });
      /* A chosen provider that did not answer — a fault, a timeout — is the default's turn, once,
         when the fallback setting says so; a language it has no voice for is not a fault, and is
         answered as such rather than read by another provider in another voice. */
      const final = !read.ok && !read.voiceUnavailable && door !== tts && reading.fallbackToDefault
        ? await tts.synthesize({ ...request, voiceLabel, tuning: request.tuning ?? reading.tuning })
        : read;
      if (final.ok) ceiling.count(request.text.length, moment);
      return final;
    },
  };
}
