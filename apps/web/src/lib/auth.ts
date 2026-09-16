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
/**
 * Is a real identity service answering? Asked once, so the app can say which mode it is in.
 *
 * `response.ok` alone is not enough. Production reverse-proxies an unmatched path to the single-page
 * app's own fallback, which answers every GET with the landing page and a 200 — so before nginx
 * carries `/api/`, this probe saw that 200 and reported a service that was not there. The screen then
 * showed the real sign-in branch, which itself is answered by the same fallback, and a POST to it is a
 * 405 with an HTML body: `startSignIn` failed parsing that body as JSON and told a real person
 * "Could not reach MyThuso" on a page whose whole simulated flow exists for exactly this case. So this
 * checks the shape the identity service's own `GET /health` promises (`apps/api/src/server.ts`), not
 * only the status: a page standing in for an absent API can return 200 all day and never look like this.
 */
export async function probe(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return !!body && typeof body === 'object' && (body as { ok?: unknown }).ok === true
      && typeof (body as { holds?: unknown }).holds === 'string';
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
