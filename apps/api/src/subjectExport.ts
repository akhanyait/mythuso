/**
 * The export: everything this service holds about you, handed to you and to nobody else.
 *
 * ── What was here before ─────────────────────────────────────────────────────────────────────
 *
 * `GET /account/data` returns the holdings register and the retention plan — *what* is held and on
 * what ground. That is a good answer to a different question. docs/PRIVACY-AND-SECURITY.md called
 * export **absent** and was right to: a list of the boxes is not the contents of the boxes, and
 * POPIA section 23 gives a data subject the record itself.
 *
 * ── The four things an export is supposed to have, and where each one is ─────────────────────
 *
 * The document named them: a step-up identity check, a scoped export, an audit, an expiry and
 * secure delivery. Four of the five are here and the fifth turns out not to exist:
 *
 *   · **Step-up.** `POST /account/export` demands a code from an account that has a second factor
 *     enrolled. Never from one that has not — that rule is in stepUp.ts and is never bent.
 *   · **Scoped.** The scope is the caller and cannot be anything else. There is no id on the
 *     request, so there is no id to change: what comes back is assembled from the session's own
 *     person. An export route that took a subject id would be the whole of a data breach in one
 *     parameter.
 *   · **Audited.** It goes through the gate as a `subject-access` read, so it is decided and written
 *     into the hash chain before any of it is assembled, exactly like every other protected read.
 *   · **Expiry and delivery.** There is nothing to expire. The export is built for one request and
 *     written into that response — there is no file, no link, no attachment, no bucket and no third
 *     party — so it is delivered by the same authenticated session that asked for it and it is gone
 *     when that response ends. That is not a gap that has been filled; it is a gap that does not
 *     open, and it is the reason this route hands the bytes back rather than emailing them.
 *
 * ── What it will not carry, and why each one ─────────────────────────────────────────────────
 *
 * The exclusions are the part of an export worth reviewing, because an export is the one route on a
 * platform designed to put everything in one place.
 *
 *   · **The authenticator secret and the recovery codes.** An export containing them is a second
 *     factor handed to whoever ends up with the file, which is the opposite of what enrolling one
 *     was for. What comes back is whether one is enrolled and when.
 *   · **Session tokens and code hashes.** They are credentials, not information about a person, and
 *     the honest answer about a scrambled one-time code is that it exists rather than what it is.
 *   · **Vetting documents.** A party's certificates are opened one version at a time through the
 *     gate, each with its own entry in the chain. An export that bundled them would be one request
 *     producing every document a person ever submitted with a single line in the log — and it would
 *     be the easiest way on this platform to get a police clearance out of it. What comes back is
 *     the standing: which checks exist, what was decided, by whom, and when they run out.
 *
 * The refusal list is exported so a boundary check can hold the assembly to it rather than trusting
 * whoever adds the next section.
 */

/** Named, so the answer says what it left out rather than leaving somebody to notice. */
export const NEVER_EXPORTED: readonly { what: string; because: string }[] = [
 {
  what: 'The secret your authenticator app shares with MyThuso, and your recovery codes',
  because: 'Handing those to anybody who ends up with this file would hand them your second factor, which is the one thing it exists to stop. What is here instead is whether you have one set up and when you did it.'
 },
 {
  what: 'Session tokens, and the scrambled form of the one-time codes sent to you',
  because: 'They are keys rather than information about you, and none of them can be read back into anything even by MyThuso. What is here is that they existed and when.'
 },
 {
  what: 'The certificates and clearances themselves, if MyThuso vets you',
  because: 'Each one is opened through a check that is written down every single time, one document at a time. Putting them all in one file would produce every document you have ever submitted against a single line in that log. What is here is every decision taken about them — what was decided, by whom, when, and when it runs out — and you can ask for any one document on its own.'
 }
];

/** Said at the top of the export, so its reach is the first thing read rather than worked out. */
export const EXPORT_SCOPE =
 'This is everything MyThuso\'s identity service holds about you, assembled for this one request and written straight into this answer. There is no file, no link and no copy kept anywhere — which is why nothing here expires and why it was not sent to you by any other route. It holds no health information, because this service holds none: no visits, no observations, no results, no prescriptions.';

export const EXPORT_REFUSALS = {
 notYours:
  'An export is of your own record and there is nowhere on this request to name anybody else\'s. That is deliberate: a route that took somebody\'s id would be a data breach with a parameter.',
 gateRefused:
  'The gate refused this read and wrote the refusal down. An export is a read of your own record like any other, and it is decided the same way.'
} as const;

/* The words that must never appear as a key anywhere in an export body. Held here rather than in
   the checker so that the module doing the excluding is the module that names what is excluded, and
   so a section added later fails the build rather than the review. */
export const FORBIDDEN_KEYS: readonly string[] = [
 'secret', 'recoveryCodes', 'codeHash', 'tokenHash', 'document', 'pepper', 'key'
];

/**
 * Every key in a body, however deep. Used by the test and by the boundary check, so the rule above
 * is enforced against the thing that is actually sent rather than against a reading of this file.
 */
export function keysIn(value: unknown, found: Set<string> = new Set()): Set<string> {
 if (Array.isArray(value)) { for (const item of value) keysIn(item, found); return found; }
 if (value && typeof value === 'object') {
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) { found.add(key); keysIn(nested, found); }
 }
 return found;
}

/** Whether a body carries a key it must not. Returns the offending keys, so the error can name them. */
export const forbiddenKeysIn = (body: unknown): string[] =>
 [...keysIn(body)].filter(key => FORBIDDEN_KEYS.some(forbidden => key.toLowerCase() === forbidden.toLowerCase()));
