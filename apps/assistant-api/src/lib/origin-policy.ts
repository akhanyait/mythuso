/* Which browser origins this service answers, and what it says to the rest — decided 21 September
   2026, replacing a wildcard.

   WHY THE WILDCARD WAS WRONG HERE. The old answer was `access-control-allow-origin: *`: any page
   on the internet could post a patient's words to /assistant/turn on mythuso.co.za and read the
   reply. Nothing in this service authenticates a caller — the routes are open by design, because
   the panel's bridge is the caller and it has no session here — so the only party the wildcard
   was for is nobody: in production both the panel and this service sit behind one origin, and the
   same-origin request needs no CORS grant at all. The wildcard therefore bought nothing a patient
   uses and gave the paid Azure endpoint, at somebody else's page, a free proxy into it.

   WHAT REPLACES IT. No Origin header (curl, a health check, a server-side caller) is not a
   browser context and is left exactly as it was: no CORS headers are needed or sent, and a caller
   that never asked the question is not refused one. A browser origin is answered only when it is
   on the list — in production that list is exactly the site's own two names, and nothing else is
   read there; the development variable is consulted only when NODE_ENV is not production, so it
   cannot widen a real deployment even if it is left set on the box. Everything else gets a 403
   before any route looks at the request, which is the one status a page cannot mistake for an
   answer.

   A NOTE ON WHAT THIS DOES NOT DO. CORS is a browser rule, not access control: a script that is
   not a browser ignores all of it. Rate limiting at nginx is the control for that, and this module
   is the control for the one caller CORS is for — a page in somebody's tab. */

export type CorsDecision = {
  /* True when the request carries a browser Origin this deployment will not answer. */
  refused: boolean;
  /* The headers an allowed browser request receives. Empty when there is no Origin to answer,
     and empty on a refusal — a refused origin hears nothing it could read as permission. */
  headers: Record<string, string>;
};

/* The whole production allow-list, written out: the apex and www, the two names the certificate
   covers and the two the deploy's server_name carries. Read as exact strings — no suffix
   matching, because "https://mythuso.co.za.evil.example" ends with nothing that helps it. */
const PRODUCTION_ORIGINS = ['https://mythuso.co.za', 'https://www.mythuso.co.za'];

/* The dev server's own shapes: any port, http or https, host, 127.0.0.1 or ::1. A vite dev server
   on a colleague's machine or in a container is the same conversation, and pinning one port would
   be a list that has to be edited before anybody can run the panel. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/* Anything else development needs — a tunnel hostname, a second machine's name — is written in
   MYTHUSO_ASSISTANT_DEV_ORIGINS as a comma-separated list. Read only outside production. */
const DEV_ORIGINS_VARIABLE = 'MYTHUSO_ASSISTANT_DEV_ORIGINS';

const originAllowed = (
  origin: string,
  env: Record<string, string | undefined>,
): boolean => {
  if ((env.NODE_ENV ?? '').trim() === 'production')
    return PRODUCTION_ORIGINS.includes(origin);
  if (LOCALHOST_ORIGIN.test(origin)) return true;
  return (env[DEV_ORIGINS_VARIABLE] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(origin);
};

export function corsFor(
  origin: string | undefined,
  env: Record<string, string | undefined> = process.env,
): CorsDecision {
  if (!origin) return { refused: false, headers: {} };
  if (!originAllowed(origin, env)) return { refused: true, headers: {} };
  return {
    refused: false,
    headers: {
      'access-control-allow-origin': origin,
      /* The answer depends on the request's Origin header, so any cache between the two must key
         on it. Without this a shared cache could hand one origin's grant to another. */
      vary: 'Origin',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  };
}
