# Privacy and security implementation plan

This is a requirements and release-gate document, not a claim that the UI is POPIA-compliant. POPIA is the Protection of Personal Information Act; health information is special personal information. Determine the lawful basis and applicable authorisation for each processing purpose with the Information Officer and qualified South African counsel. Do not treat one checkbox as permission for every use.

Authoritative starting points: [Information Regulator POPIA resources](https://inforegulator.org.za/popia/), [special personal information provisions, including section 32](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-b-processing-of-special-personal-information/), [guidance on special personal information](https://inforegulator.org.za/wp-content/uploads/2020/07/InfoRegSA-GuidanceNote-Processing-SpecialPersonalInformation-20210628.pdf), [prior authorisation](https://eservices.inforegulator.org.za/priorauthorisation/default.aspx).

| Control | Preview now | Required before real information |
|---|---|---|
| Data minimisation | Fictional fixtures; memory-only state; no analytics | Purpose/field inventory, minimum collection, privacy impact assessment |
| Identity | **Built** in `apps/api`: one-time-code sign-in, peppered hashes for codes and sessions, attempt burning, rate limits per number and per address, no account enumeration, sliding idle and hard absolute session limits, append-only auth audit, and production refusals for a weak pepper, an http origin or no SMS provider. Plus **a second factor**: TOTP (RFC 6238) on `node:crypto`, its secret encrypted at rest, enrolment inactive until a code is typed back, hashed single-use recovery codes, and a sign-in that has answered the one-time code but still owes an authenticator code holding a ten-minute challenge rather than a session. Step-up is never demanded of an account with no second factor enrolled. Plus the sign-up preview with local check-digit validation and three account-recovery routes as designed states | OIDC, **a contracted** Home Affairs verification provider — the adapter is now built (`apps/api/src/vetting/identityProvider.ts`: signed requests, a signature-verified idempotent callback, a replay window, a sandbox that runs without secrets, and a refusal to sandbox in production) and it has never spoken to a provider, because none has been contracted and no key exists — clinician verification, guardian authority, device binding and an audited, reversible recovery process. **Designed, not wired:** which roles must carry a second factor derives from the vetting grants `prescribe`, `sign-clinical-review`, `dispense`, `release-lab-result` and `view-patient-record` (`apps/api/src/stepUp.ts`), and the service does not yet know about roles at all |
| Authorisation | Twelve vetted parties, and a capability each is refused by name until its checks pass — dispatch, clinical sign-off, prescribing, dispensing, result release, sample custody, guardian access and the rest. **Built** in `apps/api/src/vetting`: the evidence vault, the lifecycle and the refusals now run on the server, and the gate resolves an actor's standing out of stored evidence on every single read, so a lapsed clearance withdraws a capability with nobody having to notice first. What is still interface-only is everything the server has no records for — patients, visits, care relationships. **And the one decision nobody reviews is now an operator act rather than a code path**: seeding the first two reviewers, who by definition have nobody to clear them, takes a signed single-use authorisation minted at a console, names the parties and the two people deciding, expires in fifteen minutes, cannot be reached from any route, and marks every check it decided as standing on it until a real reviewer decides it again **And a credential verification layer that verifies nothing yet, and says so**: one adapter per issuing authority in `apps/api/src/vetting/authority.ts`, a closed set of outcomes in which `not-integrated` is a first-class answer rather than an error, an authority's answer recorded in its own table beside — never inside — the reviewer's decision, a party's standing that composes the sentence "cleared by review, with no authority confirmation" for as long as that is true, and a re-verification sweep (`npm run reverify -w @mythuso/api`) that is a dry run unless committed. **Twelve of the twelve authorities answer `not-integrated` today** | Server-side deny-by-default object/tenant/relationship checks over clinical records, which do not exist yet; an audited break-glass process (the gate's break-glass route is built and refuses to write anything at all); **and an actual integration with any of the twelve authorities**, eleven of which need an agreement, an accreditation or a customer account that does not exist, and the twelfth of which needs a contract with an accredited identity provider |
| Consent | **Built** in `apps/api/src/consent`: consent to a *version* of a *purpose*, never a boolean on a person; the SHA-256 of the exact wording and the withdrawal sentence stored as the proof, so the words cannot be edited out from under a recorded consent; a decision refused outright where it names wording that is no longer in force, and an existing consent to superseded wording that authorises nothing until the person is asked again; withdrawal as one call with no reason required, recorded as an entry of its own, answering with what is kept anyway and the ground for each; and the required consents care depends on separated from the optional ones structurally — an optional purpose has no route to the care decision at all, and the contract refuses to load one that admits to degrading care. Beside it a **clinical access log** distinct from the auth log: who opened whose record, when, under what lawful basis and what capability, refusals included, carrying the id of the gate's own chain entry for the same decision, and readable in full by the person whose record it is. `packages/catalog/consent.json` holds the purposes, the versions, the required/optional split and every refusal, withdrawal and retention sentence; web and the service read it, and nothing restates it. Plus the earlier preview: optional switches, sharing preview, and spoken visit consent that records refusal as a valid outcome | Recipient, scope and expiry per grant, and downstream propagation to anybody the information was given to — none of which exists, because no clinical record and no recipient does. Guardian consent for a minor as a proven authority rather than a recorded route. A determination by the Information Officer and counsel of the lawful basis this file has *named* for each purpose |
| Family care | Guardian invitation preview in which scope, duration and identity verification are three separate decisions, revocable, with sensitive categories excluded from every scope | Verify guardianship and delegated authority with proof; no record access merely because someone pays; a record of the child's own views as they grow older |
| Export | Explicit export of a fictional sample | Step-up identity check, scoped export, audit, expiry and secure delivery |
| Deletion/correction | **Built** in `apps/api`: a holdings register classifying every table `erase`/`anonymise`/`retain`, each with a plain-English ground written for the data subject and each naming a **retention basis** — what keeps it, from when, under which instrument, and whether it pulls against section 24. Disposal dates are derived from the basis and its anchor, and are *null* wherever no honest date can be worked out. The section 24 thirty-day clock runs from receipt; erasure has a seven-day grace period, an immediate sign-out and a tombstone that is unique and unreachable (RFC 2606 `.invalid`, and not a number that could be dialled); the retention sweep is a dry run unless committed. The answer names what could **not** be erased and calls it a partial refusal in that word, with the ground and the disposal date, and points at the Information Regulator. The clinical retention rules — six years from the last entry, a minor's record until twenty-one, mental health and occupational health longer again — are modelled and marked as holding nothing, because nothing clinical is held here. Acknowledgement preview on web. The intake ledger is registered like everything else — the receipt that an entry arrived, and anything a clinician still has to decide about, both on a `capture-receipt` basis anchored on the day it arrived rather than on what the device claimed, because a disposal date computed off a device's clock is not a date. **An entry still waiting for a decision is never disposed of**, whatever its age: a question that has been open for a year is a question somebody owes an answer to, and sweeping it away would answer it by deletion | The clinical bases attached to actual clinical holdings, once any exist; correction as distinct from deletion; an operator queue and proof of response; and a determination by the Information Officer and counsel of every period this register currently records as MyThuso's own setting |
| Audit | Sample access timeline including a guardian access event; append-only incident log in the Control Tower preview. **Built** in `apps/api/src/protection/audit.ts`: a hash chain keyed from the key ring, so an edited, deleted, re-ordered or forged entry is detectable and `verify()` names the first break — tamper-evident, not tamper-proof. **The vetting decision log is now that chain rather than a preview**: every enrolment, submission, verification, second reviewer, decline, suspension and detected substitution is an entry in it, and two append-only logs would have been one append-only log and one table somebody eventually tidies. The audit key is pinned to the oldest key version, so a key rotation does not make the whole log stop verifying. The bootstrap has its own kinds — `vetting.bootstrap.opened`, `.enrolled`, `.verified`, `.closed` and `.refused` — so the founding of the register, and every attempt that was turned away, is one grep rather than a reconstruction. So does the verification layer — `vetting.authority.answered`, `.contradiction`, `.refused`, and `vetting.identity.session.opened`, `.callback.refused`, `.callback.repeated` — so every enquiry MyThuso made of an authority, every answer including "there is no way to ask", and every forged callback is in the chain. **And so does offline capture** — `capture.accepted`, `capture.conflicted`, `capture.refused`, `capture.replayed`, `capture.settled.*`, `capture.disposed` and one `capture.conflict.<kind>` per detected disagreement — so "how often does a device clock go wrong" and "how many entries did that clinic have held last month" are a grep rather than a reconstruction. **Not one of those entries carries a reading**, and it is not left to whoever writes the next caller: the chain takes an allowlist of fields and throws on anything outside it | Publishing the chain head somewhere the operator does not control, which is what turns evidence of tampering into evidence somebody else can check |
| Encryption | **Built** in `apps/api/src/protection`: AES-256-GCM with a per-record data key wrapped under an HKDF-derived key, the record's identity in the associated data so a ciphertext cannot be moved between patients, blind indexes for search without decryption, and versioned root keys so a rotation re-wraps rather than re-encrypts. **And rotation as an operation**: `npm run rotate -w @mythuso/api` walks every registered column of sealed values, re-wraps what is on an old key in small transactions, reports what is left from an indexed `key_version` column, and is a dry run unless committed — resumable and idempotent, with no cursor to lose. Every vetting document in the service goes through it. Cleartext disabled on Android. See [Data protection](DATA-PROTECTION.md) | An HSM or KMS, split-knowledge key custody, per-patient key derivation, and re-encryption — which is what a *compromised* key needs, and which rotation is not |
| Residence/transfers | No cloud deployment | Prefer SA regions as a project choice; assess every operator/subprocessor and cross-border transfer under section 72 and applicable prior-authorisation requirements. POPIA is not a blanket SA-only hosting rule. |
| Clinical AI | No model or inference. Out-of-range readings are flagged against indicative adult reference ranges and labelled in the UI as not a validated early-warning score | Validated intended use, provenance, review state, model/version audit, clinician sign-off, incident monitoring; no autonomous diagnosis |
| Devices | No device access. The permission-denied state is designed, and declining never blocks a visit | Applicable registration/exemption assessment, validated readings, signed firmware and secure pairing |
| Incidents | Severity triage, immediate-action choice, handover note and demo log; a critical severity states that the form never precedes calling emergency services | Detection, containment, investigation, real paging, and notifications under applicable law; rehearsed playbooks and accountable owners |
| Research and marketing | Off by default in preview | Separate purpose assessment; no assumption that pseudonymised health data is anonymous |

## What the service does and does not hold

`apps/api` holds a mobile number, a name if one was given, and — for an account that has set one up
— the encrypted secret its authenticator app shares with it, plus hashed recovery codes. Since the
vetting module it also holds, **for a party MyThuso vets and for nobody else**, the certificates and
clearances behind that party's checks: a SANC receipt, a police clearance, an identity document, a
diploma, a schedule of cover. Since offline capture it holds one thing more, and it is the one most
easily mistaken for a clinical record: the **intake ledger**, which says that an entry arrived —
which device, which capturer, against which record and which part of it, what the device believed
the time was, what the server's time was, where it sits in the order, and what it was told. It holds
no reading. Every table of all of it is listed, classified and explained in
`apps/api/src/personalData.ts`, in the words that go to the data subject.

Under POPIA all of that is personal information; none of it is the special personal information that
health data is. A police clearance is a document about somebody's history, not a clinical finding,
and a SANC registration is a fact about who may practise rather than about anybody's treatment. That
distinction is the whole reason this slice could be built before the rest of the controls in this
document exist, and adding workforce evidence did not move it — which is why the boundary check that
fails the build on a clinical table was not touched, and why `apps/api/src/config.ts` still says the
service holds no health information.

Being outside the special category is not a reason to hold it loosely, and it is not held loosely.
Every document is sealed by the protection module against the record and version it belongs to; every
read goes through the gate, is decided against the reader's own current vetting standing, and is
written into the hash chain before any plaintext exists; and every version carries a SHA-256 of the
file that was submitted, so a document substituted afterwards is refused rather than shown. What is
*not* built is any verification against an issuing authority: nothing calls SANC, HPCSA, SAPS or Home
Affairs, no verification provider has been contracted, and "verified" in this service means a named
reviewer looked at a document the platform can still produce and said so. The section below says what
has changed about that and, more importantly, what has not.

It is enforced rather than trusted: `scripts/check-boundaries.mjs` fails the build if a clinical
table appears in the service, if the audit table is ever updated or deleted from, or if the service
stops declaring what it holds.

Before any health information reaches a server, the rest of this document applies in full —
PostgreSQL with encryption at rest and key separation, SA hosting, step-up authentication before
records, sharing and export, an append-only clinical access log distinct from the auth log, an
Information Officer, and a data protection impact assessment.

## Verified by a reviewer, confirmed by nobody

This is the largest gap between what `apps/api/src/vetting` is and what a compliance control would
be, and it has not been closed. **Not one credential on this platform has been confirmed by the body
that issued it.** Twelve issuing authorities appear in `packages/catalog/vetting.json`; the running
service reports all twelve as `not-integrated`, and `GET /health/verification` counts them from the
adapters that actually exist rather than from this paragraph.

What has been built is the layer those integrations drop into, and the honesty that goes with it.

**A reviewer's decision and an authority's answer are different facts, and are now different data.**
A reviewer verifies; an authority confirms. They do not share a word, they do not share a table and
they do not share a field: `vetting_evidence` holds what a named reviewer decided, and
`vetting_authority_answers` holds what a register said, when, and under which enquiry reference.
Nothing in the verification layer writes to the evidence row — structurally, not by convention — so
an authority answer arriving on a webhook can never clear a check no person has looked at. A party's
standing composes the sentence for it, and today that sentence reads *"Cleared by review, with no
authority confirmation: all 8 checks rest on a named reviewer having read a document the platform can
still produce, and no issuing authority has confirmed any of them."* When one of them is confirmed,
the sentence will say which register said so, on what date. That is the point of writing the first
sentence out loud.

**`not-integrated` is an answer, not an error.** It is recorded as a dated fact — on this day, there
was still no way to ask SANC — and it lands in the hash chain like every other enquiry. A check
nobody could confirm must not look the same as one somebody did.

**Every adapter says what a real integration would need.** Which body, whether a machine-readable
route exists at all, what agreement or accreditation is required, what one enquiry costs in
wall-clock time, and what MyThuso would have to hold. The honest summary of the eleven, from the
adapters themselves:

| Authority | What exists | What it needs |
|---|---|---|
| SANC, HPCSA, SAPC, SAHPRA | A public register that is a web page, and a written verification service answered by a person | A written bulk-verification arrangement per council. MyThuso is deliberately **not** scraping the public forms: a confirmation resting on somebody else's page layout goes on being asserted after it has stopped being checked |
| SANAS | A published schedule of accreditation, per facility, as a document | The question that matters is "is this test on the schedule", which no index answers — only the schedule does |
| SAPS | Nothing reachable from a server. The Criminal Record Centre answers on fingerprints | An accredited screening bureau or direct AFIS access under a SAPS partner agreement. Weeks, and captured in person. This is why the police-clearance check warns at forty-five days rather than fourteen |
| CIPC | A genuine enquiry API behind a customer account | A CIPC customer code with prepaid credit. **The shortest path of the eleven** — an account and a payment rather than an agreement and an accreditation |
| RTMC | eNaTIS, reachable only by registered users under an agreement granted for a stated purpose | Likeliest honest answer is not an integration at all but the card presented in person, which is what happens today |
| Indemnity insurer | No central register of professional indemnity cover exists in South Africa | A confirmation arrangement per insurer or one broker across them — and the real question is whether the schedule *names telemedicine*, which is a reading rather than a lookup |
| Issuing institution | SAQA's NLRD through a verification agency, or the records office one institution at a time | An agency account. Foreign qualifications fall outside both and go to SAQA for evaluation, which takes months |
| MyThuso Clinical Governance (`internal`) | Nothing to integrate with — MyThuso is the authority | **Permanently `not-integrated`, on purpose.** An internal check confirmed by the platform that performed it is not independently confirmed, and marking it confirmed would be the platform vouching for itself in a field built to hold somebody else's word |

**Home Affairs is the twelfth, and it is the one built.** `identityProvider.ts` implements the shape
every accredited identity provider presents: an HMAC-signed request that opens a session, a hosted
flow the person completes themselves, and a signed callback carrying the answer. The signature is
verified in constant time, inside a fifteen-minute window so that a correct signature over an old
timestamp is still refused; the callback is idempotent, guarded by the store's single write rather
than by anything held in memory; the result codes map onto the closed set with anything unreadable
falling to `unavailable`; and the sandbox runs the whole flow without secrets. Whether a callback
needs a signature is decided by the session's own recorded mode, and a sandbox session cannot be
opened by a production service, so there is no arrangement of environment variables that produces a
signature-free callback in production. With no provider named, Home Affairs keeps its
`not-integrated` adapter — the service says "not integrated", never "sandbox". With one named and no
key, production refuses to start. **The identity number never passes through this service:** the
person types it into the provider's own flow, and `vetting_identity_sessions` holds no number, no
name and no image.

**Fail closed, in the place it costs something.** An adapter that cannot reach its authority returns
`unavailable`, never `confirmed` and never the previous answer with today's date on it. An adapter
that throws is `unavailable` too. Treating an unreachable register as agreement is exactly how a
lapsed registration survives a re-verification sweep.

**Re-verification is a schedule, and it is a dry run unless committed.** A document going out of date
is already handled by arithmetic on every read. This is the other failure: a registration withdrawn,
a licence suspended, an accreditation lapsed — none of which changes the certificate in the vault and
none of which sends anybody a letter. `npm run reverify -w @mythuso/api` lists what is owed and asks
nobody; `--commit --as <reviewer-id>` asks. It needs a named reviewer because every enquiry goes
through the gate and the gate decides about people: a sweep with a service identity nothing had
vetted would be the back door the gate exists to close. An answer goes stale on the check's own
renewal cadence, or after twelve months where it has none — **twelve is MyThuso's own setting, not
something an Act states**, and it is recorded as such.

**A contradiction is loud and withdraws nothing by itself.** Where a reviewer verified a check and
the authority answers `not-found`, `mismatch` or `expired`, it is written into the chain as
`vetting.authority.contradiction`, it appears in `contradictions()` and in the sweep's report, and
the party keeps their capabilities until a reviewer suspends them by name. That is a stated choice
with a stated cost: automatic withdrawal would mean a register that was briefly wrong, or an adapter
that misread a response, striking nurses off the roster at three in the morning with nobody in the
loop — and that same route would be the one an attacker reached for. Between the answer and the
reviewer reading it, the party is still dispatchable.

## Consent, and the log of who opened a record

Two things, built together because they are one question asked from two ends: a consent is a
permission to process, and the access log is the record of the processing it permitted. Neither is
a compliance control on its own, and neither is a claim that MyThuso is POPIA-compliant.

**Consent is to a version, and the version does not carry.** There is no boolean on a person meaning
"has consented" — `consent_decisions` holds one row per decision, and where somebody stands is
derived from those rows on every read, the way a vetting standing is derived from evidence. When the
wording of a purpose changes, the old consent stays exactly what it was: a valid consent, to those
words, on the register, unedited. What it does not become is a consent to the new words. The service
refuses to record a decision naming wording that is no longer in force, refuses to act on one held at
a superseded version, and says which version the person agreed to, which is in force, and what
changed. `packages/catalog/consent.json` carries the sentence for each change, so the reason a person
is being asked again is the reason rather than "our terms have been updated".

**The proof is the fingerprint of the words, not a pointer to them.** A stored consent that carries a
foreign key to a wording row is a consent somebody can edit into a consent to something else,
afterwards, without touching the consent record. So what is stored is the SHA-256 of the exact
wording *and* the withdrawal sentence the person was shown, with the purpose and version in the
digest. The honest limit is stated in the module: a hash proves those words were shown to anybody who
still has the words, and the words live in a version-controlled contract file. It does not survive
that file being rewritten and its history discarded.

**Withdrawal is one call, and it is an entry.** No reason is asked for, no second factor is demanded,
there is no confirmation endpoint, and the screen shows what withdrawing does not undo *before* the
person touches anything rather than behind a step — which is what keeps it as cheap as the tick was.
A withdrawal is a new row rather than an edit of the row that gave it, because "never consented" and
"consented and then stopped" are different facts and only one of them is true. And it is not
deletion: what is kept afterwards is named, in the words the person reads, with the ground and the
instrument — a health record kept for six years from its last entry, and the log of who opened it
while the consent stood.

**Required and optional are separated structurally.** An optional consent has no route to the care
decision: `careStanding()` consults the required purposes and nothing else, the contract refuses at
start-up to load an optional purpose that admits to degrading care, and
`scripts/check-boundaries.mjs` fails the build on one. `apps/web/src/features/Onboarding.tsx` already
separated the two at sign-up; the check now holds the two in step, so a purpose that is really
compulsory cannot be presented as a choice on one surface and a condition on the other. Reading a
notice is separated from agreeing to something as well — the POPIA section 18 notification is
recorded as an *acknowledgement*, cannot be withdrawn, and is never counted as consent to a purpose.

**The access log is not the sign-in log.** `audit` answers "who signed in, from where, and was the
code right". `record_access_log` answers "who opened whose record, when, under what lawful basis and
what capability, and were they allowed to". Two tables, two retentions, two audiences: the first is
read by an operator investigating an account takeover and the second by the person whose record it
is. A refused attempt is written exactly as an allowed one, because a log that only shows successes
cannot show anybody an attempted intrusion. Every entry goes through the gate first and carries the
id of the gate's own hash-chain entry for the same decision, so the two can be compared — which is
also why this table is not chained itself: chaining it would mean the consent module holding key
material, and a module that can compute the chain is a module that can forge it. It is append-only by
contract, guarded by a boundary check on `UPDATE` and `DELETE`, exactly as `audit` is.

**It records that a record was opened, never what was in it.** There is no column a reading could go
in; `packages/catalog/consent.json` names the column words that may never appear, and the boundary
check reads that list from the contract rather than from anybody's memory. The clinical-table check
that fails the build on a clinical table in this service was not touched and did not need to be.

**Three production refusals** in `apps/api/src/config.ts`, in the same spirit as the ones already
there. `MYTHUSO_INFORMATION_OFFICER` must name the registered Information Officer: a consent is given
to a responsible party, and a service recording one without being able to say who is accountable for
it has written down half an agreement. `MYTHUSO_CONSENT_ASSUME_CARRIED_OVER` — a development
convenience so a developer need not re-answer every screen after a wording change — cannot be true in
production, because there it would convert consent to old wording into consent to new wording and the
row would afterwards be indistinguishable from one somebody gave. And `MYTHUSO_PROTECTION_KEYS` is
now required in production: with no key ring there is no gate, so no access is decided and none is
written into the chain, and a service in that state cannot honestly claim to know who opened what.

**Designed, not built.** A recipient, a scope and an expiry per consent, and propagation to anybody
the information was already given to — none of which exists here because no clinical record and no
recipient does. Guardian consent recorded as a *proven* authority rather than as a route on a
decision. And the access log's own retention: six years is written into the register and nothing
carries it out — the retention sweep does not reach the table and no row has ever been disposed of.
Closing that needs a disposal a boundary check can tell apart from a deletion, and it is not built.

## Retention against erasure

POPIA section 24 gives a data subject the right to have information deleted. The National Health Act
and the HPCSA's record-keeping guidance require a patient record to be kept for six years from the
last entry, longer for a child — to twenty-one — and longer again for mental-health and
occupational-health records. Those two point in opposite directions over the same information, and
this document used to say so and leave it there. A tension that only appears in a paragraph gets
resolved in production by whichever code path happens to run first.

It is now modelled, in `apps/api/src/personalData.ts`:

- **Every holding names a retention basis.** A basis says what anchors it (the request, the last
  entry, the day a party stopped working, an age, or nothing at all), how long, under which
  instrument, and whether it pulls against section 24.
- **A disposal date is derived from the basis and its anchor,** and is *null* wherever no honest date
  can be worked out — a minor's record needs a date of birth this service does not hold, a
  last-entry anchor needs a last entry, and the integrity of the audit chain has no end date at all.
  A null is an answer, and a plausible date arrived at by assumption is worse than no date.
- **An erasure answer says what could not be erased.** It uses the word *partial refusal*, names the
  ground and the instrument, gives the disposal date, and tells the person they may take it to the
  Information Regulator. A refusal a person does not recognise as a refusal is a refusal they cannot
  challenge.
- **The clinical bases are written down and hold nothing.** Six years from the last entry, a minor's
  record to twenty-one, mental health and occupational health longer again — all three are in the
  register, all three are marked as in use by nothing, because no clinical record exists in this
  service. Listing them is what stops "we hold no clinical record" being read as "erasure will reach
  a clinical record".

What this deliberately does **not** do is decide. It records the instrument and the period; it does
not interpret either. Where a number is MyThuso's own setting rather than something an Act states —
three years for the proof that a request was carried out, six for workforce vetting evidence — the
register says so beside itself, in the answer the data subject reads. Determining those periods, and
confirming the ones this file has taken from statute, is work for the Information Officer and South
African counsel. Nothing in the code or in this section is legal advice.

## Concrete preview protections

No backend calls, analytics or external media dependencies are included. The browser’s fixture state is not written to localStorage, sessionStorage or IndexedDB. Web CSP disallows objects, off-origin scripts and form submission; inline styles remain allowed for presentation. Production must supply HTTP security headers (including CSP frame-ancestors, HSTS, Permissions-Policy and Referrer-Policy) at the hosting layer. The development CSP allows same-host WebSocket connections for Vite.

Android denies cleartext and disables backup; no network or sensitive permissions are declared. SwiftUI/Compose implement screens directly. The no-WebView gate scans native source; it does not replace an audit of future third-party binary SDKs. No production credentials or private proposal contents are copied into public web assets. The catalogue and branding intentionally appear in the UI; deployment is not authorised or performed by this work.

## The gate

Every read of protected information goes through one function in `apps/api/src/protection/gate.ts`,
and every write of one goes through the function beside it. `scripts/check-boundaries.mjs` fails the
build if anything outside that directory imports the crypto directly — because a module that can open
a sealed value can decide for itself who may read a record. That is the hole this module exists to
close, and a survey of three sibling projects found all three of them had it; one had a hundred and
sixty-seven mutating routes with the check remembered on some of them.

The vetting module is the first real user of it, and it was written the inconvenient way on purpose.
It holds a gate and an audit chain and nothing else from the protection module: no key ring, no
record crypto, no way to seal or open anything itself. A certificate goes in through `protect()` and
comes out through `reveal()`, and both build the binding from the request rather than accepting one —
so a document cannot be sealed against a party the uploader has no authority over, and cannot be read
by a reviewer whose own police clearance lapsed last night. Break-glass reads and never writes: a
record created under an override nobody reviewed until afterwards is a record with no accountable
author.

The gate refuses at the first of five failures: the capability the role holds, the actor's current
vetting standing, the purpose the reading is for, the patient's own release of a protected category,
and break-glass. Break-glass overrides the capability check only — never vetting standing, and never
a protected category. Somebody unconscious needs their blood group and their allergies; nobody needs
their HIV status to resuscitate them, and the emergency route is exactly where that would be taken
from.

The audit entry is written before any plaintext exists, and it is written for a refusal too. It
never holds the value that was read: an audit log containing record contents is a second copy of the
record with weaker protection.

## Offline capture, and the reading that never arrives

A nurse works where there is no signal. What she captures is held on her phone and syncs later,
sometimes hours later, sometimes after her phone has been rebooted and its clock has drifted. That is
the ordinary case in South African community care, not the exception, and it is where a platform
either takes somebody's clinical work seriously or quietly loses it.

`apps/api/src/capture` is the server side of it. **It stores no readings, and the boundary check that
fails the build on a clinical table in this service was not touched.** What can be built honestly
before the rest of this document exists is the half that is about order and disagreement rather than
about values, and all of it is answerable from the envelope:

- **The payload is sealed and handed back.** Every entry goes in through `Gate.protect()`, which
  decides against the capturer's own current standing and writes the audit entry before any
  ciphertext exists. The sealed envelope goes back to the device with the receipt; what stays here is
  a SHA-256 of those bytes and their length. A commitment, not a copy — **the key ring is on the
  server and the ciphertext is not**, so "this service cannot read a systolic pressure" is a property
  of what it holds rather than a promise about what it does. The honest cost is stated in the module
  and repeated here: an accepted entry is decided, ordered and receipted, and it is not *filed*,
  because there is nowhere to file it.
- **Per entry, never per batch.** Ten queued entries are ten decisions. One entry naming a record
  type the catalogue has never heard of does not cost the other nine, and a retried batch after a
  dropped connection is recorded once — the device's own entry id is the idempotency key and the
  insert is the control, exactly as it is for a bootstrap authorisation.
- **The device's clock is recorded, never believed.** The server's receipt time orders everything.
  The device's time travels beside it, attributed to the device in the same breath, with the skew
  said out loud so a reader can judge the claim instead of being asked to trust or ignore it. Skew is
  measured on the *batch* — the device's own "now" against the server's at the moment of contact —
  and never on the entry, because an entry that is six hours old is a nurse who was offline for six
  hours and there is nothing wrong with her, her phone or her work.
- **Nothing is merged and nothing is discarded.** The four conflicts in
  `packages/catalog/capture.json` each name their resolver, and the catalogue is read rather than
  restated: exactly one of them, `clock-skew`, is the server's, and it settles it by doing what it
  was always going to do. `duplicate-observation`, `stale-write` and `vetting-lapsed` are held for a
  clinician, and a conflicted entry is a first-class state rather than an error. Last-write-wins over
  two blood pressures is a silent clinical decision taken by a comparison operator, and it is
  refused. A clinician settles an entry as `stands`, `superseded` or `not-filed`, always with a
  reason, and the superseded one is kept and stays visible.
- **The nurse whose clearance lapsed between capture and sync.** The gate refuses her at the moment
  she syncs, correctly and on its own arithmetic — and intake does not override that: nothing is
  sealed and nothing is filed. What it adds is the distinction the gate never draws, because the gate
  only ever asks about now. The reading was taken while she was cleared, so it is held for a clinician
  rather than dropped, with the evidence for the decision laid out: which checks lapsed, what the
  device claims, and **whether the server can vouch for that claim at all** — which it can only where
  the claimed time falls between the device's previous contact and this one, a window the server
  observed itself. She does not settle it herself; nobody rules on their own clearance.

**The honest limit of that last one, and it is a real one.** Standing at capture is *reconstructed*,
not remembered: it is today's evidence rows re-resolved against a past date. That is right where the
only thing that has changed is the calendar, which is precisely the lapsed-clearance case, and wrong
wherever a document was resubmitted or a decision retaken since. Closing it needs an as-at history of
vetting state — `vetting_evidence` is updated in place and keeps none — and until that exists, the
conflict says in its own words that the reconstruction is what it is.

## The one decision nobody reviews

A high-risk check is not verified until two different people say so. Somebody has to clear the first
of those two, and there is nobody to do it: the first trust has to come from outside the system, and
no arrangement of code changes that. MyThuso says so rather than hiding it.

What the code can do, and now does, is make that act as small and as accountable as it can be. The
bootstrap takes an authorisation signed from the key ring, minted at a console, good for fifteen
minutes and good exactly once — so it cannot be reached by a route, a job, a stray script or a
request arriving over HTTP, none of which has ever held key material. The authorisation names which
parties are being seeded and which two people are deciding, and the ceremony accepts nobody else, so
the names in the hash chain are the ones somebody committed to beforehand rather than whatever the
last caller typed. Every step of it is a distinct entry in the chain, including every attempt that
was refused. It still will not verify a check with no document on file. It seeds two parties and not
one, because a register seeded with one person is a register one person can clear everybody in. And
every check it decided carries a mark saying so, which a real reviewer's decision through the gate
removes — so the platform can converge on a state where nothing is standing on the escape hatch, and
so "what is still resting on it, and since when" is a question anybody can ask.

What remains is a matter of trust and is written down as one: that the two people at the console are
who the register says, that they read the certificates, and that whoever minted the authorisation was
one of them — the signing key is derived from the same ring the service holds, so root can mint one.
The ceremony, what must be recorded, and what an auditor should ask for are in
[Data protection](DATA-PROTECTION.md#the-bootstrap-ceremony). This is a hole made small, visible and
accountable. It is not a hole that has been closed.

## Clinical and operational separation

A nurse can capture observations within verified scope; a doctor signs diagnosis, prescription and certificate outputs. Drafts and algorithm flags cannot masquerade as signed decisions. Pharmacy/laboratory partners receive only the minimum order information needed for fulfilment. Employers and sponsors do not receive named health data by default. Unresolved incidents require a real escalation policy rather than a decorative dashboard counter.

The preview now shows what that separation looks like in the interface. A visit does not start if the patient's visit code fails; the nurse contacts the Control Tower instead. A nurse assessment is presented as an assessment, attributed to a SANC registration, and states that prescriptions, sick notes and referrals need a doctor. A doctor cannot sign a decision without selecting an outcome and writing a rationale. Abnormal laboratory results are held until a clinician releases them with an explanation, rather than being pushed to a patient automatically. Nurse dispatch is gated on a vetting record that re-runs on a schedule rather than once at sign-up, and that schedule is arithmetic rather than a claim: a stored "verified" is resolved against its own expiry date every time it is read, so a lapsed police clearance suspends a nurse and a lapsed ISO 15189 accreditation withdraws a laboratory's ability to release a result, with nobody having to notice first. A high-risk check verified by one reviewer does not count until a different reviewer agrees, and the console refuses to let one name do both.

Those last two are no longer interface-only. `apps/api/src/vetting` holds the evidence, resolves the expiry on every read, and refuses a second reviewer who is the first reviewer, the party themselves, or a check that is not high-risk in the first place; a new document dropped against a check that was already verified clears the previous decision *and* the previous second, because neither of them saw this file. The renewal warnings are built to survive a night the sweep did not run — a milestone is due once its date has been reached or passed and it has not been sent, with a dedupe key so a nightly run does not re-alert until somebody stops reading them — and the smallest passed milestone is the one delivered, because an alert headed "45 days" about a certificate expiring in nineteen is simply wrong. Offline capture is now on the server too, at least as far as it can honestly go: intake decides every queued entry through the gate, orders it by the server's own receipt time rather than the phone's, and refuses to merge or discard a disagreement. The rest of the separation in this paragraph — visit codes, assessment attribution, held laboratory results, doctor sign-off — is still enforced by the interface alone, and the server must enforce every one of them before real information is involved.

Real urgent-care functionality must not launch until referral/ambulance pathways, coverage, response expectations and failure handling are verified. The preview dispatches no emergency help.
