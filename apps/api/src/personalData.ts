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
 * short-lived machinery of signing in, a second-factor secret for an account that has one, and — for
 * a nurse, courier, pharmacy or other party the platform vets — the evidence their checks were
 * verified against. There is no health information here at all, which is the only reason this slice
 * exists ahead of the rest of docs/PRIVACY-AND-SECURITY.md. The register says so rather than
 * inventing holdings to look thorough.
 *
 * ── The conflict this register now models rather than mentions ───────────────────────────────
 *
 * Two bodies of law point in opposite directions over the same information.
 *
 * POPIA section 24 gives a data subject the right to have information deleted. The National Health
 * Act and the HPCSA's record-keeping guidance require a patient record to be kept for six years from
 * the last entry, longer for a child and longer again for mental-health and occupational-health
 * records. They cannot both be satisfied, and a platform that only mentions the tension in a
 * document will eventually resolve it by whichever code path runs first.
 *
 * So it is modelled. Every holding names a retention basis; every basis says what anchors it, how
 * long, under which instrument, and whether it pulls against erasure; and an erasure answer says out
 * loud what could not be deleted and why, in the words the person reads. The bases for clinical
 * records are written down and marked as holding nothing, because no clinical record exists in this
 * service and pretending one might would be the same dishonesty in the other direction.
 *
 * What this deliberately does not do is decide. It records the instrument and the period an operator
 * has set; it does not interpret either, it is not advice, and the numbers that are MyThuso's own
 * choice say so beside themselves. Section 14(1) requires the responsible party to determine those
 * with the Information Officer and counsel, and a file cannot do that on their behalf.
 *
 * Pure: describes and decides, touches no database and holds no clock of its own.
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
 /** Which retention basis keeps it, by id. Everything is kept on a stated ground or not kept. */
 basis: string;
};

/* ---- Retention bases ---------------------------------------------------------------------------
   What keeps a holding, from when, for how long, and under which instrument.

   Two things are separated here on purpose. `authority` names an instrument — a section, an Act, a
   professional guideline — and is a pointer to something a reader can go and read. `note` says which
   part of the period is MyThuso's own setting rather than the instrument's, because those are
   different kinds of number and running them together is how a company's internal policy ends up
   being described to a data subject as the law. Where the instrument states a period, it is quoted.
   Where it does not, the number is ours and is labelled as ours. */

export type RetentionAnchor =
 /** No retention at all: gone as soon as it has done its work. */
 | 'immediate'
 /** From the date the request was received. */
 | 'request'
 /** From the last entry in the record — the clinical anchor, and the one nobody can compute in advance. */
 | 'last-entry'
 /** From the day the party stopped being able to work through MyThuso. */
 | 'party-inactive'
 /** From the day the server received a queued entry from a device. Not from when it was captured:
     what the device believed is a claim, and a disposal date computed off a claim is not a date. */
 | 'capture-received'
 /** Until the person reaches a given age. Needs a date of birth, which this service does not hold. */
 | 'age-of-majority'
 /** There is no disposal date, and saying one would be a fiction. */
 | 'never';

export type RetentionBasis = {
 id: string;
 name: string;
 /** The instrument, named so somebody can go and read it. Naming is not interpreting. */
 authority: string;
 anchor: RetentionAnchor;
 /** Whole years from the anchor, or null where the period is not a number of years. */
 years: number | null;
 /** The rule, in the words the data subject reads. */
 rule: string;
 /** True where POPIA section 24 and this basis pull in opposite directions over the same thing. */
 conflictsWithErasure: boolean;
 /** Whether anything in this service is actually held on it today. Several are here and hold nothing. */
 inUse: boolean;
 /** What MyThuso has chosen rather than been told, and what it has not decided at all. */
 note: string;
};

