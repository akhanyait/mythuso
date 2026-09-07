/**
 * The credential verification layer: what an issuing authority says, held apart from what a reviewer
 * decided.
 *
 * ── The gap this names, and does not close ───────────────────────────────────────────────────
 *
 * vetting/index.ts has said it in its own header since the vault landed: no credential is checked
 * against an issuing authority. "Verified" means a named reviewer looked at a document the platform
 * can still produce and said so. That is a workflow worth having, and it is not the SANC register
 * confirming anything.
 *
 * This file does not close that gap. Nothing here can, because the gap is commercial rather than
 * technical: SANC publishes no API, SAPS access needs a partner agreement, Home Affairs is reached
 * only through an accredited provider under a priced contract. What this file does is three things
 * that are worth doing before any of those land:
 *
 *  1. **It makes the integration droppable in.** One interface, one closed set of outcomes, one
 *     place per authority. When an agreement is signed, an adapter changes and nothing else does.
 *  2. **It records the state of each one honestly, as data.** Every adapter carries what a real
 *     integration would need — which body, whether an API exists at all, what agreement or
 *     accreditation is required, what a call costs in wall-clock time, and what MyThuso must hold to
 *     make it. That is readable by the console, by the docs and by an auditor, rather than being a
 *     paragraph somebody wrote once.
 *  3. **It makes `not-integrated` a first-class answer.** It is not an error and it is not a
 *     failure: it is the true state of every authority in the catalogue today, and a layer that
 *     modelled it as an exception would be a layer that swallowed it.
 *
 * ── Why the word is `confirmed` and not `verified` ───────────────────────────────────────────
 *
 * A reviewer verifies. An authority confirms. They are different facts about the same check and the
 * whole point of this module is that they must not be read as one — so they do not share a word,
 * they do not share a table, and they do not share a field. A party can be reviewer-verified and
 * authority-unconfirmed, and that is exactly today's state for every party on the platform. The
 * sentence the vault composes says which one it means, every time.
 *
 * ── Fail closed, in the one place it costs something ─────────────────────────────────────────
 *
 * An adapter that cannot reach its authority returns `unavailable`. Never `confirmed`, never
 * silence, and never the previous answer dressed up as a fresh one. That is inconvenient in exactly
 * the case where it matters: a register that is down on the morning somebody is being dispatched.
 * The alternative — treating an unreachable register as agreement — is how a lapsed registration
 * survives a re-verification sweep, which is the failure this layer exists to make impossible.
 */
import { randomUUID } from 'node:crypto';
import catalogue from '../../../../packages/catalog/vetting.json' with { type: 'json' };

/**
 * What an authority can say. A closed set, and small on purpose.
 *
 * `not-integrated` sits in it rather than beside it. A layer where "we have no way of asking" is an
 * exception, a null, or a thrown error is a layer whose callers each decide for themselves what
 * that means — and the tempting decision, at half past four on a Friday, is that it means fine.
 */
export const AUTHORITY_OUTCOMES = ['confirmed', 'not-found', 'mismatch', 'expired', 'unavailable', 'not-integrated'] as const;
export type AuthorityOutcome = typeof AUTHORITY_OUTCOMES[number];

/** The one outcome that is a confirmation. Written out so no caller has to decide it again. */
export const isConfirmation = (outcome: AuthorityOutcome): boolean => outcome === 'confirmed';

/**
 * What an authority said, once.
 *
 * `reference` identifies the *check*, not the credential. A person asking "where did this
 * confirmation come from" is asking about the enquiry MyThuso made, and the enquiry is the thing
 * that has to be traceable to a log entry, a provider job and, eventually, an invoice line. The
 * credential itself is deliberately not in here — see the note on Credential.
 */
export type AuthorityAnswer = {
 authority: string;
 outcome: AuthorityOutcome;
 checkedAt: number;
 reference: string;
 /** In the words a person reads. Never a credential value, and never a provider stack trace. */
 detail: string;
 /** Where the authority states its own validity date. Null where it says nothing, which is usual. */
 expiresOn: string | null;
};

