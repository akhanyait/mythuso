import assistant from "../../../../../packages/catalog/assistant.json" with { type: "json" };

/* The shape every speech provider fills, and the contract readings they share.

   Written 28 September 2026, when the founder asked for OpenAI Whisper and Alibaba Qwen beside
   Azure Speech. Until then ../speech.ts was the one adapter and held these itself; they moved here so
   a provider file imports the seam without importing the module that selects between providers, and
   nothing in this directory can reach back into the selection. Nothing here opens a socket, reads an
   environment variable or names a host: it is types, the contract's languages, and the two ceilings
   every provider's calls run under.

   ONE SHAPE BACK, WHOEVER ANSWERED. A route above the seam cannot tell which provider it reached and
   must not have to: every provider hands back the same RecognisedSpeech and ReadSpeech, refuses the
   same way ({ ok: false }, never an exception), and says voiceUnavailable for a language it has no
   voice for in the same field Azure does, so the route shows the contract's own notice rather than a
   provider's error whichever one is configured. */

/* One entry of the contract's voice.languages: a language GilbertOne may be written in, the
   recognition locales it is heard in, and — only where the contract says a cloud voice exists for it
   (ttsAvailable) — the two neural voices Azure speaks it in. */
export type CatalogVoice = { female: string; male: string };
export type CatalogLanguage = {
  id: string;
  name: string;
  recognitionLocales: string[];
  ttsAvailable?: boolean;
  ttsVoices?: CatalogVoice;
};

/* Read once from the contract; the values cannot change while the process runs. */
export const CATALOG_LANGUAGES: readonly CatalogLanguage[] =
  (assistant.voice.languages ?? []) as CatalogLanguage[];
export const SPEECH_LOCALE: string = assistant.voice.cloud.recognitionLocale;
/* Every recognition locale the contract names, across all its languages — en-ZA, en-GB, en-US and,
   since the multi-language backend of 23 September 2026, zu-ZA, xh-ZA, af-ZA and st-ZA. */
export const RECOGNITION_LOCALES: readonly string[] = CATALOG_LANGUAGES.flatMap(
  (language) => language.recognitionLocales ?? [],
);

/* How long each call may take, for every provider alike. The capture ceiling is generous because a
   full push-to-talk capture is uploaded and read in one request; the voice's is short because one
   call is one stretch of a sentence, and a caller wanting sound sooner asks for the next stretch
   itself. A provider that answers with a link to its audio rather than the audio spends the same
   ceiling on both requests together. */
export const STT_TIMEOUT_MS = 30 * 1000;
export const TTS_TIMEOUT_MS = 15 * 1000;

/* The two directions a provider may serve. A card in packages/catalog/api-registry.json lists the
   ones it serves; a provider that serves one answers { ok: false } for the other without a call. */
export type SpeechDirection = "stt" | "tts";

/* What a capture was read into, or { ok: false } when it was not read at all. */
export type RecognisedSpeech =
  | { ok: true; text: string; language: string }
  | { ok: false };

/* What was voiced, or { ok: false } when it was not voiced at all. The not-ok reading carries
   voiceUnavailable:true — with the locale that was asked for — when the reason is a language the
   provider has no voice for, so the route can tell that apart from a call that failed and show the
   contract's own voiceUnavailableNotice instead of an error. */
export type ReadSpeech =
  | {
      ok: true;
      audioBase64: string;
      format: string;
      voice: string;
      language: string;
    }
  | { ok: false; voiceUnavailable?: boolean; language?: string };

/* The two doors and the configuration question, as one injectable shape: server.ts holds a seam of
   this type, its own tests hand it a fake, and the production default is the selection ../speech.ts
   makes. configured() with no direction is the cloud voice as a whole — both doors have what they
   need; with a direction it is that door alone, which is what each route asks before it reads a
   body. A single-provider seam answers the same either way. The request shapes are the contract's
   own fields, minus the consent the route checks first. */
export type SpeechSeam = {
  configured(direction?: SpeechDirection): boolean;
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

/* The contract's own language entry a declared language names — by one of its recognition locales
   ("en-ZA", "af-ZA") or by its bare id ("en", "af"), case-insensitively. Undefined for a language the
   contract does not carry, which is how a speaking door tells a language with no cloud voice from one
   with. */
export function languageEntry(language: string): CatalogLanguage | undefined {
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
   spelling; a bare language id ("af", "zu") meets that language's own first recognition locale; and
   every other declaration meets the cloud voice's decided locale. The response echoes this value, not
   the caller's ask, so a caller can tell which locale answered. */
export function localeFor(language: string): string {
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

/* A credential that could be a hosted provider's key: no whitespace, no control character, and a
   length a key has. Added for the same reason ../speech.ts checks the shape of an Azure key: a value
   with a sentence pasted in beside it is not a configured provider, and health must not say it is.
   Shape only; whether the provider accepts the key is settled by the first request. */
export const PLAUSIBLE_BEARER_KEY = /^[\x21-\x7e]{20,256}$/;

/* The media type a capture arrives as, reduced to a token a provider can put in a header or a file
   name: parameters dropped, an x- prefix dropped, and only the characters a subtype uses kept. */
export function audioSubtype(audioFormat: string): string {
  const bare = audioFormat.split(";")[0].trim().toLowerCase();
  const subtype = (bare.includes("/") ? bare.split("/")[1] : bare).replace(
    /^x-/,
    "",
  );
  return subtype.replace(/[^a-z0-9]/g, "").slice(0, 16) || "wav";
}