export const RETENTION_BASES: RetentionBasis[] = [
 {
  id: 'spent-material',
  name: 'Kept only while it works',
  authority: 'POPIA section 14(1): information may not be kept longer than is necessary for the purpose it was collected for.',
  anchor: 'immediate',
  years: 0,
  rule: 'A one-time code, the address that asked for it and a session you have signed out of stop being useful within a day. They are deleted by a sweep that runs on a schedule, and on erasure they go immediately.',
  conflictsWithErasure: false,
  inUse: true,
  note: 'Nothing here is a choice about how long. The purpose ends and so does the holding.'
 },
 {
  id: 'proof-of-request',
  name: 'Proof that your request was carried out',
  authority: 'POPIA section 24, read with the responsible party\'s duty under section 4(1) to be able to demonstrate compliance.',
  anchor: 'request',
  years: 3,
  rule: 'The date you asked to be erased and the date it was done, with no name and no number attached. It is the only thing that can show your request was actually honoured.',
  conflictsWithErasure: true,
  inUse: true,
  note: 'POPIA states no period for this. Three years is MyThuso\'s own setting, chosen so that a complaint made long after the fact can still be answered, and it is a setting rather than a legal requirement.'
 },
 {
  id: 'audit-integrity',
  name: 'The security log, which cannot be rewritten',
  authority: 'POPIA section 19: appropriate technical measures to detect unlawful access. A log something is allowed to edit does not detect anything.',
  anchor: 'never',
  years: null,
  rule: 'Every line is chained to the one before it, so an edited or deleted entry shows up. Removing your entries would break that chain for everyone else\'s, which is the whole reason the log is worth having.',
  conflictsWithErasure: true,
  inUse: true,
  note: 'There is no disposal date and this register does not invent one. What should eventually replace it is a separate log with its own retention period, so that "never" is a property of the integrity chain rather than of the information in it. That is not built.'
 },
 {
  id: 'workforce-vetting',
  name: 'Evidence that a care worker was cleared',
  authority: 'POPIA section 14(1)(b) and (c): kept because a law requires it or because it is still needed for the purpose. Health Professions Act 56 of 1974 and the Nursing Act 33 of 2005 make the practitioner\'s own registration a matter of public record; the evidence MyThuso holds beside it is not.',
  anchor: 'party-inactive',
  years: 6,
  rule: 'The certificates, clearances and decisions behind your clearance to attend visits, kept after you stop working through MyThuso so that a question about care you gave can still be answered — including a question that clears you.',
  conflictsWithErasure: true,
  inUse: true,
  note: 'Six years is MyThuso\'s own setting. No statute names a period for vetting evidence; six matches the period a patient record is kept for, so that a question about a visit and a question about who attended it stop being answerable on the same day rather than years apart. It is a setting an Information Officer should confirm or change, and this file does not decide it.'
 },
 {
  id: 'capture-receipt',
  name: 'The record that a reading was sent, and what happened to it',
  authority: 'POPIA section 14(1)(b) and (c), read with the National Health Act 61 of 2003 section 13 and the HPCSA guidance on the keeping of patient records — which govern the reading itself, held elsewhere, and not this receipt.',
  anchor: 'capture-received',
  years: 6,
  rule: 'A line for every entry a nurse\'s phone sent to MyThuso: who sent it, against whose visit, when the phone believed it was taken and when MyThuso received it. It holds no reading of any kind. It is kept for six years from the day it arrived, so that the order in which things happened can still be established for as long as the care it belongs to can be asked about.',
  conflictsWithErasure: true,
  inUse: true,
  note: 'Six years is MyThuso\'s own setting. No statute names a period for a sync receipt: the six-year clinical period runs from the last entry in a record, and this counts from the day the entry arrived, which is a different anchor and a shorter clock. It was chosen to match rather than derived from anything, and it is a setting an Information Officer should confirm or change. An entry still waiting for a clinician\'s decision is never disposed of on this ground, whatever its age — see apps/api/src/capture/index.ts.'
 },
 /* ── Written down, holding nothing ─────────────────────────────────────────────────────────
    These are the bases that make the conflict real, and not one of them applies to anything this
    service holds today, because no clinical record exists here. They are here so that when one
    does, the register already knows what it will be up against — and so that nobody reads the
    absence of a clinical retention period as the absence of a clinical retention duty. */
 {
  id: 'health-record',
  name: 'A patient record: six years from the last entry',
  authority: 'National Health Act 61 of 2003 section 13, read with the HPCSA guidelines on the keeping of patient records.',
  anchor: 'last-entry',
  years: 6,
  rule: 'A health record is kept for six years after the last entry in it — not six years from the visit, and not six years from the request. Somebody who is seen every year has a record that never reaches its disposal date while the care continues.',
  conflictsWithErasure: true,
  inUse: false,
  note: 'Nothing in this service is held on this basis, because this service holds no health information. It is written down because the moment one clinical record arrives, this is the rule it arrives under, and a right of erasure cannot reach it.'
 },
 {
  id: 'health-record-minor',
  name: 'A child\'s record: until they are twenty-one',
  authority: 'National Health Act 61 of 2003 section 13, and the HPCSA guidance on records of minors.',
  anchor: 'age-of-majority',
  years: null,
  rule: 'A record made about a child is kept until they turn twenty-one, which can be far longer than six years. A guardian asking for it to be deleted is asking for something that is not theirs to give away.',
  conflictsWithErasure: true,
  inUse: false,
  note: 'No disposal date can be worked out here even in principle: it needs a date of birth, and this service holds none. That is stated rather than approximated, because a disposal date computed from a guess is worse than no disposal date.'
 },
 {
  id: 'health-record-extended',
  name: 'Mental health and occupational health: longer again',
  authority: 'Mental Health Care Act 17 of 2002, and the occupational-health record requirements under the Occupational Health and Safety Act 85 of 1993 and its regulations.',
  anchor: 'last-entry',
  years: null,
  rule: 'Records of mental-health care and of occupational-health surveillance are kept for longer than an ordinary health record, and in some cases for decades after the exposure they document.',
  conflictsWithErasure: true,
  inUse: false,
  note: 'The period is deliberately left as null rather than guessed. It differs by regulation and by the kind of record, and a single number typed here would be wrong for most of them. Determining it is work for the Information Officer and counsel before any such record is held.'
 }
];