/**
 * What is handed to an adapter in order to ask.
 *
 * The credential value is passed through and **never written down by this layer**. A SANC number is
 * not much of a secret; a South African identity number is the raw material of impersonation, and a
 * verification layer that accumulated one row per enquiry would quietly become the most attractive
 * table in the database. So the answer records the authority, the outcome, the moment and the
 * enquiry reference, and the number goes to the authority and nowhere else.
 */
export type Credential = {
 evidenceId: string;
 partyId: string;
 checkId: string;
 authority: string;
 /** As entered — a SANC registration, a CIPC number, a policy number. May be absent. */
 reference: string | null;
 /** Where the authority needs a name to answer at all. Not stored. */
 subjectName?: string | null;
 issuedOn?: string | null;
 expiresOn?: string | null;
};

/**
 * What a real integration with this authority would still need.
 *
 * Structured rather than prose because it is asked as a question — "what is left before SAPS is
 * real" — by people who are not reading this file: the Information Officer, an auditor, an investor
 * doing diligence, and the person writing next quarter's plan. A paragraph answers none of them
 * twice the same way.
 */
export type IntegrationStanding = {
 /** True only where an answer can actually be obtained today. One of twelve, at most. */
 integrated: boolean;
 /** The body that would answer, in its own name. */
 body: string;
 /** Whether a machine-readable route exists at all, before anybody signs anything. */
 route: 'none' | 'public-form' | 'customer-account' | 'partner-agreement' | 'accredited-provider';
 /** The agreement, accreditation or account that has to exist first. */
 needs: string;
 /** What one enquiry costs in wall-clock time, which is what decides whether it can be automated. */
 latency: string;
 /** What MyThuso has to hold — a key, a customer code, a consent, a set of fingerprints. */
 holds: string;
 /** The honest sentence, including what MyThuso has decided not to do. */
 note: string;
};

/**
 * One authority, one adapter.
 *
 * `check` is asynchronous because every real one is, and because an adapter that had to be
 * synchronous would be an adapter nobody could implement without a queue in front of it.
 */
export interface AuthorityVerifier {
 readonly authority: string;
 readonly standing: IntegrationStanding;
 check(credential: Credential, at: number): Promise<AuthorityAnswer>;
}

/** The enquiry's own identity. Prefixed with the authority so a log line says who was asked. */
export const enquiryReference = (authority: string): string => `${authority}:${randomUUID()}`;

/** One answer, assembled. Every adapter goes through this rather than composing the object itself. */
export function answer(
 authority: string, outcome: AuthorityOutcome, at: number, detail: string,
 options: { reference?: string; expiresOn?: string | null } = {}
): AuthorityAnswer {
 return {
  authority, outcome, checkedAt: at,
  reference: options.reference ?? enquiryReference(authority),
  detail, expiresOn: options.expiresOn ?? null
 };
}

/* The catalogue's own list, read rather than restated. An authority added to
   packages/catalog/vetting.json without an adapter is a check nothing can ever ask about, and the
   registry below refuses to be built rather than letting it be discovered a year later. */
type CatalogueAuthority = { id: string; name: string; short: string; verifies: string };
const AUTHORITIES = new Map<string, CatalogueAuthority>(
 (catalogue.authorities as readonly CatalogueAuthority[]).map(authority => [authority.id, authority] as const)
);
const bodyName = (id: string): string => AUTHORITIES.get(id)?.name ?? id;

/**
 * An adapter for an authority MyThuso cannot ask.
 *
 * It answers `not-integrated` every time, immediately, and it carries the standing that says what
 * would change that. It is not a placeholder for a fetch somebody will fill in: a fake fetch to an
 * endpoint nobody has documented would be worse than no fetch at all, because it would look from
 * the outside exactly like an integration and would fail as `unavailable` rather than as the truth,
 * which is that there is nothing on the other end.
 */
