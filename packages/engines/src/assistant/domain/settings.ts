/* The assistant's settings, over the shared settings shape: which of a language's two voices reads each of the
 * four presentation registers in packages/catalog/voice.json — routine answers, navigation, what a signed-out
 * visitor hears and what an administrator hears.
 *
 * The founder decided on 27 September 2026 that the presentation registers are an admin setting, with the
 * language's female voice as the default. The clinical-delivery classes — emergency, refusal, escalation — and
 * clinical assist have no setting here, and no change to this file can give them one: voice.json pins the
 * clinical register by hash, and scripts/check-boundaries.mjs fails the build if the pin moves without a
 * ratified Clinician Review Queue entry. Every rule a change obeys is packages/engines/src/settings/shape.ts's;
 * the assistant has no rule between its four settings, so it adds none.
 *
 * WHAT A VALUE IS, AND WHAT A CHANGE REACHES. A value is a label, "female" or "male", never a voice name: whoever
 * speaks — the web panel's cloud voice, the phones' own synthesisers — resolves it per language against
 * packages/catalog/assistant.json#voice.languages[].ttsVoices when the next answer of that register is read. A
 * language with no voice stays text, whatever the label says. Nothing already being read asks again, and an
 * emergency, refusal or escalation answer never asks at all, because no setting here names its class.
 *
 * WHERE THE RUNTIME IS. GilbertOne's answering runtime is apps/assistant-api, not packages/engines. What lives
 * here is the settings history and the arithmetic that reads it, on the engine runtime with every other
 * engine's, so the Configuration screen changes the four in one place; packages/engines/src/assistant/engine.ts
 * says what the service does and does not read from it.
 *
 * THE SPEECH SETTINGS, 28 September 2026. The founder approved the speech-settings scope that day: which built
 * text-to-speech provider reads each presentation register, whether the platform default reads when it does not,
 * two ceilings in characters, Azure Speech's speed, pitch, encoding and profanity handling, the two call timeouts,
 * ElevenLabs' model, stability, similarity, style, speaker boost, speed, encoding and latency mode, and the
 * administrator's own voice. speechSettingsOf() below reads every one of them out of a snapshot into one typed
 * value, and it is the only place their keys are named: apps/web/src/lib/settings.ts hands it the tab's history,
 * apps/assistant-api/src/lib/speech-settings.ts hands it the service's, and scripts/check-boundaries.mjs holds
 * SPEECH_KEYS equal to the contract's items so a setting added there without a reader here fails the build.
 *
 * WHICH REGISTER A VALUE REACHES IS DECIDED HERE TOO. tuningFor() answers a register's provider and tuning: a
 * presentation class gets the setting's provider and every knob; a class in any other zone — the clinical-delivery
 * register, clinical assist — gets the platform default with no tuning at all, whatever the settings say, because
 * how an emergency answer sounds is part of what it says (voice.json's no-provider-setting-on-a-clinical-register).
 * The service and the preview both ask this one function, so neither can apply a knob the other refuses.
 */
import voice from '../../../../catalog/voice.json' with { type: 'json' };
import { snapshotOf, type Change, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const assistantBlock = { engine: 'assistant', ...voice.settings } as unknown as SettingsBlock;
export const assistantSettings: SettingsEngine = Object.freeze({ block: assistantBlock });

export type PresentationClass = 'routine' | 'navigation' | 'signed-out-visitor' | 'admin';
export type VoiceLabel = 'female' | 'male';
export type PresentationVoiceInForce = {
 readonly settingsVersion: number;
 readonly byClass: Readonly<Record<PresentationClass, VoiceLabel>>;
};

/* Which setting reads which class is voice.json's to say: each class in the presentation zone names its setting,
   so a fifth presentation class added there arrives here with its setting and nothing in this file is edited. */
const presentationClasses = (voice.queryClasses as readonly { readonly id: string; readonly zone: string; readonly setting?: string }[])
 .filter(c => c.zone === 'presentation' && typeof c.setting === 'string') as readonly { readonly id: PresentationClass; readonly setting: string }[];

export function presentationVoiceOf(snapshot: Snapshot): PresentationVoiceInForce {
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  byClass: Object.freeze(Object.fromEntries(presentationClasses.map(c => [c.id, snapshot.values[c.setting] as VoiceLabel])) as Record<PresentationClass, VoiceLabel>)
 });
}
export const presentationVoiceInForce = (history: readonly Change[]): PresentationVoiceInForce => presentationVoiceOf(snapshotOf(assistantBlock, history));
/** The settings nobody has changed: for a test, or a history with nothing in it yet. */
export const presentationVoiceByDefault: PresentationVoiceInForce = presentationVoiceInForce([]);

