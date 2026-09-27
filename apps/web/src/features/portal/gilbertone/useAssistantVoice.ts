import { useEffect, useState } from 'react';
import type { voice } from '../../../lib/assistant';

/* packages/catalog/assistant.json#voice — the voices, the languages and the cloud pair — for the Voice
 * and Overview sub-screens, read through lib/assistant.ts on a dynamic import.
 *
 * Why not a plain import: the assistant contract is a large module shared by the patient's own panel,
 * and a second static importer on an administration screen made the bundler give it a chunk of its own,
 * whose name joined the list of files the patient's first load carries (measured: +0.02 kB). Asked for
 * when the screen opens, it stays where it was. Until it arrives the screens draw their loading state. */
export type AssistantVoice = typeof voice;
export type SpokenLanguage = AssistantVoice['languages'][number] & { ttsVoices?: Record<string, string> };
/* The languages the cloud voice can read, in the contract's order: only those marked ttsAvailable, each
   with its two voice names. A language with no voice is not offered to a preview — it is shown as not
   available on the Voice screen, in the contract's own notice, and nothing is sent for it. */
export const spokenLanguagesOf = (found: AssistantVoice): readonly SpokenLanguage[] =>
 (found.languages as readonly SpokenLanguage[]).filter(l => l.ttsAvailable && l.ttsVoices);
/* The label the platform reads in when nothing has chosen one: the contract's own defaultVoice, the
   voice every locked register is read in whatever a presentation setting says. Read here, off the same
   dynamic import, and never typed on a screen. */
export const platformVoiceOf = (found: AssistantVoice): string => found.cloud.defaultVoice;
export function useAssistantVoice(): AssistantVoice | null {
 const [found, setFound] = useState<AssistantVoice | null>(null);
 useEffect(() => {
  let live = true;
  void import('../../../lib/assistant').then(m => { if (live) setFound(m.voice); });
  return () => { live = false; };
 }, []);
 return found;
}
