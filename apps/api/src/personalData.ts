/**
 * Everything this service holds about a person, and what happens to each part of it on request.
 *
 * ── Why a register rather than a DELETE ──────────────────────────────────────────────────────
 *
 * POPIA section 24 gives a data subject the right to have their information deleted where it is
 * inaccurate, irrelevant, excessive, out of date, misleading or unlawfully obtained. It is not a
 * right to erase everything on demand, and section 14 pulls the other way: information must be kept
 * where another law requires it, or while it is still needed for the purpose it was lawfully
 * collected for. An operator answering a request has to be able to say what went, what stayed and
 * why — and the "why" is repeated to the person, so it is written for them and not for a developer.
 *
 * ── Be honest about how little this is ───────────────────────────────────────────────────────
 *
 * This is not a hospital record. The service holds a mobile number, an optional name, the
 * short-lived machinery of signing in, and — for an account that has one — a second-factor secret.
 * There is no health information here at all, which is the only reason this slice exists ahead of
 * the rest of docs/PRIVACY-AND-SECURITY.md. The register says so rather than inventing holdings to
 * look thorough. When clinical data arrives it arrives with its own register, its own retention
 * schedule and the legally required clinical retention periods, and none of that is written here
 * because none of it is true here yet.
 *
 * Pure: describes and decides, touches no database.
 */

export type Disposition =
 /** Deleted outright when an erasure is carried out. */
 | 'erase'
 /** The row survives; the part of it that is a person does not. */
 | 'anonymise'
 /** Kept, with a ground. The ground has to be given to the person. */
 | 'retain';

export type Holding = {
 /** What it is, in the words the person would use. */
 label: string;
 /** Where it lives, for the operator answering the request. */
 table: string;
 disposition: Disposition;
 /** Said to the person, so written for them. */
 because: string;
};

export const HOLDINGS: Holding[] = [
 /* ── Deleted: held to make signing in work, and for nothing else ────────────────────────── */
 {
  label: 'Your name',
  table: 'people.name',
  disposition: 'erase',
  because: 'It is only there so MyThuso can greet you by name. Nothing depends on it. It is stored encrypted while it is there, and removed in full.'
 },
 {
  label: 'Your sign-in sessions',
  table: 'sessions',
  disposition: 'erase',
  because: 'Deleted straight away, which also signs you out of every phone and browser you are signed in on.'
 },
 {
  label: 'The one-time codes sent to you',
  table: 'challenges',
  disposition: 'erase',
  because: 'Only the scrambled form of a code is ever kept, and only until it is used or expires. Deleted with everything else.'
 },
 {
  label: 'The record of which device asked for a code',
  table: 'starts',
  disposition: 'erase',
  because: 'Your number and the internet address that asked for a code, kept for fifteen minutes so nobody can request a thousand codes for your number. Deleted.'
 },
 {
  label: 'Your authenticator app and recovery codes',
  table: 'second_factors, recovery_codes, second_factor_challenges',
  disposition: 'erase',
  because: 'The secret your authenticator app shares with MyThuso, kept encrypted, and the recovery codes you were given, kept scrambled. Both are deleted, so neither can be used again.'
 },

 /* ── Anonymised: the row has to survive, the person does not ────────────────────────────── */
 {
  label: 'Your account itself',
  table: 'people',
  disposition: 'anonymise',
  because: 'The account is not deleted outright; it is emptied. Your name goes, and your mobile number is replaced with an address that can never be reached or dialled. What is left is a marker that says this account was erased and when — which is how MyThuso can show your request was actually carried out — and it keeps your old account number reserved, so it can never be handed to somebody else and read as though it were them.'
 },

 /* ── Kept, with the ground given ────────────────────────────────────────────────────────── */
 {
  label: 'The record that you asked to be erased',
  table: 'erasure_requests',
  disposition: 'retain',
  because: 'The date you asked and the date it was done. It holds no name and no number. Deleting it would leave MyThuso unable to show that your request was honoured, which is the one thing the Information Regulator would ask for.'
 },
 {
  label: 'The sign-in security log',
  table: 'audit',
  disposition: 'retain',
  because: 'A line for every code requested, every wrong code and every sign-in. It is written once and never edited or deleted — that is what makes it worth anything as evidence that nobody was quietly working their way into your account. Entries made before your erasure still carry your mobile number, and MyThuso cannot go back and change them without destroying the very thing that makes the log trustworthy. Nothing after your erasure is linked to you, and the log holds no health information of any kind.'
 }
];

export const holdings = (disposition: Disposition): Holding[] => HOLDINGS.filter(h => h.disposition === disposition);

/** One sentence about the whole service, for the top of an answer to a request. */
export const SCOPE_STATEMENT =
 'MyThuso\'s identity service holds a mobile number, a name if you gave one, the short-lived machinery of signing in, and — if you set one up — the secret your authenticator app shares with it. It holds no health information: no visits, no observations, no results, no prescriptions. Those live nowhere yet.';

/** The plain-language answer an operator sends back, ready to be pasted into a reply. */
export function erasureSummary(): string {
 const parts = [SCOPE_STATEMENT];
 const erased = holdings('erase');
 const anonymised = holdings('anonymise');
 const retained = holdings('retain');
 if (erased.length) parts.push(`Deleted outright: ${erased.map(h => h.label.toLowerCase()).join('; ')}.`);
 if (anonymised.length) {
  parts.push(`Kept, but no longer you: ${anonymised.map(h => h.label.toLowerCase()).join('; ')}.\n${anonymised.map(h => `  · ${h.label}: ${h.because}`).join('\n')}`);
 }
 if (retained.length) {
  parts.push(`Kept, and why — POPIA requires a ground for anything not deleted:\n${retained.map(h => `  · ${h.label}: ${h.because}`).join('\n')}`);
 }
 return parts.join('\n\n');
}

/**
 * Thirty days from receipt.
 *
 * POPIA gives a responsible party thirty days to answer a request, extendable once and only on
 * notice. The clock starts when the request arrives, not when somebody in an inbox notices it — so
 * this takes the date it was received rather than today's.
 */
export const RESPONSE_DAYS = 30;
const DAY = 86_400_000;

export const dueBy = (receivedAt: number): number => receivedAt + RESPONSE_DAYS * DAY;
/** Days left to answer. Negative once it is late, which is the number worth showing. */
export const daysRemaining = (dueAt: number, now: number): number => Math.ceil((dueAt - now) / DAY);