export const basisById = (id: string): RetentionBasis | undefined => RETENTION_BASES.find(basis => basis.id === id);

const DAY_MS = 86_400_000;
const YEAR_MS = 365.2425 * DAY_MS;

/**
 * When a holding on this basis falls due for disposal.
 *
 * Returns null wherever a date genuinely cannot be worked out — no period, no anchor, or an anchor
 * this service has nothing to compute from. A null is an answer: "we cannot tell you a date, and
 * here is why", which is honest in a way that a plausible date arrived at by assumption is not.
 */
export function disposalDate(basis: RetentionBasis, anchoredAt: number | null): number | null {
 if (basis.years === null || basis.anchor === 'never' || basis.anchor === 'age-of-majority') return null;
 if (anchoredAt === null) return null;
 return Math.round(anchoredAt + basis.years * YEAR_MS);
}

export const HOLDINGS: Holding[] = [
 /* ── Deleted: held to make signing in work, and for nothing else ────────────────────────── */
 {
  label: 'Your name',
  table: 'people.name',
  disposition: 'erase',
  because: 'It is only there so MyThuso can greet you by name. Nothing depends on it. It is stored encrypted while it is there, and removed in full.',
  basis: 'spent-material'
 },
 {
  label: 'Your sign-in sessions',
  table: 'sessions',
  disposition: 'erase',
  because: 'Deleted straight away, which also signs you out of every phone and browser you are signed in on.',
  basis: 'spent-material'
 },
 {
  label: 'The one-time codes sent to you',
  table: 'challenges',
  disposition: 'erase',
  because: 'Only the scrambled form of a code is ever kept, and only until it is used or expires. Deleted with everything else.',
  basis: 'spent-material'
 },
 {
  label: 'The record of which device asked for a code',
  table: 'starts',
  disposition: 'erase',
  because: 'Your number and the internet address that asked for a code, kept for fifteen minutes so nobody can request a thousand codes for your number. Deleted.',
  basis: 'spent-material'
 },
 {
  label: 'Your authenticator app and recovery codes',
  table: 'second_factors, recovery_codes, second_factor_challenges',
  disposition: 'erase',
  because: 'The secret your authenticator app shares with MyThuso, kept encrypted, and the recovery codes you were given, kept scrambled. Both are deleted, so neither can be used again.',
  basis: 'spent-material'
 },

 /* ── Anonymised: the row has to survive, the person does not ────────────────────────────── */
 {
  label: 'Your account itself',
  table: 'people',
  disposition: 'anonymise',
  because: 'The account is not deleted outright; it is emptied. Your name goes, and your mobile number is replaced with an address that can never be reached or dialled. What is left is a marker that says this account was erased and when — which is how MyThuso can show your request was actually carried out — and it keeps your old account number reserved, so it can never be handed to somebody else and read as though it were them.',
  basis: 'proof-of-request'
 },

 /* ── Kept, with the ground given ────────────────────────────────────────────────────────── */
 {
  label: 'The record that you asked to be erased',
  table: 'erasure_requests',
  disposition: 'retain',
  because: 'The date you asked and the date it was done. It holds no name and no number. Deleting it would leave MyThuso unable to show that your request was honoured, which is the one thing the Information Regulator would ask for.',
  basis: 'proof-of-request'
 },
 {
  label: 'The sign-in security log',
  table: 'audit',
  disposition: 'retain',
  because: 'A line for every code requested, every wrong code and every sign-in. It is written once and never edited or deleted — that is what makes it worth anything as evidence that nobody was quietly working their way into your account. Entries made before your erasure still carry your mobile number, and MyThuso cannot go back and change them without destroying the very thing that makes the log trustworthy. Nothing after your erasure is linked to you, and the log holds no health information of any kind.',
  basis: 'audit-integrity'
 },
 {
  label: 'The log of who opened what',
  table: 'protected_access_log',
  disposition: 'retain',
  because: 'A line every time anybody asked to open something protected, whether they were allowed to or not — who asked, what for, which entry, and the answer. It never holds what was actually read. Like the sign-in log it is chained, so nobody can quietly remove the line about themselves, and removing yours would break that for everybody.',
  basis: 'audit-integrity'
 },

 /* ── The workforce holdings: only for a party MyThuso vets ───────────────────────────────── */
 {
  label: 'Your record as a vetted care worker or partner',
  table: 'vetting_parties',
  disposition: 'retain',
  because: 'This is here only if MyThuso vets you — as a nurse, a courier, a pharmacy, a laboratory or a site. It says which role you were vetted for and the registration number the role hangs on, and whether you are currently suspended. It is not held about somebody who only uses MyThuso for their own care.',
  basis: 'workforce-vetting'
 },
 {
  label: 'The decisions on each of your checks',
  table: 'vetting_evidence',
  disposition: 'retain',
  because: 'For every check your role asks for: what was decided, on what date, by which reviewer, who agreed with them where two people are required, and when it runs out. This is what a lapsed clearance is worked out from, which is why a certificate that expires suspends you without anybody having to notice first.',
  basis: 'workforce-vetting'
 },
 {
  label: 'The certificates and clearances you submitted',
  table: 'vetting_evidence_versions',
  disposition: 'retain',
  because: 'The documents themselves — your SANC receipt, your police clearance, your identity document, your qualifications. They are encrypted, they are opened only through a check that is written down every single time, and every one carries a fingerprint of the file that was submitted, so a document that was swapped afterwards is refused rather than shown. This is the holding most likely to feel wrong to you, so it is said plainly: asking to be erased does not delete it while the ground below still applies.',
  basis: 'workforce-vetting'
 },
 {
  label: 'The record of the founding ceremony, if you were one of the first two',
  table: 'vetting_bootstrap_ceremonies',
  disposition: 'retain',
  because: 'MyThuso\'s vetting rule is that a high-risk check needs two different reviewers. The very first reviewers had nobody to check them, so two named people cleared them by hand at a console, under a one-time authorisation. This holds the fingerprint of that authorisation, when it was used, who used it, and who was seeded — never the authorisation itself. It is what stops the same authorisation being used a second time, and it is the record an auditor asks for when they want to know where the first trust on this platform came from.',
  basis: 'audit-integrity'
 },
 /* ── The intake ledger: somebody's clinical work, and no clinical information ───────────── */
 {
  label: 'The record of entries your nurse\'s phone sent after being offline',
  table: 'capture_entries',
  disposition: 'retain',
  because: 'When a nurse works somewhere with no signal, what she takes is held on her phone until it can be sent. This is the line MyThuso writes when it arrives: which phone sent it, which nurse, against which of your visits, which part of the visit it was for, what time the phone believed it was taken and what time MyThuso actually received it. It does not hold what was found. MyThuso never kept that and could not read it if it had — the reading stays on the phone, and what is kept here is a fingerprint of the sealed copy, which proves nothing about you and everything about whether the file was swapped afterwards. It is kept so that the order in which things happened can still be worked out if anybody asks about your care.',
  basis: 'capture-receipt'
 },
 {
  label: 'Anything of yours a clinician still has to decide about',
  table: 'capture_conflicts',
  disposition: 'retain',
  because: 'Sometimes two entries land on the same part of the same visit, or one arrives after a doctor has already signed off, or the nurse who took it had a certificate run out while her phone was offline. MyThuso never merges those and never throws one away: it holds them and says a person has to decide. This is that decision — what disagreed, when it was noticed, who settled it, and what they said. It holds no reading. Anything still waiting is never quietly disposed of on a date, because a question that has been open for a year is a question somebody owes you an answer to rather than a record to tidy away.',
  basis: 'capture-receipt'
 },
 {
  label: 'What each issuing authority said about your checks',
  table: 'vetting_authority_answers',
  disposition: 'retain',
  because: 'When MyThuso puts one of your checks to the body that issued it — the Nursing Council, the Police Service, Home Affairs through an accredited provider — this records which body was asked, on what date, and what came back. For almost every authority today the answer is that there is no way to ask them at all, and that is recorded too, because a check nobody could confirm should not look the same as one somebody did. Your registration number, your policy number and your identity number are deliberately not kept here: they are used to ask the question and are not written down afterwards.',
  basis: 'workforce-vetting'
 },
 {
  label: 'Your identity verification sessions with the accredited provider',
  table: 'vetting_identity_sessions',
  disposition: 'retain',
  because: 'If your identity is checked against Home Affairs through an accredited provider, this records that a session was opened, when, and what the provider answered. It holds nothing about you as a person — not your identity number, not your name, and not the photograph you took. Those go from you to the provider directly and never pass through MyThuso.',
  basis: 'workforce-vetting'
 },
 {
  label: 'Which renewal reminders you have already had',
  table: 'vetting_renewal_notices',
  disposition: 'retain',
  because: 'Which reminder was already sent about which check, and when. It carries no name and no number. It is what stops you being messaged every night for six weeks about the same certificate.',
  basis: 'workforce-vetting'
 }
];