function unreachable(authority: string, standing: Omit<IntegrationStanding, 'integrated' | 'body'>): AuthorityVerifier {
 const full: IntegrationStanding = { integrated: false, body: bodyName(authority), ...standing };
 return {
  authority,
  standing: full,
  check: async (_credential, at) => answer(authority, 'not-integrated', at,
   `${full.body} is not integrated. ${full.note}`)
 };
}

/* ---- The eleven ------------------------------------------------------------------------------
   Each of these is a partner agreement, a customer account or an accreditation away, and each says
   which. They are written in the order packages/catalog/vetting.json lists them. */

/* SANC. The register is public and it is a web form: type a registration number into
   sanc.co.za and it tells you whether the person is registered and in what category. There is no
   API behind it and SANC has never published one. Bulk employer verification exists and is a
   written request to the registration department on a letterhead, answered in days.
   The thing MyThuso is deliberately not doing: scraping that form. It would work, it would be
   fast, and it would be a confirmation resting on an HTML layout that can change on a Tuesday
   without anybody being told — which means the platform would keep saying "confirmed against the
   SANC register" long after it had stopped reading the register at all. */
const SANC = unreachable('sanc', {
 route: 'public-form',
 needs: 'A written bulk-verification arrangement with the SANC registration department, on a MyThuso letterhead, naming the person authorised to ask.',
 latency: 'Days. A written verification is answered by a person, and MyThuso has no way to make that faster.',
 holds: 'The registration number, the full names as registered, and the nurse\'s consent to be verified.',
 note: 'The public register is a web form with no API. Scraping it is possible and is refused: a confirmation that rests on somebody else\'s page layout is one that goes on being asserted after it has stopped being checked.'
});

/* HPCSA. iRegister is the public search and, like SANC's, it is a page rather than an endpoint.
   The Council answers written verification requests, and the practical route for an employer is
   its bulk verification service, which is an account and a fee per enquiry rather than a key. */
const HPCSA = unreachable('hpcsa', {
 route: 'public-form',
 needs: 'An HPCSA employer verification account, applied for in writing, with a named authorised requester and a per-enquiry fee.',
 latency: 'Days for a written verification. iRegister answers a person in seconds and answers nothing else.',
 holds: 'The registration number, the practitioner\'s full names, and their consent.',
 note: 'The same shape as SANC and the same refusal: iRegister is not an API, and treating a page as one would be asserting a confirmation MyThuso is not making.'
});

/* SAPC. Pharmacies and responsible pharmacists are both on the Council's register, which is
   published as a searchable list and as periodic downloadable rolls. A downloaded roll is a real
   option and a bad one on its own: it is a snapshot, it ages the moment it is saved, and a
   suspension between editions is invisible to it. */
const SAPC = unreachable('sapc', {
 route: 'public-form',
 needs: 'A written verification arrangement with the South African Pharmacy Council, or a licensed feed of the register rather than a downloaded roll.',
 latency: 'Days by written enquiry.',
 holds: 'The Y-number, the premises name and the responsible pharmacist\'s own registration.',
 note: 'The published roll would be easy to load and would answer as at the day it was published. A suspension between editions is exactly the event this check exists to catch, so a roll on its own is refused as a source of confirmation.'
});

/* SANAS. Accreditation is published as a schedule per facility — a PDF listing the tests the
   laboratory is accredited for. Confirming a *test scope*, which is what the laboratory role
   actually owes, means reading that schedule. There is a directory and there is no query interface,
   and the document is the authoritative artefact rather than any index of it. */
const SANAS = unreachable('sanas', {
 route: 'public-form',
 needs: 'A verification arrangement with SANAS, or a document-exchange agreement with the laboratory\'s accreditation manager for the current schedule.',
 latency: 'Days. A schedule is issued as a document and is checked by reading it.',
 holds: 'The facility number, and the mapped list of tests MyThuso offers from that laboratory.',
 note: 'The check that matters is not "is this laboratory accredited" but "is this test on its schedule". No index answers the second question; only the schedule does.'
});

