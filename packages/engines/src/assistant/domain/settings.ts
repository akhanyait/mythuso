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
