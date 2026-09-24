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
export function useAssistantVoice(): AssistantVoice | null {
 const [found, setFound] = useState<AssistantVoice | null>(null);
 useEffect(() => {
  let live = true;
  void import('../../../lib/assistant').then(m => { if (live) setFound(m.voice); });
  return () => { live = false; };
 }, []);
 return found;
}