/* SAPS. The slowest of the twelve to onboard and the one with the most to it. The Criminal Record
   Centre answers on fingerprints, not on a name and an identity number, so an integration is not a
   request MyThuso makes from a server — it is an accredited capture site, a set of prints, a
   consent, and a wait. In practice this is done through a screening bureau accredited for
   fingerprint submission, which is a contract and a per-check fee. */
const SAPS = unreachable('saps', {
 route: 'partner-agreement',
 needs: 'A contract with a SAPS-accredited screening bureau, or direct AFIS submission access, which requires a SAPS partner agreement and accreditation of the capture process itself.',
 latency: 'Weeks. Prints are captured in person, submitted in batches and answered by the Criminal Record Centre; a clearance ordered in the week it is needed is a nurse who stops being dispatchable.',
 holds: 'Fingerprints captured at an accredited site, the person\'s written consent to the check, and their identity document.',
 note: 'This is the reason the police-clearance check renews on twenty-four months and warns at forty-five days rather than fourteen. Nothing MyThuso builds shortens it.'
});

/* CIPC. The one authority in the catalogue with something that is genuinely an API: the CIPC
   enterprise enquiry service, reached with a customer code and prepaid credit. It is not open —
   it needs a CIPC customer account in MyThuso's name — but it needs no partner agreement and no
   accreditation, which makes it the cheapest of the eleven to make real and a sensible first one. */
const CIPC = unreachable('cipc', {
 route: 'customer-account',
 needs: 'A CIPC customer code with prepaid enquiry credit, registered to MyThuso, and the enquiry service enabled on it.',
 latency: 'Seconds. This is the one that could run unattended on a sweep.',
 holds: 'The customer code and its credentials, and the registration number being asked about.',
 note: 'Of the eleven, this is the shortest path to a real confirmation: an account and a payment rather than an agreement and an accreditation. It confirms that the company exists and who its active directors are; it does not confirm that the person signing for it is one of them, which is what the signatory check is separately for.'
});

/* RTMC. Licence and professional driving permit status live in eNaTIS, which is operated under the
   RTMC and reached by registered eNaTIS users under an agreement — traffic authorities, testing
   centres, and a small set of commercial users. There is no public route and no accredited-provider
   market of the kind Home Affairs has. */
const RTMC = unreachable('rtmc', {
 route: 'partner-agreement',
 needs: 'Registration as an eNaTIS user under an RTMC agreement, which is granted for a stated operational purpose rather than on application.',
 latency: 'Seconds once granted. Months to be granted, if at all.',
 holds: 'The eNaTIS user credentials, the licence number and the driver\'s consent.',
 note: 'The likeliest real answer here is not an integration but the courier presenting the card at a Corner and somebody vetted looking at it — which is what the check does today, and it is worth saying that out loud rather than leaving an integration on a roadmap it will never leave.'
});

/* SAHPRA. Section 22C licences and Section 22A authorities are issued as certificates and SAHPRA
   publishes lists of licence holders as documents. There is no enquiry endpoint. A licence
   suspended between publications is invisible to the published list, which is the same weakness
   the SAPC roll has and the same reason it is not accepted as a source. */
const SAHPRA = unreachable('sahpra', {
 route: 'public-form',
 needs: 'A written verification arrangement with SAHPRA\'s licensing division.',
 latency: 'Days to weeks. SAHPRA\'s own turnaround on licensing correspondence is the constraint.',
 holds: 'The licence reference and the premises or practitioner it was issued to.',
 note: 'Published licence-holder lists exist and are a snapshot. A suspension between editions is the event worth catching, so the list is treated as a lead rather than as a confirmation.'
});

