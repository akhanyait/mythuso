import { useEffect } from 'react';
import founder from '../../../../packages/catalog/founder-access.json' with { type: 'json' };
import { probe, sessionMinutes, useFounderState } from './founder-access';

/* The settings gate, on the founder's amendment of 28 September 2026 (packages/catalog/founder-access.json#gate):
 * one sign-in, for two hours, unlocks every settings editor in the Control Tower — the Configuration tab,
 * GilbertOne's Voice saves and Speech settings.
 *
 * WHAT DECIDES. The service's own answer about the founder's session, read through the same state the reveal
 * panel reads (lib/founder-access.ts) and nothing else: signed in means open; signed out means locked, with
 * the sign-in form drawn where the editor would be. Two answers open the editor as a preview instead — the
 * service saying founder access is dark on this server, and the service not answering at all, which is every
 * local preview and every journey — because every setting in the web preview lives in the tab's memory and
 * reaches no patient, and a lock on a preview would be a lock on nothing that also broke the demonstrator. The
 * screen says which of the two it is in the contract's own sentence.
 *
 * WHAT THIS IS NOT. It is a gate in the browser over a preview. Until the service keeps a settings history,
 * nothing a screen changes reaches a patient whether the gate is open or shut; the day it does, the settings
 * routes take the session cookie and enforce the gate themselves, and this file stops being the only one.
 * scripts/check-boundaries.mjs holds this file to reading the session's state: it never reveals, never names
 * a revealed key, and never carries a password or a code. */

export const founderGateWords = founder.gate.words;
export type FounderGate =
 | { readonly locked: true; readonly phase: 'checking' | 'signed-out' | 'refused'; readonly sentence: string }
 | { readonly locked: false; readonly phase: 'signed-in' | 'preview'; readonly sentence: string };

const minutes = (sentence: string) => sentence.replace('{minutes}', String(sessionMinutes));

export function useFounderGate(): FounderGate {
 const state = useFounderState();
 useEffect(() => { void probe(); }, []);
 if (state.phase === 'signed-in') return { locked: false, phase: 'signed-in', sentence: minutes(founderGateWords.openSentence) };
 if (state.phase === 'checking') return { locked: true, phase: 'checking', sentence: founderGateWords.checkingSentence };
 if (state.phase === 'signed-out') return { locked: true, phase: 'signed-out', sentence: minutes(founderGateWords.lockedSentence) };
 /* Refused: dark on this server, or not answered at all, is a preview; anything else the service said —
    cross-site, a lock — is drawn in its words and stays shut. */
 if (state.refusalId === 'founder-access-dark' || state.refusalId === null) return { locked: false, phase: 'preview', sentence: founderGateWords.previewSentence };
 return { locked: true, phase: 'refused', sentence: state.message };
}
