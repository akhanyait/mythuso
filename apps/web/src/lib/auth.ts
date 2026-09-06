/**
 * Talks to the identity service through this origin's /api proxy.
 *
 * The app runs without it. If the service is not reachable the preview keeps its in-memory session,
 * which is what the design review and the test suite use. When it is reachable, sign-in is real: a
 * one-time code to a mobile number, and an HttpOnly cookie the page cannot read.
 */
export type Person = { id: string; phone: string; name: string | null };
export type StartOutcome =
  | { ok: true; challengeId: string; developmentCode?: string }
  | { ok: false; message: string };
export type VerifyOutcome = { ok: true; person: Person } | { ok: false; message: string };
const json = { 'content-type': 'application/json' };
const messages: Record<string, string> = {
  'invalid-phone': 'Enter a 10-digit South African mobile number, starting with 0.',
  'rate-limited': 'Too many codes requested for this number. Try again in fifteen minutes.',
  'wrong-code': 'That code doesn’t match. Check the message and try again.',
  'expired': 'That code has expired. Ask for a new one.',
  'too-many-attempts': 'Too many attempts. Ask for a new code.',
  'unknown-challenge': 'That code is no longer valid. Ask for a new one.'
};
const say = (error: string) => messages[error] ?? 'Something went wrong. Try again.';
/** Is a real identity service answering? Asked once, so the app can say which mode it is in. */
export async function probe(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch { return false; }
}
export async function currentPerson(): Promise<Person | null> {
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!response.ok) return null;
    return (await response.json() as { person: Person }).person;
  } catch { return null; }
}
export async function startSignIn(phone: string): Promise<StartOutcome> {
  try {
    const response = await fetch('/api/auth/start', { method: 'POST', headers: json, credentials: 'same-origin', body: JSON.stringify({ phone }) });
    const body = await response.json() as { challengeId?: string; developmentCode?: string; error?: string };
    if (!response.ok) return { ok: false, message: say(body.error ?? '') };
    return { ok: true, challengeId: body.challengeId!, developmentCode: body.developmentCode };
  } catch { return { ok: false, message: 'Could not reach MyThuso. Check your connection.' }; }
}
export async function verifyCode(challengeId: string, code: string): Promise<VerifyOutcome> {
  try {
    const response = await fetch('/api/auth/verify', { method: 'POST', headers: json, credentials: 'same-origin', body: JSON.stringify({ challengeId, code }) });
    const body = await response.json() as { person?: Person; error?: string };
    if (!response.ok) return { ok: false, message: say(body.error ?? '') };
    return { ok: true, person: body.person! };
  } catch { return { ok: false, message: 'Could not reach MyThuso. Check your connection.' }; }
}
export async function endSession(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* signing out locally is enough */ }
}
