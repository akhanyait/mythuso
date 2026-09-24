import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };

/* The cloud voice, added 22 September 2026 with push-to-talk's two built routes.

   WHAT THIS IS. The Azure Speech REST adapter behind POST /assistant/v1/listen and
   POST /assistant/v1/speak: one door in each direction — a capture turned into words, and words
   that already exist turned into sound — and nothing else. It carries no model and writes no
   sentence: every word it speaks came from the catalogue, and every word it hears is handed back
   as a string its caller owns. The routes above it hold the contract's refusals; this file holds
   only the two requests and the two readings.

   THE ENVIRONMENT GATE IS THE ONLY SWITCH. Every call re-reads AZURE_SPEECH_REGION and
   AZURE_SPEECH_KEY from this process's environment: both present means the cloud voice is
   configured, either missing means it is not, the routes answer the contract's
   speech-not-configured refusal and the browser's own voice carries on exactly as before. The
   values are never logged, never returned and never written anywhere; the region is validated as
   a hostname label before it is interpolated into a URL, so a malformed value cannot point a
   request at another host, and the key travels in Azure's own subscription header and nowhere
   else. This module opens no file, writes no recording and touches no filesystem at all: the
   capture lives as bytes in memory for the length of one request, and there is no code path in
   it that could keep one.

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
   still written, only the reading aloud is missing.

   FAILURE IS ONE FLAG, NEVER AN EXCEPTION. Both doors return { ok: false } for every way an
   external call can end badly — an unconfigured process, a refusal, a timeout under the
   AbortSignal ceilings (30 seconds for a capture being read, 15 for one sentence being voiced),
   a transport that hung, a body that is not the JSON Azure promises — so the route above maps
   every one of them to the same non-revealing internal-error sentence, exactly as the turn
   route treats a provider's raw error. Nothing Azure says is forwarded, and nothing about the
   audio or the words is ever logged. */

/* One entry of the contract's voice.languages: a language GilbertOne may be written in, the
   recognition locales Azure hears it in, and — only where the contract says a cloud voice exists
   for it (ttsAvailable) — the two neural voices that speak it. */
type CatalogVoice = { female: string; male: string };
type CatalogLanguage = {
  id: string;
  name: string;
  recognitionLocales: string[];
  ttsAvailable?: boolean;
  ttsVoices?: CatalogVoice;
};

/* Read once from the contract; the values cannot change while the process runs. */
const CATALOG_LANGUAGES: readonly CatalogLanguage[] =
  (assistant.voice.languages ?? []) as CatalogLanguage[];
export const SPEECH_LOCALE: string = assistant.voice.cloud.recognitionLocale;
export const SPEECH_OUTPUT_FORMAT: string = assistant.voice.cloud.outputFormat;
/* The two voices a caller may name explicitly in a speak request, and the ones the route validates
   against. They stay the cloud voice's own en-ZA pair; a language's own voices are resolved from
   the contract per request below, so an Afrikaans answer is spoken in an Afrikaans voice without
   the caller having to name one. */
export const SPEECH_VOICES: readonly string[] = [
  assistant.voice.cloud.voices.female,
  assistant.voice.cloud.voices.male,
];
/* Every recognition locale the contract names, across all its languages — en-ZA, en-GB, en-US and,
   since the multi-language backend of 23 September 2026, zu-ZA, xh-ZA, af-ZA and st-ZA. */
const RECOGNITION_LOCALES: readonly string[] = CATALOG_LANGUAGES.flatMap(
  (language) => language.recognitionLocales ?? [],
);

/* How long each call may take. The capture ceiling is generous because a full push-to-talk
   capture is uploaded and read in one request; the voice's is short because one call is one
   stretch of a sentence, and a caller wanting sound sooner asks for the next stretch itself. */
const STT_TIMEOUT_MS = 30 * 1000;
const TTS_TIMEOUT_MS = 15 * 1000;
/* What the audio comes back as. The contract's outputFormat is the encoder's own name for the
   stream (audio-24khz-48kbitrate-mono-mp3); what a player needs is the media type. */