/* ---- The speech settings, 28 September 2026 ---------------------------------------------------- */

export const SPEECH_KEYS = Object.freeze({
 providerByClass: Object.freeze({
  routine: 'presentation-provider-routine',
  navigation: 'presentation-provider-navigation',
  'signed-out-visitor': 'presentation-provider-signed-out-visitor',
  admin: 'presentation-provider-admin'
 } as Record<PresentationClass, string>),
 fallback: 'speech-fallback-to-default-provider',
 monthlyCeiling: 'spoken-answer-monthly-ceiling-characters',
 previewCeiling: 'preview-session-ceiling-characters',
 azureSpeed: 'azure-presentation-speed-percent',
 azurePitch: 'azure-presentation-pitch-percent',
 azureQuality: 'azure-audio-quality',
 azureProfanity: 'azure-recognition-profanity',
 stretchTimeout: 'speech-stretch-timeout-seconds',
 captureTimeout: 'speech-capture-timeout-seconds',
 elevenLabsModel: 'elevenlabs-model',
 elevenLabsStability: 'elevenlabs-stability-percent',
 elevenLabsSimilarity: 'elevenlabs-similarity-percent',
 elevenLabsStyle: 'elevenlabs-style-percent',
 elevenLabsSpeakerBoost: 'elevenlabs-speaker-boost',
 elevenLabsSpeed: 'elevenlabs-speed-percent',
 elevenLabsQuality: 'elevenlabs-audio-quality',
 elevenLabsLatency: 'elevenlabs-latency-mode',
 ownVoice: 'own-voice'
});
/** Every setting key the speech reader below names, flat, for the build to hold against the contract. */
export const SPEECH_SETTING_KEYS: readonly string[] = Object.freeze([
 ...Object.values(SPEECH_KEYS.providerByClass),
 ...Object.entries(SPEECH_KEYS).filter(([k]) => k !== 'providerByClass').map(([, v]) => v as string)
]);

export type OwnVoiceChoice = 'off' | 'admin-register' | 'every-presentation-register';
export type SpeechSettingsInForce = {
 readonly settingsVersion: number;
 /** The card id of the provider that reads each presentation register. */
 readonly providerByClass: Readonly<Record<PresentationClass, string>>;
 readonly fallbackToDefault: boolean;
 readonly monthlyCeilingCharacters: number;
 readonly previewCeilingCharacters: number;
 readonly stretchTimeoutSeconds: number;
 readonly captureTimeoutSeconds: number;
 readonly azure: { readonly speedPercent: number; readonly pitchPercent: number; readonly audioQuality: string; readonly profanity: string };
 readonly elevenLabs: {
  readonly model: string; readonly stabilityPercent: number; readonly similarityPercent: number; readonly stylePercent: number;
  readonly speakerBoost: boolean; readonly speedPercent: number; readonly audioQuality: string; readonly latencyMode: number;
 };
 readonly ownVoice: OwnVoiceChoice;
};

const num = (snapshot: Snapshot, key: string): number => snapshot.values[key] as number;
const str = (snapshot: Snapshot, key: string): string => snapshot.values[key] as string;
const bool = (snapshot: Snapshot, key: string): boolean => snapshot.values[key] as boolean;

export function speechSettingsOf(snapshot: Snapshot): SpeechSettingsInForce {
 const k = SPEECH_KEYS;
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  providerByClass: Object.freeze(Object.fromEntries(Object.entries(k.providerByClass).map(([c, key]) => [c, str(snapshot, key)])) as Record<PresentationClass, string>),
  fallbackToDefault: bool(snapshot, k.fallback),
  monthlyCeilingCharacters: num(snapshot, k.monthlyCeiling),
  previewCeilingCharacters: num(snapshot, k.previewCeiling),
  stretchTimeoutSeconds: num(snapshot, k.stretchTimeout),
  captureTimeoutSeconds: num(snapshot, k.captureTimeout),
  azure: Object.freeze({ speedPercent: num(snapshot, k.azureSpeed), pitchPercent: num(snapshot, k.azurePitch), audioQuality: str(snapshot, k.azureQuality), profanity: str(snapshot, k.azureProfanity) }),
  elevenLabs: Object.freeze({
   model: str(snapshot, k.elevenLabsModel), stabilityPercent: num(snapshot, k.elevenLabsStability), similarityPercent: num(snapshot, k.elevenLabsSimilarity),
   stylePercent: num(snapshot, k.elevenLabsStyle), speakerBoost: bool(snapshot, k.elevenLabsSpeakerBoost), speedPercent: num(snapshot, k.elevenLabsSpeed),
   audioQuality: str(snapshot, k.elevenLabsQuality), latencyMode: num(snapshot, k.elevenLabsLatency)
  }),
  ownVoice: str(snapshot, k.ownVoice) as OwnVoiceChoice
 });
}
export const speechSettingsInForce = (history: readonly Change[]): SpeechSettingsInForce => speechSettingsOf(snapshotOf(assistantBlock, history));
/** The settings nobody has changed: the contract's defaults, which is what the service reads until it keeps a history. */
export const speechSettingsByDefault: SpeechSettingsInForce = speechSettingsInForce([]);