export const holdings = (disposition: Disposition): Holding[] => HOLDINGS.filter(h => h.disposition === disposition);
/** Which holdings a party actually has. A patient is not a vetted party and never sees those lines. */
export const holdingsFor = (disposition: Disposition, options: { vetted: boolean }): Holding[] =>
 holdings(disposition).filter(holding => options.vetted || !holding.table.startsWith('vetting_'));

/** One sentence about the whole service, for the top of an answer to a request. */
export const SCOPE_STATEMENT =
 'MyThuso\'s identity service holds a mobile number, a name if you gave one, the short-lived machinery of signing in, and — if you set one up — the secret your authenticator app shares with it. If MyThuso vets you as a nurse, courier, pharmacy, laboratory or site, it also holds the certificates and clearances your checks were verified against, and the decisions taken on them. Where a nurse\'s phone has synced after being offline, it also holds the line saying an entry arrived — which phone, which nurse, against which visit, and when — and never what was in it. It holds no health information: no visits, no observations, no results, no prescriptions. Those live nowhere yet.';

/**
 * What could not be erased, with the ground and the date it stops applying.
 *
 * The anchors are supplied rather than assumed. A disposal date computed from today when the rule
 * says "from the last entry" is a date that is simply wrong, and the honest output where an anchor
 * is unknown is no date at all — which `disposalDate` returns and this passes straight through.
 */