const SPOKEN_AUDIO_MIME = "audio/mpeg";

/* What a capture was read into, or { ok: false } when it was not read at all. */
export type RecognisedSpeech =
  | { ok: true; text: string; language: string }
  | { ok: false };

/* What was voiced, or { ok: false } when it was not voiced at all. The not-ok reading carries
   voiceUnavailable:true — with the locale that was asked for — when the reason is a language the
   contract has no cloud voice for, so the route can tell that apart from a call that failed and
   show the contract's own voiceUnavailableNotice instead of an error. */
export type ReadSpeech =
  | {
      ok: true;
      audioBase64: string;
      format: string;
      voice: string;
      language: string;
    }
  | { ok: false; voiceUnavailable?: boolean; language?: string };

/* The two doors and the configuration question, as one injectable shape: server.ts holds a seam
   of this type, its own tests hand it a fake, and the production default is cloudSpeech() below.
   The request shapes are the contract's own fields, minus the consent the route checks first. */
export type SpeechSeam = {
  configured(): boolean;
  recognize(request: {
    audioBase64: string;
    language: string;
    audioFormat: string;
  }): Promise<RecognisedSpeech>;
  synthesize(request: {
    text: string;
    language: string;
    voice?: string;
  }): Promise<ReadSpeech>;
};

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
const SPEECH_REGIONS: readonly string[] = ["southafricanorth"];

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

/* The contract's own language entry a declared language names — by one of its recognition locales
   ("en-ZA", "af-ZA") or by its bare id ("en", "af"), case-insensitively. Undefined for a language
   the contract does not carry, which is how synthesize tells a language with no cloud voice from
   one with. */
function languageEntry(language: string): CatalogLanguage | undefined {
  const asked = language.trim().toLowerCase();
  return (
    CATALOG_LANGUAGES.find((entry) =>
      (entry.recognitionLocales ?? []).some(
        (locale) => locale.toLowerCase() === asked,
      ),
    ) ?? CATALOG_LANGUAGES.find((entry) => entry.id.toLowerCase() === asked)
  );
}

/* The locale a call actually hears or speaks in. A declared language that names one of the
   contract's own recognition locales is honoured — case-insensitively, in the contract's own
   spelling; a bare language id ("af", "zu") meets that language's own first recognition locale;
   and every other declaration meets the cloud voice's decided locale. The response echoes this
   value, not the caller's ask, so a caller can tell which locale answered. */
function localeFor(language: string): string {
  const asked = language.trim().toLowerCase();
  const exact = RECOGNITION_LOCALES.find(
    (locale) => locale.toLowerCase() === asked,
  );
  if (exact) return exact;
  const entry = CATALOG_LANGUAGES.find(
    (candidate) => candidate.id.toLowerCase() === asked,
  );
  return entry?.recognitionLocales?.[0] ?? SPEECH_LOCALE;
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

/* The cloud voice, as the seam server.ts holds. fetch and the environment are parameters so the
   tests can hand this its own: one fake fetch to see exactly what would leave, one empty
   environment to prove the unconfigured path refuses before anything is sent. The production
   caller passes nothing and gets the platform's fetch and this process's own environment, read
   fresh on every call. */
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
      const response = await fetchImpl(
        `https://${credentials.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=simple`,
        {
          method: "POST",
          headers: {
            "ocp-apim-subscription-key": credentials.key,
            "content-type": safeFormat(request.audioFormat),
            accept: "application/json",
            "user-agent": "mythuso-assistant",
          },
          body: Buffer.from(request.audioBase64.trim(), "base64"),
          signal: AbortSignal.timeout(STT_TIMEOUT_MS),
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
    /* The route checks the voice against SPEECH_VOICES and answers its own 400 for an unknown
       name; this is the same check once more, widened to the two voices the contract names for THIS
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
    const voice = asked || voices.female;
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
      `<voice name="${voice}">${escapeXml(request.text)}</voice></speak>`;
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
            "x-microsoft-outputformat": SPEECH_OUTPUT_FORMAT,
            "user-agent": "mythuso-assistant",
          },
          body: ssml,
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
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