/* ---- What one register is read with ------------------------------------------------------------ */

/** The knobs a provider is handed for one reading. The delivery mechanics — the timeout, each provider's encoding,
    ElevenLabs' model and latency mode — reach every register, because they change how much data a phone downloads
    and which provider model answers, not how the words sound. The presentation knobs — speed, pitch, ElevenLabs'
    voice settings, the own voice — are present for a presentation register and absent for every other, and a
    provider that is handed none sends the vendor's own defaults. */
export type SpeechTuning = {
 readonly timeoutMs: number;
 readonly azureAudioQuality: string;
 readonly elevenLabs: { readonly model: string; readonly audioQuality: string; readonly latencyMode: number };
 readonly presentation?: {
  readonly azure: { readonly speedPercent: number; readonly pitchPercent: number };
  readonly elevenLabs: { readonly stabilityPercent: number; readonly similarityPercent: number; readonly stylePercent: number; readonly speakerBoost: boolean; readonly speedPercent: number };
 };
 /** Whether the administrator's own recorded voice reads this register, where the provider carries one. */
 readonly ownVoice: boolean;
};
export type RegisterReading = {
 /** The card id the settings name for the register, or null for a register the settings never reach. */
 readonly provider: string | null;
 readonly fallbackToDefault: boolean;
 readonly tuning: SpeechTuning;
};

const PRESENTATION_ZONE = 'presentation';
const zoneOf = (register: string | null): string | null =>
 (voice.queryClasses as readonly { readonly id: string; readonly zone: string }[]).find(c => c.id === register)?.zone ?? null;
/** Whether the contract has a register by this id at all — the door's own question, asked from one place. */
export const isRegister = (register: string): boolean => zoneOf(register) !== null;
export const isPresentationRegister = (register: string | null): register is PresentationClass => zoneOf(register) === PRESENTATION_ZONE;

/* The one decision: a presentation register reads through its own provider with every knob; anything else — a
   clinical-delivery register, clinical assist, no register at all — reads through the platform default with the
   delivery mechanics alone, and never in a person's own voice. */
export function tuningFor(settings: SpeechSettingsInForce, register: string | null): RegisterReading {
 const mechanics = {
  timeoutMs: settings.stretchTimeoutSeconds * 1000,
  azureAudioQuality: settings.azure.audioQuality,
  elevenLabs: Object.freeze({ model: settings.elevenLabs.model, audioQuality: settings.elevenLabs.audioQuality, latencyMode: settings.elevenLabs.latencyMode })
 };
 if (!isPresentationRegister(register)) return Object.freeze({ provider: null, fallbackToDefault: true, tuning: Object.freeze({ ...mechanics, ownVoice: false }) });
 const ownVoice = settings.ownVoice === 'every-presentation-register' || (settings.ownVoice === 'admin-register' && register === 'admin');
 const e = settings.elevenLabs;
 return Object.freeze({
  provider: settings.providerByClass[register],
  fallbackToDefault: settings.fallbackToDefault,
  tuning: Object.freeze({
   ...mechanics,
   presentation: Object.freeze({
    azure: Object.freeze({ speedPercent: settings.azure.speedPercent, pitchPercent: settings.azure.pitchPercent }),
    elevenLabs: Object.freeze({ stabilityPercent: e.stabilityPercent, similarityPercent: e.similarityPercent, stylePercent: e.stylePercent, speakerBoost: e.speakerBoost, speedPercent: e.speedPercent })
   }),
   ownVoice
  })
 });
}