export type ErasureAnchors = {
 /** When the request arrived. The POPIA clock and the proof-of-request basis both run from here. */
 requestedAt: number;
 /** When the party stopped being able to work through MyThuso, if they ever could. */
 partyInactiveAt?: number | null;
 /** The last entry in a health record. There is none in this service, and there is no field for one. */
 lastEntryAt?: number | null;
 /** When the earliest intake receipt about this person arrived. Absent for almost everybody. */
 captureReceivedAt?: number | null;
};

export type RetainedHolding = {
 holding: Holding;
 basis: RetentionBasis;
 /** Null where no date can honestly be worked out. The answer says which, and why. */
 disposalOn: number | null;
};

const anchorFor = (basis: RetentionBasis, anchors: ErasureAnchors): number | null => {
 switch (basis.anchor) {
  case 'immediate': return anchors.requestedAt;
  case 'request': return anchors.requestedAt;
  case 'party-inactive': return anchors.partyInactiveAt ?? null;
  case 'last-entry': return anchors.lastEntryAt ?? null;
  case 'capture-received': return anchors.captureReceivedAt ?? null;
  default: return null;
 }
};

export function retainedHoldings(anchors: ErasureAnchors, options: { vetted: boolean }): RetainedHolding[] {
 return holdingsFor('retain', options).concat(holdingsFor('anonymise', options)).map(holding => {
  const basis = basisById(holding.basis);
  if (!basis) throw new Error(`${holding.table} names retention basis "${holding.basis}", which is not in the register. A holding with no ground is a holding nobody can justify.`);
  return { holding, basis, disposalOn: disposalDate(basis, anchorFor(basis, anchors)) };
 });
}

