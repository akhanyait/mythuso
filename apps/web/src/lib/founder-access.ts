import { useSyncExternalStore } from 'react';
import founder from '../../../../packages/catalog/founder-access.json' with { type: 'json' };

/* Founder access, the browser's half (packages/catalog/founder-access.json; the service's half is
 * apps/assistant-api/src/lib/founder-access.ts, and docs/governance/FOUNDER-ACCESS.md is the account).
 *
 * Everything that decides anything is in the service. This module only carries requests to its four
 * routes and remembers, for as long as the page is open, what the service last said about the session
 * and the two keys' metadata — whether signed in, whether a key is set, its last four characters and
 * its fingerprint. None of that is the key.
 *
 * What it never holds is a revealed key. reveal() hands the service's answer straight back to its one
 * caller, the reveal component in features/portal/gilbertone/founder/FounderAccess.tsx, which keeps it
 * in its own React state and wipes it; nothing here copies it, stores it, logs it or puts it in a
 * URL, and scripts/check-boundaries.mjs holds this file and that one to it. Nothing is kept in any
 * browser storage — the session is an HttpOnly cookie this code cannot read.
 *
 * Every request sends the custom header the service requires of a founder route and is same-origin,
 * so the browser sends the cookie and Sec-Fetch-Site says same-origin. The refusal a screen draws is
 * the one the route answered with — the contract's own sentence, as every refusal in this codebase is
 * read — or, when nothing answered, the contract's sentence for that.
 *
 * Since 28 September 2026 the founder's settings and provider controls (lib/founder-settings.ts) send their
 * requests through the same call() below — the same header, the same cookie, the same refusal shape — so
 * the founder's routes are asked in exactly one way. That module is the one other importer of this file
 * beside the settings gate and the Control Tower's door, and it carries no key either: a key it sends goes
 * once, in a body, and the answer it reads is metadata.
 *
 * Reached only through the reveal panel's dynamic import: a patient's first load carries none of it. */

export const founderContract = founder;
export const founderWords = founder.words;
export const founderKeys = founder.keys;
export const codeDigits = founder.totp.codeDigits;
export const wipeAfterMs = founder.reveal.wipeAfterSeconds * 1000;
export const sessionMinutes = founder.session.lifetimeSeconds / 60;
/* The Control Tower's door (founder-access.json#door), read by shells/FounderGate.tsx: the parameter that
   draws it outside production, the two roles it stands in front of, and its words. Nothing here decides
   anything about it — the door asks the same session state the reveal panel does, through useFounderState. */
export const founderDoor = founder.door;

declare const __ASSISTANT_API_URL__: string;
const base = () => (typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '');

export type Refusal = { readonly ok: false; readonly refusalId: string | null; readonly message: string };

export type Answer<T> = { readonly ok: true; readonly body: T } | Refusal;
export async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: Readonly<Record<string, unknown>>): Promise<Answer<T>> {
 const headers: Record<string, string> = { accept: 'application/json', [founder.request.header]: founder.request.headerValue };
 if (body) headers['content-type'] = 'application/json';
 try {
  const response = await fetch(`${base()}${founder.routes.prefix}${path}`, {
   method, headers, body: body ? JSON.stringify(body) : undefined,
   credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'
  });
  const answer = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok && answer) return { ok: true, body: answer as T };
  if (answer && typeof answer.refusalId === 'string' && typeof answer.message === 'string')
   return { ok: false, refusalId: answer.refusalId, message: answer.message };
  return { ok: false, refusalId: null, message: founder.words.notAnswered };
 } catch {
  return { ok: false, refusalId: null, message: founder.words.notAnswered };
 }
}

/* ---- What the page remembers: the session's state and the keys' metadata, never a key ---------- */

export type KeyMetadata = { name: string; present: boolean; lastFour: string | null; fingerprint: string | null };
export type FounderState =
 | { phase: 'checking' }
 | { phase: 'refused'; message: string; refusalId: string | null }
 | { phase: 'signed-out'; message: string | null }
 | { phase: 'signed-in'; keys: readonly KeyMetadata[]; expiresAt: string };

let state: FounderState = { phase: 'checking' };
let probing: Promise<void> | null = null;
const listeners = new Set<() => void>();
/* Who is told the moment the session stops being signed in — a sign-out, a session the service ended, a
   refusal — whether or not any screen is mounted to notice. lib/founder-settings.ts forgets what the last
   session read here, so the next sign-in never shows that session's settings or a provider's metadata. */
const leaving = new Set<() => void>();
const set = (next: FounderState) => {
 const was = state.phase;
 state = next;
 if (was === 'signed-in' && next.phase !== 'signed-in') leaving.forEach(l => l());
 listeners.forEach(l => l());
};
export const onSessionLeft = (listener: () => void): void => { leaving.add(listener); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const useFounderState = (): FounderState => useSyncExternalStore(subscribe, () => state);

/* No session is the ordinary answer before a sign-in, and it opens the sign-in form; every other
   refusal — dark, cross-site, locked — is drawn as the service said it. */
const settle = (answer: Answer<{ keys: KeyMetadata[]; expiresAt: string }>, afterSignIn: string | null = null) => {
 if (answer.ok) return set({ phase: 'signed-in', keys: answer.body.keys, expiresAt: answer.body.expiresAt });
 if (answer.refusalId === 'founder-no-session') return set({ phase: 'signed-out', message: afterSignIn });
 set({ phase: 'refused', message: answer.message, refusalId: answer.refusalId });
};

/* Asks the service where things stand. Several panels on one screen share one question. */
export function probe(): Promise<void> {
 probing ??= call<{ keys: KeyMetadata[]; expiresAt: string }>('GET', founder.routes.keys)
  .then(answer => settle(answer))
  .finally(() => { probing = null; });
 return probing;
}

/* The password and the code go in the body of one POST and nowhere else; the caller clears its own
   fields whatever the answer. */
export async function signIn(password: string, code: string): Promise<Refusal | null> {
 const answer = await call<{ signedIn: boolean; expiresAt: string }>('POST', founder.routes.session, { password, code });
 if (!answer.ok) {
  if (answer.refusalId === 'founder-access-dark' || answer.refusalId === 'founder-request-cross-site') set({ phase: 'refused', message: answer.message, refusalId: answer.refusalId });
  else if (answer.refusalId === 'founder-locked-out') set({ phase: 'signed-out', message: answer.message });
  return answer;
 }
 settle(await call<{ keys: KeyMetadata[]; expiresAt: string }>('GET', founder.routes.keys));
 return null;
}

export async function signOut(): Promise<void> {
 await call('DELETE', founder.routes.session);
 set({ phase: 'signed-out', message: null });
}

/* A refusal after sign-in that ends the session — its time ran out, the lock ended it, the service
   restarted — puts the panel back to signed out, which unmounts every revealed key with it. */
export function sessionEnded(refusal: Refusal): void {
 if (refusal.refusalId === 'founder-no-session' || refusal.refusalId === 'founder-locked-out')
  set({ phase: 'signed-out', message: refusal.message });
}

export type RevealAnswer = { name: string; revealedKey: string; lastFour: string; fingerprint: string };
/* The service's answer, returned to the one component that shows it and kept nowhere here. */
export const reveal = (name: string, code: string): Promise<Answer<RevealAnswer>> =>
 call<RevealAnswer>('POST', founder.routes.reveal, { name, code });

/* The contract's masked display, ••••{lastFour}, read rather than typed. */
export const masked = (template: string, lastFour: string | null): string => template.replace('{lastFour}', lastFour ?? '');