/* The indemnity insurer. There is no register at all: cover is confirmed by the insurer or the
   broker who placed it, one at a time, usually by email against a policy number. A dozen insurers
   is a dozen integrations with nothing in common, and the market has no standard between them.
   The honest plan is not an integration; it is a broker relationship that answers a list. */
const INSURER = unreachable('insurer', {
 route: 'none',
 needs: 'A confirmation arrangement with each insurer or with one broker acting across them. There is no central register of professional indemnity cover in South Africa.',
 latency: 'Days, by email, per insurer.',
 holds: 'The policy number, the insured\'s name, and the scope of practice the cover has to name.',
 note: 'The check is not "is there a policy" but "does it name telemedicine and asynchronous review", which is a reading of the schedule rather than a lookup. No integration answers that, and one that claimed to would be answering an easier question than the one asked.'
});

/* The issuing institution. Two routes and neither is an endpoint: the university's own records
   office, one institution at a time, or SAQA's National Learners' Records Database through a
   verification agency, which is an account and a fee. The NLRD route is the one that scales and it
   is a commercial arrangement rather than an open service. */
const INSTITUTION = unreachable('institution', {
 route: 'partner-agreement',
 needs: 'An account with a SAQA-approved verification agency for NLRD enquiries, or a records-office arrangement per institution.',
 latency: 'Days to weeks. An agency answers in days; a records office answers when it answers.',
 holds: 'The certificate number, the qualification, the year and the graduate\'s consent.',
 note: 'Foreign qualifications fall outside both routes and go to SAQA for evaluation, which takes months. A layer that quietly returned not-found for them would be reporting a fraud where there is a queue.'
});

/* MyThuso itself. Training records, references, undertakings and inspections — the things the
   platform holds because the platform did them.
   This one is `not-integrated` for a reason worth stating rather than a missing one: there is no
   external authority to ask. MyThuso confirming a MyThuso record against MyThuso is not
   confirmation, it is the same claim said twice, and returning `confirmed` here would put a
   confidence on the internal checks that nothing outside this platform has ever agreed with. The
   reviewer's decision is the whole of the evidence for these, and the vault already records that
   honestly. */
const INTERNAL = unreachable('internal', {
 route: 'none',
 needs: 'Nothing. There is no issuing authority outside MyThuso, so there is nobody to integrate with.',
 latency: 'Not applicable.',
 holds: 'The training record, the signed undertaking or the inspection report — all of which are already in the vault.',
 note: 'This stays not-integrated permanently and on purpose. An internal check confirmed by the platform that performed it is not independently confirmed, and marking it confirmed would be the platform vouching for itself in a field built to hold somebody else\'s word.'
});

/* Home Affairs. The one with a genuine commercial path, and the one adapter built for real — see
   identityProvider.ts. The National Population Register is not reached directly by a private
   company: it is reached through a provider accredited for identity verification, under a contract
   and per query. Until that contract exists this stub stands in its place, which is what keeps the
   platform saying "not integrated" rather than "sandbox" when nothing is configured. */
const DHA = unreachable('dha', {
 route: 'accredited-provider',
 needs: 'A contract with an accredited identity-verification provider — the adapter in identityProvider.ts is written to one such provider\'s shape — plus a partner id and an API key. Home Affairs does not sell direct access to a company of this size.',
 latency: 'Seconds to minutes for the provider\'s answer, plus however long the person takes over the selfie. The answer arrives on a callback rather than on the request.',
 holds: 'A partner id, an API key held in the service environment, and a callback URL the provider can reach. The identity number itself is entered by the person into the provider\'s own flow and never passes through this service.',
 note: 'The adapter is built: signed requests, a signature-verified idempotent callback, a sandbox that runs without secrets, and a refusal to sandbox in production. What is missing is a contract and a key, which is the only honest thing left to be missing.'
});