const asDate = (at: number): string => new Date(at).toISOString().slice(0, 10);

/**
 * The plain-language answer an operator sends back, ready to be pasted into a reply.
 *
 * It says what went, what stayed, on which ground, and until when — and where a right of erasure and
 * a duty to retain genuinely collide, it says so in that word rather than leaving the person to work
 * out from the wording that their request was partly refused. Somebody who is told "some of this is
 * kept and here is the law that keeps it" can go and argue with the law. Somebody who is told
 * nothing cannot.
 */
export function erasureSummary(options: {
 anchors?: ErasureAnchors;
 vetted?: boolean;
 /** Anything a module outside this file could not erase, in its own words. See VettingVault. */
 alsoRetained?: { what: string; because: string }[];
} = {}): string {
 const vetted = options.vetted ?? false;
 const anchors = options.anchors ?? { requestedAt: 0 };
 const parts = [SCOPE_STATEMENT];
 const erased = holdingsFor('erase', { vetted });
 const anonymised = holdingsFor('anonymise', { vetted });
 const retained = holdingsFor('retain', { vetted });
 if (erased.length) parts.push(`Deleted outright: ${erased.map(h => h.label.toLowerCase()).join('; ')}.`);
 if (anonymised.length) {
  parts.push(`Kept, but no longer you: ${anonymised.map(h => h.label.toLowerCase()).join('; ')}.\n${anonymised.map(h => `  · ${h.label}: ${h.because}`).join('\n')}`);
 }
 if (retained.length) {
  parts.push(`Kept, and why — POPIA requires a ground for anything not deleted:\n${retained.map(h => `  · ${h.label}: ${h.because}`).join('\n')}`);
 }
 for (const extra of options.alsoRetained ?? []) parts.push(`Kept: ${extra.what}.\n  · ${extra.because}`);

 /* The conflict, named. Nothing above says the word "refused", and part of this answer is a refusal:
    a person who asked for everything to go is not getting everything to go. */
 const conflicting = retainedHoldings(anchors, { vetted }).filter(entry => entry.basis.conflictsWithErasure);
 if (conflicting.length && anchors.requestedAt) {
  const lines = conflicting.map(entry => {
   const when = entry.disposalOn === null
    ? entry.basis.anchor === 'never'
     ? 'no disposal date — see the ground above'
     : 'no disposal date can be worked out yet, because what it counts from has not happened'
    : `disposed of on or after ${asDate(entry.disposalOn)}`;
   return `  · ${entry.holding.label} — ${entry.basis.name}. ${entry.basis.authority} ${when}.`;
  });
  parts.push(
   'Some of this could not be deleted, and that is a partial refusal of your request rather than an oversight. '
   + 'POPIA section 24 gives you a right to have information deleted; section 14 requires information to be kept where '
   + 'another law requires it or while it is still needed for the purpose it was lawfully collected for. Where those two '
   + 'point in opposite directions, the duty to keep wins for as long as it lasts, and then it stops:\n'
   + lines.join('\n')
   + '\n\nYou may take a refusal, including this one, to the Information Regulator. Nothing in this answer is legal advice, '
   + 'and where a period above is MyThuso\'s own setting rather than something an Act states, it says so.'
  );
 }
 return parts.join('\n\n');
}

/**
 * The clinical retention rules, named for a person who asks about them.
 *
 * Nothing in this service is held on any of them today. The list exists so that the answer to "what
 * happens to my health record" is the rules that will apply rather than an absence, and so that
 * nobody mistakes "we hold no clinical record" for "erasure will reach a clinical record".
 */
export const clinicalRetentionRules = (): RetentionBasis[] => RETENTION_BASES.filter(basis => !basis.inUse);

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