/* SATI. The accrediting body for the SASL interpreting check, and the one adapter here whose
   *authority* is drafted rather than only its integration. SATI runs an accreditation examination
   and publishes a member directory; MyThuso has written the interpreter's accreditation check
   against that route and nobody at SATI, DeafSA or PanSALB has confirmed that it is the right one.
   So this adapter says two things are missing rather than one, which is the honest count: an
   arrangement to ask, and an answer about whether SATI is who to ask. */
const SATI = unreachable('sati', {
 route: 'none',
 needs: 'First, confirmation from SATI — or from whoever actually accredits South African Sign Language interpreters — that accreditation runs through them at all. Then a confirmation arrangement with that body. The published member directory is a snapshot and shows membership rather than accreditation standing.',
 latency: 'Unknown, because the route is unknown. A directory lookup would be seconds; a written confirmation would be days.',
 holds: 'The membership or accreditation number as it appears on the certificate, and the interpreter\'s name. MyThuso deliberately holds no assumption about the number\'s format — guessing one is how a real interpreter is told their real number is invalid.',
 note: 'This is the only authority in the register whose identity is a draft. If SASL accreditation runs elsewhere, this row is the wrong one and the check hanging on it is the wrong check — which is written down here, in the vetting contract and on the interpreter screen, so it can be corrected by somebody who knows rather than discovered by an interpreter who is refused.'
});

const STUBS: readonly AuthorityVerifier[] = [SANC, HPCSA, SAPC, SANAS, SAPS, DHA, CIPC, RTMC, SAHPRA, INSURER, INSTITUTION, SATI, INTERNAL];

/**
 * The registry, checked while it is built.
 *
 * An authority in the catalogue with no adapter is a check nothing can ever be asked about; an
 * adapter naming an authority the catalogue does not have is an adapter nothing will ever call.
 * Both are holes rather than typos, so both stop the service rather than being found later.
 */
export function authorityVerifiers(replacements: Record<string, AuthorityVerifier> = {}): Map<string, AuthorityVerifier> {
 const verifiers = new Map<string, AuthorityVerifier>(STUBS.map(verifier => [verifier.authority, verifier] as const));
 for (const [id, verifier] of Object.entries(replacements)) {
  if (!AUTHORITIES.has(id)) throw new Error(`There is no authority "${id}" in packages/catalog/vetting.json, so an adapter for it would never be called.`);
  if (verifier.authority !== id) throw new Error(`The adapter registered for ${id} says it verifies ${verifier.authority}. One of the two is wrong and the gate is not the place to find out which.`);
  verifiers.set(id, verifier);
 }
 for (const id of AUTHORITIES.keys()) {
  if (!verifiers.has(id)) throw new Error(`packages/catalog/vetting.json lists the authority "${id}" and there is no adapter for it. A check nobody can ask about is one that quietly rests on the reviewer for ever.`);
 }
 return verifiers;
}

/**
 * How much of this is real, in numbers, for the health check and for anybody being told about it.
 *
 * It counts what is actually wired at the moment it is asked rather than what a document claims,
 * which is the difference between a figure and a sentence somebody forgot to update.
 */
export function integrationSummary(verifiers: Map<string, AuthorityVerifier>): {
 total: number; integrated: string[]; notIntegrated: string[]; sentence: string;
} {
 const integrated: string[] = [];
 const notIntegrated: string[] = [];
 for (const [id, verifier] of [...verifiers].sort(([a], [b]) => a.localeCompare(b))) {
  (verifier.standing.integrated ? integrated : notIntegrated).push(id);
 }
 const total = verifiers.size;
 const sentence = integrated.length === 0
  ? `None of the ${total} issuing authorities in the catalogue is integrated. Every check on this platform rests on a reviewer having read a document, and no register has confirmed anything.`
  : `${integrated.length} of ${total} issuing authorities are integrated (${integrated.join(', ')}). The other ${notIntegrated.length} answer not-integrated: those checks rest on a reviewer having read a document, and no register has confirmed them.`;
 return { total, integrated, notIntegrated, sentence };
}
