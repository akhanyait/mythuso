# Privacy and security implementation plan

This is a requirements and release-gate document, not a claim that the UI is POPIA-compliant. POPIA is the Protection of Personal Information Act; health information is special personal information. Determine the lawful basis and applicable authorisation for each processing purpose with the Information Officer and qualified South African counsel. Do not treat one checkbox as permission for every use.

Authoritative starting points: [Information Regulator POPIA resources](https://inforegulator.org.za/popia/), [special personal information provisions, including section 32](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-b-processing-of-special-personal-information/), [guidance on special personal information](https://inforegulator.org.za/wp-content/uploads/2020/07/InfoRegSA-GuidanceNote-Processing-SpecialPersonalInformation-20210628.pdf), [prior authorisation](https://eservices.inforegulator.org.za/priorauthorisation/default.aspx).

The table below is the *plan*. Which of its controls exist in code today, which are written and
unreachable, and which are prose is the section immediately after it — read that one first if the
question is "is this done".

**The work only people can do is prepared in [`docs/governance/`](governance/README.md):** a DPIA
draft, an Information Officer checklist, decision papers on data residency and key custody, and a
generated clinical review pack. Every document there is a draft with blank sign-off fields, and none
of it changes the state of any row below.

| Control | Preview now | Required before real information |
|---|---|---|
| Data minimisation | Fictional fixtures; memory-only state; no analytics | Purpose/field inventory, minimum collection, privacy impact assessment |
| Identity | **Built** in `apps/api`: one-time-code sign-in, peppered hashes for codes and sessions, attempt burning, rate limits per number and per address, no account enumeration, sliding idle and hard absolute session limits, append-only auth audit, and production refusals for a weak pepper, an http origin or no SMS provider. Plus **a second factor**: TOTP (RFC 6238) on `node:crypto`, its secret encrypted at rest, enrolment inactive until a code is typed back, hashed single-use recovery codes, and a sign-in that has answered the one-time code but still owes an authenticator code holding a ten-minute challenge rather than a session. Step-up is never demanded of an account with no second factor enrolled. Plus the sign-up preview with local check-digit validation and three account-recovery routes as designed states | OIDC, **a contracted** Home Affairs verification provider — the adapter is now built (`apps/api/src/vetting/identityProvider.ts`: signed requests, a signature-verified idempotent callback, a replay window, a sandbox that runs without secrets, and a refusal to sandbox in production) and it has never spoken to a provider, because none has been contracted and no key exists — clinician verification, guardian authority, device binding and an audited, reversible recovery process. **Designed, not wired:** which roles must carry a second factor derives from the vetting grants `prescribe`, `sign-clinical-review`, `dispense`, `release-lab-result` and `view-patient-record` (`apps/api/src/stepUp.ts`), and the service does not yet know about roles at all |
| Authorisation | Thirteen vetted parties, and a capability each is refused by name until its checks pass — dispatch, clinical sign-off, prescribing, dispensing, result release, sample custody, guardian access and the rest. **Built** in `apps/api/src/vetting`: the evidence vault, the lifecycle and the refusals now run on the server, and the gate resolves an actor's standing out of stored evidence on every single read, so a lapsed clearance withdraws a capability with nobody having to notice first. What is still interface-only is everything the server has no records for — patients, visits, care relationships. **And the one decision nobody reviews is now an operator act rather than a code path**: seeding the first two reviewers, who by definition have nobody to clear them, takes a signed single-use authorisation minted at a console, names the parties and the two people deciding, expires in fifteen minutes, cannot be reached from any route, and marks every check it decided as standing on it until a real reviewer decides it again **And a credential verification layer that verifies nothing yet, and says so**: one adapter per issuing authority in `apps/api/src/vetting/authority.ts`, a closed set of outcomes in which `not-integrated` is a first-class answer rather than an error, an authority's answer recorded in its own table beside — never inside — the reviewer's decision, a party's standing that composes the sentence "cleared by review, with no authority confirmation" for as long as that is true, and a re-verification sweep (`npm run reverify -w @mythuso/api`) that is a dry run unless committed. **Thirteen of the thirteen authorities answer `not-integrated` today** | Server-side deny-by-default object/tenant/relationship checks over clinical records, which do not exist yet; an audited break-glass process (the gate's break-glass route is built and refuses to write anything at all); **and an actual integration with any of the thirteen authorities**, twelve of which need an agreement, an accreditation or a customer account that does not exist, and the thirteenth of which needs a contract with an accredited identity provider — and one of the twelve, SATI, needs an answer to a prior question, because nobody has confirmed that SATI is who accredits a South African Sign Language interpreter |
| Consent | **Built** in `apps/api/src/consent`: consent to a *version* of a *purpose*, never a boolean on a person; the SHA-256 of the exact wording and the withdrawal sentence stored as the proof, so the words cannot be edited out from under a recorded consent; a decision refused outright where it names wording that is no longer in force, and an existing consent to superseded wording that authorises nothing until the person is asked again; withdrawal as one call with no reason required, recorded as an entry of its own, answering with what is kept anyway and the ground for each; and the required consents care depends on separated from the optional ones structurally — an optional purpose has no route to the care decision at all, and the contract refuses to load one that admits to degrading care. Beside it a **clinical access log** distinct from the auth log: who opened whose record, when, under what lawful basis and what capability, refusals included, carrying the id of the gate's own chain entry for the same decision, hash-chained in its own right with the head of that chain sealed periodically into the gate's keyed chain — so a row rewritten behind the service's back is detected rather than merely correlated, and the module holding the log still holds no key — and readable in full by the person whose record it is. `packages/catalog/consent.json` holds the purposes, the versions, the required/optional split and every refusal, withdrawal and retention sentence; web and the service read it, and nothing restates it. Plus the earlier preview: optional switches, sharing preview, and spoken visit consent that records refusal as a valid outcome | Recipient, scope and expiry per grant, and downstream propagation to anybody the information was given to — none of which exists, because no clinical record and no recipient does. Guardian consent for a minor as a proven authority rather than a recorded route. A determination by the Information Officer and counsel of the lawful basis this file has *named* for each purpose |
| Family care | Guardian invitation preview in which scope, duration and identity verification are three separate decisions, revocable, with sensitive categories excluded from every scope | Verify guardianship and delegated authority with proof; no record access merely because someone pays; a record of the child's own views as they grow older |
| Export | Explicit export of a fictional sample | Step-up identity check, scoped export, audit, expiry and secure delivery |
| Deletion/correction | **Built** in `apps/api`: a holdings register classifying every table `erase`/`anonymise`/`retain`, each with a plain-English ground written for the data subject and each naming a **retention basis** — what keeps it, from when, under which instrument, and whether it pulls against section 24. Disposal dates are derived from the basis and its anchor, and are *null* wherever no honest date can be worked out. The section 24 thirty-day clock runs from receipt; erasure has a seven-day grace period, an immediate sign-out and a tombstone that is unique and unreachable (RFC 2606 `.invalid`, and not a number that could be dialled); the retention sweep is a dry run unless committed. The answer names what could **not** be erased and calls it a partial refusal in that word, with the ground and the disposal date, and points at the Information Regulator. The clinical retention rules — six years from the last entry, a minor's record until twenty-one, mental health and occupational health longer again — are modelled and marked as holding nothing, because nothing clinical is held here. Acknowledgement preview on web. The intake ledger is registered like everything else — the receipt that an entry arrived, and anything a clinician still has to decide about, both on a `capture-receipt` basis anchored on the day it arrived rather than on what the device claimed, because a disposal date computed off a device's clock is not a date. **An entry still waiting for a decision is never disposed of**, whatever its age: a question that has been open for a year is a question somebody owes an answer to, and sweeping it away would answer it by deletion | The clinical bases attached to actual clinical holdings, once any exist; correction as distinct from deletion; an operator queue and proof of response; and a determination by the Information Officer and counsel of every period this register currently records as MyThuso's own setting |
| Audit | Sample access timeline including a guardian access event; append-only incident log in the Control Tower preview. **Built** in `apps/api/src/protection/audit.ts`: a hash chain keyed from the key ring, so an edited, deleted, re-ordered or forged entry is detectable and `verify()` names the first break — tamper-evident, not tamper-proof. **The vetting decision log is now that chain rather than a preview**: every enrolment, submission, verification, second reviewer, decline, suspension and detected substitution is an entry in it, and two append-only logs would have been one append-only log and one table somebody eventually tidies. The audit key is pinned to the oldest key version, so a key rotation does not make the whole log stop verifying. The bootstrap has its own kinds — `vetting.bootstrap.opened`, `.enrolled`, `.verified`, `.closed` and `.refused` — so the founding of the register, and every attempt that was turned away, is one grep rather than a reconstruction. So does the verification layer — `vetting.authority.answered`, `.contradiction`, `.refused`, and `vetting.identity.session.opened`, `.callback.refused`, `.callback.repeated` — so every enquiry MyThuso made of an authority, every answer including "there is no way to ask", and every forged callback is in the chain. **And so does offline capture** — `capture.accepted`, `capture.conflicted`, `capture.refused`, `capture.replayed`, `capture.settled.*`, `capture.disposed` and one `capture.conflict.<kind>` per detected disagreement — so "how often does a device clock go wrong" and "how many entries did that clinic have held last month" are a grep rather than a reconstruction. **Not one of those entries carries a reading**, and it is not left to whoever writes the next caller: the chain takes an allowlist of fields and throws on anything outside it. **And the chain now carries seals as well as decisions** (`apps/api/src/protection/seal.ts`): the head of the consent module's own `record_access_log` is committed into it periodically, so a table owned by a module that holds no key material is nonetheless tamper-evident — the two fields a seal adds to the allowlist are the log's name and a digest, and the digest field refuses anything that is not sixty-four hex characters, because a free-text field nobody constrained is how an audit entry becomes a copy of a record | Publishing the chain head somewhere the operator does not control, which is what turns evidence of tampering into evidence somebody else can check. It is the same gap on both chains, and the one that would close the seal's remaining window as well |
| Encryption | **Built** in `apps/api/src/protection`: AES-256-GCM with a per-record data key wrapped under an HKDF-derived key, the record's identity in the associated data so a ciphertext cannot be moved between patients, blind indexes for search without decryption, and versioned root keys so a rotation re-wraps rather than re-encrypts. **And rotation as an operation**: `npm run rotate -w @mythuso/api` walks every registered column of sealed values, re-wraps what is on an old key in small transactions, reports what is left from an indexed `key_version` column, and is a dry run unless committed — resumable and idempotent, with no cursor to lose. Every vetting document in the service goes through it. Cleartext disabled on Android. See [Data protection](DATA-PROTECTION.md) | An HSM or KMS, split-knowledge key custody, per-patient key derivation, and re-encryption — which is what a *compromised* key needs, and which rotation is not |
| Residence/transfers | No cloud deployment | Prefer SA regions as a project choice; assess every operator/subprocessor and cross-border transfer under section 72 and applicable prior-authorisation requirements. POPIA is not a blanket SA-only hosting rule. |
| Clinical AI | No model or inference. Out-of-range readings are flagged against indicative adult reference ranges and labelled in the UI as not a validated early-warning score | Validated intended use, provenance, review state, model/version audit, clinician sign-off, incident monitoring; no autonomous diagnosis |
| Devices | No device access. The permission-denied state is designed, and declining never blocks a visit | Applicable registration/exemption assessment, validated readings, signed firmware and secure pairing |
| Incidents | Severity triage, immediate-action choice, handover note and demo log; a critical severity states that the form never precedes calling emergency services | Detection, containment, investigation, real paging, and notifications under applicable law; rehearsed playbooks and accountable owners |
| Research and marketing | Off by default in preview | Separate purpose assessment; no assumption that pseudonymised health data is anonymous |

## Which of these controls actually exists

Written 9 September 2026 at commit `153c7c4`, by reading `apps/api/src/**`, `apps/api/test/**` and
`scripts/check-boundaries.mjs` rather than by reading the table above. **Revised on `2105f09`**, when
nine of the rows below changed state — the section after the table says which, what closed them, and,
for every one still absent, the obstacle rather than the shortage of time.

**Why this section exists.** The table above describes fourteen controls. Several of them are real
and several are not, and until now the two were written in the same voice — a "**Built**" in bold
beside a sentence about what production will need, in a paragraph long enough that a reader looking
for "is this done" would give up before finding out. This document is what stands behind the claim
that MyThuso treats health data as special personal information under POPIA. A control that exists
only in a document is a control nobody has, and a document that cannot say which of its own controls
those are is worse than one that claims nothing.

Nothing here changes the state of `clinical-records`. It is not connected, no clinical record
exists, and every row below that says "no clinical record exists yet" means exactly that.

**Implemented** means there is code in `apps/api/src` that runs, with a test. **Partly** means the
mechanism exists and something material about it does not — usually that nothing calls it.
**Absent** means there is no code: a screen in the web preview, a sentence in this file, or a
structure that holds nothing is not an implemented control, however carefully written.

| Control | State | Where it is | What checks it |
|---|---|---|---|
| Data minimisation | **Partly** | `src/personalData.ts` — a holdings register naming every table, its class (`erase`/`anonymise`/`retain`) and its retention basis. There is no analytics or telemetry code anywhere in the service | `test/personal-data.test.ts` — "it names every table the service actually has, and none it does not". **No boundary check.** The register is an inventory, not a limit: nothing stops a field being collected. The purpose/field inventory and the privacy impact assessment are governance work and are **absent** |
| Identity | **Implemented** | `src/identity.ts`, `src/totp.ts`, `src/twoFactor.ts`, `src/sensitive.ts`, `src/config.ts` — peppered HMAC over codes and session tokens, `timingSafeEqual`, attempt burning, per-number and per-address rate limits, sliding idle and absolute session caps, no account enumeration, RFC 6238 TOTP with its secret sealed at rest, hashed single-use recovery codes, a ten-minute half-signed-in challenge | `test/identity.test.ts`, `test/two-factor.test.ts`, `test/totp.test.ts` (RFC vectors), `test/server.test.ts` — "a known and an unknown number are answered identically", "one address cannot walk through a list of numbers", "neither the code nor the session token is stored in the clear". Production refusals for a weak pepper, echoed codes, no SMS provider and an http origin, all in `src/config.ts`. **No boundary check on any of it** |
| ↳ Role-based step-up | **Implemented** | The service now has a notion of a role on a session. `src/actor.ts` resolves the signed-in person to a party in `vetting_parties` and reads the role out of the register — never off a request — and every vault route hands `decideStepUp` that role's real grants from `packages/catalog/vetting.json`. So `'capability'`, the branch that was never called, is the branch every vetting write now goes through: an account granted work that must carry a second factor is asked for one, and where it has none enrolled it is told to enrol and is never locked out. `account.export` is a fourth action beside the two that were there | `test/vetting-routes.test.ts` drives it over HTTP — the second-factor capabilities a role holds come back on `GET /vetting/me`. `test/two-factor.test.ts` still covers the decision itself. **Boundary check:** no file in `apps/api/src` may build a gate request out of a request body |
| ↳ Home Affairs verification | **Adapter built, never used** | `src/vetting/identityProvider.ts` — signed requests, signature-verified idempotent callback, a fifteen-minute replay window, a sandbox that runs without secrets, and a production refusal to sandbox. It has never spoken to a provider: no partner has been contracted and no key exists | `test/vetting-authority.test.ts` — "production refuses to run without credentials rather than sandboxing", "with no provider configured, Home Affairs is not integrated rather than sandboxed" |
| ↳ OIDC, clinician verification, guardian authority, device binding, audited recovery | **Absent, and not one of the five can be built here** | Nothing in `apps/api/src`. OIDC needs a contracted provider and a client registration. Clinician verification is the thirteen authorities, twelve of which need an agreement or an accreditation. Guardian authority needs proof — a birth certificate against Home Affairs, or a court order — and MyThuso can reach neither. Device binding needs a key per device, minted in a ceremony this repository cannot perform. An audited, reversible recovery needs somebody accountable for the reversal, and there is no operator organisation yet | — |
| Authorisation | **Implemented** | Everything that was there — `src/protection/gate.ts` (five refusals in order: capability, vetting standing, purpose, the patient's own release, break-glass, which overrides the capability check only), `src/vetting/**`, `src/protection/bootstrap.ts`, `src/vetting/authority.ts` — **and nine routes that reach it**: `GET /vetting/me`, `GET /vetting/party`, `POST /vetting/parties`, `/vetting/evidence`, `/vetting/evidence/open`, `/vetting/evidence/decide`, `/vetting/evidence/second`, `/vetting/parties/suspend` and `/vetting/parties/restore`. All eight of the calls this row used to list as unreachable are reached. What made that safe to do is `src/actor.ts`: the actor id comes off the session cookie, the role comes out of `vetting_parties`, and the purpose is derived from whether the party being acted on is the caller — so nothing on a request can name any of the three. The founding ceremony still has no route, and a request to one is a 404 rather than a locked door | `test/vetting-routes.test.ts` — thirteen journeys over a real socket, including the lifecycle end to end and a document coming back byte for byte. Every refusal asserted is the vault's or the gate's own sentence, word for word. The earlier boundary checks, plus **two new ones**: each of the eight vault calls must be reached from a route, and no file may build a gate request out of a body |
| Consent | **Implemented, and it is the most complete control here** | `src/consent/**` — consent to a version of a purpose, the SHA-256 of the exact wording and withdrawal sentence as the proof, a decision naming superseded wording refused outright, withdrawal as its own entry, required and optional purposes separated structurally, and a `record_access_log` hash-chained in its own right with its head sealed periodically into the gate's keyed chain. Routes exist and are reachable | `test/consent.test.ts` (60 tests) and `test/access-log-integrity.test.ts` (22). **Eleven boundary checks** — both sides build the fingerprint from the identical expression; both read `consent.json` rather than restate it; no wording string is duplicated in any of the four codebases; both ledgers stay append-only; the access log may grow no column a reading could go in; the chain columns must exist; the consent module may not import the audit chain or the crypto; the verifier may not seal what it is verifying |
| ↳ Who wrote the consent down | **Partly** | The half that could be closed is closed: a signed-in person can no longer declare somebody else's act. `POST /consent/give` and `/consent/withdraw` accept `web-account` and nothing else, and the other three routes the contract describes — read aloud by a nurse, signed on paper at a Corner, given by a guardian — are refused, with the contract's own words for what the route *is* handed back, so a surface can still say what it is rather than only that it is unavailable. The spoken one is the record that would be relied on hardest, by somebody who could not read the screen, and recording it on their own say-so was worse than not recording it at all. What is still absent is recording it *properly*, which needs the nurse's own authority over that visit and a proven guardianship. Neither exists | `test/privacy-routes.test.ts` — "a person cannot record that a nurse read a consent aloud to them", asserted for all three routes, with `web-account` still working |
| ↳ Recipient, scope and expiry per grant; downstream propagation | **Absent** | Nothing. There is no recipient because there is no clinical record and no party to give one to | — |
| Family care | **Absent, and it needs a document rather than a decision** | There is no guardian code in `apps/api/src`. `gate.ts` carries two comments marking where a guardian's authority is *meant* to be checked. `apps/web/src/features/Guardian.tsx` is a preview screen: no table, no route, no test. **Why it was not built now:** a guardian relationship is proven with a birth certificate, an adoption order or a court order, verified against Home Affairs or a court, and MyThuso can reach none of the three. A guardian route without that is a route where one adult asserts authority over a child's record and the platform records the assertion as the proof — which is worse than the absence, because the screen looks the same either way | — |
| Export | **Implemented, with its reach stated on the answer** | `POST /account/export` and `src/subjectExport.ts`. It demands a step-up code where one is enrolled; it is scoped to the caller *by construction*, because there is no id on the request and so no id to change; it goes through the gate as a `subject-access` read and is written into the chain before any of it is assembled; and it returns the record rather than the register — the account, the consent decisions with their wording fingerprints, the person's own lines out of the append-only sign-in log, their record-access log, their corrections and the answers to them, and a vetted party's own vetting decisions. `GET /account/data` still answers the other question. **Expiry and secure delivery turned out to be non-problems rather than gaps here:** the export is built for one request and written into that response, so there is no file, no link, no bucket and no third party for anything to expire from or leak through, and it says so at the top rather than leaving somebody to work it out. Three things it will not carry — the authenticator secret and recovery codes, session tokens and code hashes, and the vetting documents themselves — are declared in `NEVER_EXPORTED` with a reason each and named on the answer | `test/privacy-routes.test.ts` — six tests, one of which walks every key of the real response body against `FORBIDDEN_KEYS`. **Boundary checks:** the route may send no key on that list, and it may not stop demanding a step-up |
| Deletion | **Implemented, with a stated reach** | `src/personalData.ts` (holdings, retention bases, disposal dates that are `null` where no honest date exists, a thirty-day section 24 clock), `src/erasure.ts` (seven-day grace, immediate sign-out, an unreachable `.invalid` tombstone), `src/retention.ts` (a sweep that is a dry run unless committed) | `test/personal-data.test.ts`, `test/account.test.ts`, `test/capture.test.ts` — "disposal reaches what is settled and never what is still waiting". **The reach:** `erasePerson` touches six identity tables. The fourteen `retain` holdings are never erased, which the register says in the answer, calls a partial refusal in that word, and points at the Information Regulator |
| ↳ Correction | **Implemented** | `src/subjectRequests.ts`, `POST /account/correction` and `GET /account/correction`. It is a separate right from deletion and is kept separate, because running the two together is how somebody who wanted their name spelled properly ends up with an emptied account. Three refusals carry it. The **mobile number** cannot be corrected, because it is not a detail on the account but the account — every session, every code and every audit line is keyed to it — and the refusal says what to do instead. The **append-only logs** are never corrected, and POPIA section 24(2)(c)'s answer is offered in the same breath rather than left to be found: the person's own account of it is attached to the record. And a request that does not say what is wrong *and* what it should say is refused, because it could be neither carried out nor honestly turned down, and would sit in the queue being neither | `test/privacy-routes.test.ts` — six tests, each asserting the refusal sentence rather than the status code |
| ↳ An operator queue and proof of response | **Implemented, and it pages nobody** | `GET /operator/requests` and `POST /operator/requests/respond`. The queue is both section 24 rights together — corrections and erasures, which arrive from the same right and share the same clock — with the date each arrived, the date it is due, the days left and how many are already late, counted rather than claimed. It holds no name and no number: ids, dates and a field name, because a queue that could be read as a list of people is a list of people. The proof of response is an append-only row naming who answered, when, which of `corrected` / `refused` / `noted` it was, and what was said, with the audit entry written before the row. Who may work it is decided on the gate's own arithmetic: a party, granted `review-vetting`, not declined, not suspended, and cleared against evidence re-resolved on every read. **Nobody is paged, and the response says so in those words**, because there is no messaging provider and a queue that implied it alerted somebody would be worse than no queue | `test/privacy-routes.test.ts` — eight tests, including that a suspended reviewer loses the queue on the next request and that nobody answers their own. **Two boundary checks:** the response table stays append-only, and the route may not stop refusing somebody answering their own |
| Audit | **Implemented** | `src/protection/audit.ts` — a hash chain keyed from the key ring, `verify()` naming the first break, the key pinned to the oldest version so a rotation does not stop the log verifying, and a field allowlist that *throws* on anything outside it. `src/protection/seal.ts` commits the consent log's head into it | `test/protection-audit.test.ts` — "an entry appended by somebody without the key is caught", "the value that was read is refused, by name". Boundary check: `UPDATE audit` / `DELETE FROM audit` fails the build |
| ↳ Publishing the chain head somewhere the operator does not control | **Still absent. The half of it that is not an agreement is now built** | The publishing is unchanged and unbuildable: the whole value of it is that the place the head goes is not MyThuso's, and a second table, a second file or a second box on the same account is the operator publishing to the operator. That needs a notary, a regulator, a partner or a public transparency log — an agreement, not a function. **What was missing that was not an agreement is the other half, and it is built:** `src/protection/witness.ts` renders the chain's length and head as a short block of text meant to leave the machine — printed, read down a telephone, kept by somebody else — and, the part that was actually absent, takes one back and answers whether this chain is still that chain grown longer. That is the question a hash chain cannot ask of itself: an empty log verifies, because there is nothing left to contradict it. Against a held statement, truncating to nothing is refused, truncating to a prefix and growing again with real entries is refused on the hash at the witnessed position, and an edit anywhere breaks `verify()` first. **What it is not:** it is not publication, not a timestamp authority, and it proves nothing about *when* a statement was made. A statement MyThuso wrote and MyThuso kept establishes nothing at all, and the module and the route both say so in those words | `test/witness.test.ts` — ten tests, including the three truncations and "a statement made over an empty chain vouches for nothing, and is not blessed". **Two boundary checks:** the module may not reach a network (`fetch(`, `node:http`, `node:net`, `publishTo`), and it may not lose the sentence saying it publishes nothing |
| ↳ The health verification routes | **Closed** | `GET /health/audit`, `/health/access-log` and `/health/verification` now refuse a caller that is not on the loopback, which is what the comment beside them has claimed since they were written. They run real work for whoever asks — one of them walks the whole hash chain — so an open one was both a small disclosure and a cheap way to make the service do something expensive. `GET /health` stays public: what the service holds is a fact MyThuso should be willing to state to anybody | `test/privacy-routes.test.ts` and `test/vetting-routes.test.ts` answer them from `127.0.0.1`. **Boundary check:** the refusal must stay in the dispatcher |
| Encryption | **Implemented** | `src/protection/crypto.ts` — AES-256-GCM, a per-record data key wrapped under an HKDF-derived key, the record's identity in the associated data so a ciphertext cannot be moved between patients, blind indexes, versioned roots. `src/protection/rotation.ts` and `npm run rotate` re-wrap on an indexed `key_version`, resumable, dry run unless committed. `src/sensitive.ts` for identity values | `test/protection-crypto.test.ts` (RFC 5869 vectors; "a value written for another server does not open here"), `test/protection-rotation.test.ts` ("a half-finished rotation leaves a working database of mixed versions", "a rotation does not break the audit chain"). Boundary check: nothing outside `src/protection/` may import the crypto. Production refusals for a malformed key, a missing index version and an unusable key ring |
| ↳ HSM or KMS, split-knowledge custody, per-patient derivation, re-encryption | **Absent, and it was looked at again on 10 September 2026 and left absent** | All four need a vendor or a key ceremony. Rotation is not re-encryption and this document should not let the two be read as one. **The reduced form that was considered and rejected:** split-knowledge custody is the one of the four that needs no vendor — a root key split into shares at a console, reassembled from a threshold at start-up, is a few dozen lines and is a real, well-understood control. It was not built, and the reason is the one this document already uses two rows above about the chain head. On a single box every share is read by the same process at the same moment from the same machine, which the same person administers: shares in one environment file are a longer way of not splitting the key, exactly as a second table is a longer way of not publishing. It would protect against one person walking off with the whole key during a ceremony that nobody currently performs, and against nothing else — and a service that reported "split-knowledge custody" while a single root could read every share is a claim that would be believed. It becomes buildable the day there is a hosting arrangement in which the shares can genuinely be held apart, which is a hosting decision and not a function | — |
| Transport | **Implemented 9 September 2026, and rate-limited on `2105f09`** | `src/server.ts` — every answer, including a refusal and a preflight, carries `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `x-frame-options: DENY`, `permissions-policy` refusing camera, microphone and geolocation, `cross-origin-resource-policy` and `cross-origin-opener-policy: same-origin`, `x-content-type-options`, `referrer-policy` and `cache-control: no-store`. HSTS — two years, subdomains, **no preload** — is sent only where the cookie is already `Secure`. The listening server caps the request at 15 s, the headers at 5 s, the idle connection at 5 s and the header count at 40 | `test/server.test.ts` — six tests over the headers and two over the timeouts. **Nine boundary checks** in `check-boundaries.mjs`: each header is read out of the `TRANSPORT_HEADERS` declaration rather than grepped for in the file, `send()` must spread it, HSTS must stay conditional on `cookieSecure` and must never carry `preload`, and the four timeouts must be set with headers landing sooner than the whole request. This replaces the sentence "production must supply HTTP security headers … at the hosting layer", which was a control owned by nobody, on a box hosting five sites whose config this repository may not touch. **And the caller limit**, which sits in `handle()` rather than on each route so that a route added next year cannot forget it: three further boundary checks hold it there, hold it to a named constant rather than a literal, and refuse any addition to the exemption list beyond the three sign-in routes that already carry tighter limits of their own |
| ↳ TLS itself | **Absent from the service, by design** | `createServer` is plain HTTP. TLS terminates at the proxy; `deploy/README.md` says so, and the service is switched off until it exists |
| Residence and transfers | **Absent, and it is not a code change. The question is now written against the thing that will raise it** | Nothing in the service decides a residence or a transfer, and nothing can: a residence control is a hosting decision, a subprocessor register is a list of contracts, and a **section 72 determination is a legal determination about a named recipient in a named country**. There is no recipient, no contract and no cloud deployment, and a region check written against a provider nobody has signed with asserts a property of an arrangement that does not exist. That verdict is unchanged. **What did change is where the question lives.** `packages/catalog/feeds.json` describes eleven suppliers who would each become an operator under section 21 on signature, and every one of them carries the section 72 question in its own entry, with `determined: false` — the position feed, where a transfer would be continuous rather than occasional; the media stack, where it would carry the content of a consultation; the screening vendor, where the payload is a reading from a patient. It is not a subprocessor register, because a register is a list of contracts. It is the list of determinations that will be owed, attached to the feed that will owe each one, so that the answer is made when a vendor is chosen rather than after they are live | **Boundary check:** a feed may not record its section 72 question as determined. A determination is about a named recipient and there is none — if one is ever signed, the answer belongs beside the contract rather than as a boolean in a catalogue file |
| Clinical AI | **Not applicable to the service; enforced in the catalogue** | There is no model, no inference and no reference range in `apps/api/src`. The ranges and the sentence qualifying them live in `packages/catalog/records.json` | `check-boundaries.mjs` refuses ranges with no qualifying note, refuses a range whose ends are the wrong way round, holds all three platforms to the contract's numbers, and refuses any screen that types one |
| Devices | **Partly, and the reason no route reaches it has changed** | The service does not touch a device — but `src/capture/**` holds device identity, the device's claimed time, the measured skew and a SHA-256 commitment to a sealed reading it does not keep. The logic and its four conflicts are real and tested. **Still no route reaches it**, and half of the old reason has gone: the *capturer* can now be resolved from the session, because `src/actor.ts` exists. The *device* cannot. An intake entry records which phone sent it and what that phone believed the time was, and a device id read off a request body is a claim — the same hole the gate closes, one level down. Believing it would make the skew arithmetic a decoration, because any caller could name any phone and hand it any clock. Closing it needs device binding, which is a key per device | `test/capture.test.ts`. The claim "no device access" in the plan table above is true of the network and misleading about the schema — which is why it is written out here. Signed firmware, secure pairing and validated readings are **absent** |
| The ingestion boundary | **Implemented, and it accepts nothing** | `src/feeds/**` and eleven routes registered from `packages/catalog/feeds.json`. Nine of the fifteen capabilities are blocked on a supplier nobody has signed — an SMS provider, a payment provider, a nurse roster, live device positions, thirteen credentialing authorities, a pharmacy network, an interpreter service, an ambulance partner, a media stack, an AI licence. Nobody can sign a contract from inside a repository, so what is built is the seam: for each feed, the shape of what would arrive, a pointer at the sample data that stands in for it today, the conditions that must be true before it may be switched on, and the fields that must **never** arrive. **Every route refuses every payload, including a well-formed one**, and answers with the capability's own not-connected sentence out of `capabilities.json`; `decide()` returns a refusal type with no success variant, because a route that could accept under some condition is a route somebody finds the condition for. Forbidden fields are checked **before** the shape and at every depth, on a canonical spelling, so a patient id in a position feed is refused whether it arrives as `patientId`, `patient_id` or nested in a wrapper. **And nothing a stranger typed is written down:** a forbidden field is recorded by *the contract's* name for it and never the sender's, an undeclared field is recorded as a count and never as a name, and no value is read, kept or echoed — because a JSON key is a string somebody else chose, and `{"bp 180 over 110 mmHg": 1}` is a valid one. Refusals go into the gate's hash chain, whose field allowlist throws on anything outside it | `test/feeds.test.ts` — twenty-one tests, including "every feed refuses a payload that is exactly what it asked for", "it does not matter how the sender spelled it", "a forbidden field is refused before a missing one is noticed" and "an undeclared field is counted, never named, and never echoed" — asserted against the response *and* against the chain. **Twenty boundary checks**, including: a capability may not be marked connected while any switch-on condition of any feed serving it is unmet; no feed may accept a field another refuses by name; no route may be typed into the server by hand; no refusal sentence may be typed into the service; and nothing behind these routes may answer in the two hundreds |
| Incidents | **Partly: a register, not an incident response** | `src/incidents.ts` and five routes. It is the **security compromise register under POPIA section 22**, and deliberately not the Control Tower's operational board — one severity ladder describing both "the courier's bag was damaged" and "somebody read four hundred people's records" is a ladder that means nothing at either end. So there is no severity here at all: section 22 turns on one question and it is a yes or a no, and a four-rung ladder in front of it is a way of answering it "medium". It holds no name, no number and nowhere either could be written — only a count of people reached, because a register of what leaked must not become a second copy of it. Three refusals. **Any vetted party may report one whatever their standing**, because a report you have to be in good standing to file is a report nobody files on the worst day. Nothing is closed before it is contained. And an incident that reached personal information cannot be closed until **both** the Regulator and the affected people are recorded as told, because a register that closed on the Regulator alone would quietly make "we told the authorities" the whole of the duty. It refuses to invent a deadline: section 22(2) says "as soon as reasonably possible" and names no period, so it counts the days and says the Act names none. **Absent, and said out loud in the module: detection, paging and delivery.** Nothing here notices anything by itself and nothing here tells anybody anything — it records that somebody was told, on that person's word | `test/privacy-routes.test.ts` — seven tests, including that telling the Regulator alone does not close it, and that a suspended party can still report. **Boundary check:** the register may not grow a column somebody could be named in, enforced on the identifiers rather than on the prose |
| Research and marketing | **Partly** | A direct-marketing consent is structurally not a basis for opening a record: `ACCESS_BASES` in `src/consent/contract.ts` excludes it | `test/consent.test.ts` — "a direct-marketing consent is not a basis for opening a record". There is no research pipeline and no pseudonymisation, so there is nothing else to be off by default |
| Health Passport P0 store (`apps/passport`) | **Implemented in development only. Absent in production, by construction** | `apps/passport/src/**` — a separate zero-dependency service with its own SQLite file and its own master key, refused at start-up if the key equals or is obviously derived from the identity service's keys, or the file is the identity service's database. Envelope encryption: per-subject data keys and a separate key per sealed category, wrapped under the master key. A FHIR-R4-shaped store (a Patient token, Observation, AllergyIntolerance, MedicationStatement, Consent) with Provenance on every write. An Encounter specifically also carries a lifecycle — written, signed once by a clinician's own grant, or superseded once by a later entry, never both and never back — in a table of its own; a supersede never edits the resource it replaces, only marks it, and a signed Encounter is never superseded, corrected instead by a new entry, same as Clinical's own rule for a signed consultation. A consent gateway in front of every read — no grant, an altered grant, revoked, expired, wrong subject, wrong purpose and out of scope each refused in a sentence from `packages/catalog/passport-gateway.json` — with sealed categories excluded unless a grant ticks them and a clinician told only that sealed content exists. A hash-chained audit log of every access, granted or refused, which the patient reads at `GET /audit/mine`. Break-glass that opens the emergency summary only, flags a 24-hour review, and takes who is breaking the glass from a development-only signed operator credential rather than the request; its justification is a reason code whose sentence enters the patient-visible chain, plus a note screened for phone, identity and email-shaped values and kept encrypted beside the entry, never in the chain. A sealed tick opens only the sealed categories a grant names, and an entry the patient marks private opens to no grant. Grants are held to each role’s maxExpiryDays and allowedPurposes from `packages/catalog/consent.json`. Provenance is encrypted under the entry’s own key. Every refusal, including a request with no requester and a probe of another person’s record, is written into the chain, and a request whose Host is not a loopback name is refused. Identity-shaped values are refused at any depth of a resource. Patient sessions expire after the identity service’s idle limit and can be ended. It refuses to start without `MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only` or in a production environment, binds to the loopback, and accepts no name, identity number, phone number or address. **Absent, and the reason it does not deploy:** a signed DPIA, a registered Information Officer, a data residency decision, HSM or KMS custody of the master key, OIDC and mutual TLS in front of the gateway, anchoring of the audit chain head, a patient-configurable emergency summary and a penetration test | `apps/passport/test/**` — grant allowed, denied, expired, revoked, wrong purpose, out of scope; sealed excluded by default; break-glass scope; audit tamper detection; key separation; the process refusing to start without the flag. `scripts/check-boundaries.mjs`, the HEALTH PASSPORT P0 block — nothing under `deploy/` names the service or its port, no import between `apps/api` and `apps/passport`, no identity column in a Passport table |

### The three things this table says that the one above does not

**A library with a test suite is not a running control — and the gate is no longer one.** This
paragraph used to say that the gate, the vetting vault, the clinical access log's `open()` and the
whole of offline capture were written, tested and unreachable, because no HTTP route called any of
them. Two of those four now have routes. The gate and the vault are reached by nine of them, and
every one resolves who is asking from the session cookie and the vetting register rather than from
the request — which was the reason they had none. The clinical access log's `open()` and offline
capture still have none, and the reasons are now different from each other: `open()` is waiting for
a clinical record to open, and capture is waiting for a device this service can identify rather than
be told about. Both are written out in the rows above rather than shared under one sentence, because
"unreachable" was never one fact.

**Twenty tables, and none of them clinical.** `people`, `challenges`, `sessions`, `audit`, `starts`,
`second_factors`, `recovery_codes`, `second_factor_challenges`, `erasure_requests`,
`consent_decisions`, `record_access_log`, `protected_access_log`, seven `vetting_*`, and
`capture_entries` / `capture_conflicts`. Not one holds a clinical value, and that is enforced rather
than asserted: `scripts/check-boundaries.mjs` parses table and column *identifiers* — not the prose
around them — and fails the build on a clinical one. The three closest to the line are named in the
Devices row and in the section on offline capture below.

**What is rate-limited, and the number that is a proposal.** This paragraph used to list what was
not: `POST /account/name`, `POST /consent/give`, `POST /consent/withdraw`,
`POST /vetting/identity/callback` and the four `GET /health*` routes — with the reason left as *"a
limiter is a decision about what a legitimate caller may do and nobody has made it"*. That reasoning
was right, and the answer to it is to make the decision and say who made it, not to leave the routes
open.

**The decision: sixty requests per caller per fifteen minutes.** It applies to every write and to
the four health routes, keyed on the account where a session resolves and on the caller's address
where it does not — so signing out is not a way past it and an unauthenticated route is still held.
It lives in `limits.writesPerCallerPerWindow` in `apps/api/src/config.ts`, with the reasoning beside
it, and it is enforced in `handle()` rather than on each route, which is the only arrangement in
which a route added next year cannot forget it. The count comes out of a `write_attempts` table that
is spent material and is swept, and it shares the fifteen-minute window the sign-in limits already
use, because two windows would be two things to reason about at three in the morning.

**Where sixty came from, and it is a proposal rather than a measurement.** Nobody has watched a real
session, because there are no real sessions. What it was arrived at from is the busiest honest
sequence this service can currently produce: a reviewer clearing a newly enrolled party is one
enrolment, one submission per check, one decision per check and one second reviewer per high-risk
check — about twenty-five writes for one party — and a reviewer working through two of them in a
sitting doubles that. Sixty leaves room for it and still refuses a script, which would be making
thousands rather than dozens. Sign-up is nowhere near the ceiling: a consent decision per purpose, a
name and an enrolment is under twenty. **When the first real caller exists, this number should be
checked against what they actually do, and changed. It is one constant.**

**What would settle it, and the logging that now makes the measurement possible.** Two numbers settle
it and nothing else does. The first is *how close an honest caller actually comes* — the largest
number of requests one caller makes inside fifteen minutes, watched over enough weeks to include a
reviewer clearing a backlog, which is the busiest honest sequence this service can produce. The
second is *how often sixty was not enough* — the count of requests the limiter actually refused.
Sixty is right if the first stays well under it and the second stays at zero. It is wrong, and wrong
in a way that costs somebody their afternoon, the moment the second is not zero.

Neither could be measured, and the reason was not that nobody had looked. `write_attempts` holds an
`at`, a `subject` and a route, which is enough arithmetic — but the subject is an account id or an
internet address, so keeping it long enough to measure anything is keeping personal information for a
purpose the register does not name; and a refused request never reaches that table at all, because
the limiter answers and returns first. The number that matters most was the one nothing counted.

So `write_windows` was added, and it is deliberately the least that would answer the question: five
integers per fifteen minutes — the window, how many callers there were, how many requests they made
between them, the most any one of them made, and how many were refused. **No subject, no address, no
route, and nothing to join to anything.** It is in the holdings register under a basis of its own
that says, in the words a data subject reads, that there is nothing of theirs in it. The counts are
rolled up by the retention sweep immediately before the attempts behind them are deleted, because
after they are deleted there is nothing left to summarise. `GET /health/limits` reads them back on
the loopback, reports `settled: false`, and says what would change that.

Two things are stated rather than smoothed over. `busiest` is measured over a **fixed** fifteen-minute
bucket while the limiter counts a **sliding** one, so a caller working across a boundary is split
between two buckets and the figure is a *lower bound* on what the limiter saw — which is the
direction that matters for "does anybody come near sixty". And `refused` is a scalar: if refusals ever
appear, the next thing worth adding is which route they were on — safe to add, because a route is one
of a closed set of strings out of this repository — and it is deliberately not added before there is
a refusal to explain.

**Two things this found that the register had promised and no code carried out.** `write_attempts`
was in `SweepableTable`, in the store's list of what may be deleted, and in the holdings register
under a sentence saying it was "swept away on its own within a day in any case" — and it was not in
the sweep's plan at all, so the one table here that grows with traffic rather than with people was
growing without limit. And an erasure reached six tables and not that one, while the register told
the person it was "deleted with everything else". Both are fixed, both are tested in
`test/write-windows.test.ts`, and the sentences in the register now say what the code does. A
boundary check refuses `write_windows` any column somebody could be identified by, because the whole
justification for keeping it for ever is that there is nobody in it.

**The only caller in this repository was asked, and it settled nothing.** The obvious candidate is
the Playwright suite: it drives real HTTP at this service through the app's own `/api` proxy, and a
full run is the busiest thing anybody here has ever pointed at it. So it was run against a live
service on 10 September 2026 — 363 tests, both viewports — and the answer is that the harness is not
a caller and does not become one by being busy. The proxy sets `changeOrigin`, so every request in
the run arrives from one loopback address and the service sees a single caller; and of the sixty
requests that caller was allowed before the limiter closed, **fifty-nine were `GET /health`** — the
liveness probe the web app makes when a page loads — and the sixtieth was the `GET /health/limits`
that read the measurement back. Nothing was signed up, nothing was consented to and nobody was
vetted, because the suite drives a design preview that is built to run with no backend at all. The
busiest window it can produce is a count of how many pages a browser opened, which is an answer to a
different question. **Sixty is still a proposal, it is unchanged, and the paragraph above still
describes the only two things that would settle it.** A test harness is not a nurse, and reporting
its arithmetic as a measurement would be worse than having none.

**One thing that run did find, and it is a decision rather than a number.** Those sixty were spent in
five and a half minutes, and the rest of the run made **561 refused requests** — every one of them
the same health probe on another page load. Read against the criterion above, *it is wrong the moment
`refused` is not zero*, that is a limiter set absurdly low. It is not. It is a liveness probe being
counted as something a caller chose to do, and one browser reloaded sixty times — or one office
behind one router — arrives at the same place. Whether `GET /health` belongs inside a per-caller
write budget at all is a decision about what a legitimate caller may do, which is the kind of
decision this section exists to record rather than have somebody make quietly at three in the
morning. It is not made here. What is written down here is that the question exists, that the 561 is
not evidence about sixty, and that whatever `busiest` a suite run produces must never be quoted as
though a person had done it.

Three routes are exempt and only three: `POST /auth/start`, `/auth/verify` and `/auth/second-factor`,
each of which already carries a tighter limit of its own counted against the mobile number, the
address or the challenge. A boundary check refuses any addition to that list, because a route nobody
thought about is exactly the one that is still unlimited a year later. `POST /auth/logout` is *not*
exempt, and nothing is exempt for being harmless.

### The nine rows that changed, and the nine controls that could not be built

Counted off the table above, which has twenty-seven rows since the ingestion boundary landed:
**twelve are Implemented, five are Partly and six are Absent.** The remaining four are the ones that
are none of the three, and each says why in its own row — Home Affairs (an adapter built and never used, because no provider is contracted), the
health verification routes (Closed rather than implemented, because closing a hole is not a control),
TLS (absent from the service by design, because it terminates at a proxy) and Clinical AI (not the
service's question at all; it is enforced in the catalogue).

Before this revision the same twenty-six rows read **six Implemented, four Partly and twelve
Absent**, with the health routes Open rather than Closed. So five rows moved into Implemented, one
moved from Absent to Partly, one closed, and one stayed Partly with a different reason. What moved:

| Row | Was | Is | What closed it |
|---|---|---|---|
| Authorisation | Partly | **Implemented** | Nine routes, and an actor that cannot be named on a request |
| Role-based step-up | Absent in the service | **Implemented** | A session now resolves to a vetted role, so the `capability` branch is reached |
| Export | Absent | **Implemented** | A stepped-up, gate-decided, inline answer with three declared exclusions |
| Correction | Absent | **Implemented** | A right of its own, with the number, the logs and the vague request all refused |
| The operator queue | Absent | **Implemented** | Both section 24 rights, the clock, and a proof of response nobody edits |
| The health verification routes | Open | **Closed** | The loopback restriction the comment beside them always claimed |
| Who wrote the consent down | Absent | **Partly** | The three routes a person cannot honestly declare are refused |
| Incidents | Absent | **Partly** | A section 22 register with three refusals; detection, paging and delivery still absent |
| Devices | Partly | **Partly** | Unchanged in state, changed in reason: the capturer is resolvable now, the device is not |

And the six rows still Absent, each with the obstacle rather than the shortage of time. They name
nine distinct controls between them, and every one is blocked on something outside this repository —
a vendor, a key ceremony, an agreement, or a fact about a person that no code can establish.

Six need a vendor, a key or a contract: **OIDC** (a contracted provider and a client registration);
**clinician verification** (agreements or accreditations with twelve of the thirteen authorities, and
an accredited identity provider for the thirteenth); **device binding** (a key per device, minted in a
ceremony); **HSM or KMS, split-knowledge custody, per-patient derivation and re-encryption** (a vendor
and a key ceremony); **residence and transfers** (a hosting decision, a subprocessor register and a
section 72 determination about a named recipient in a named country, none of which exists); and
**publishing the chain head** (a notary, a regulator, a partner or a public transparency log — the
whole value of it is that the place is not MyThuso's, so a second table on the same box is a longer
way of not publishing).

**Three of those six were looked at again on 10 September 2026, and two of them moved a little.** The
question asked was whether any had a *reduced but honest* form that needed nobody's signature, and
the answer has to survive the standard this document sets everywhere else: do not build a thing that
resembles a control.

- **HSM or KMS — still absent, and deliberately.** Split-knowledge custody is the one of the four
  that needs no vendor, and it was rejected on the argument this document already makes about the
  chain head: on one box every share is read by one process from one machine that one person
  administers, so shares in an environment file are a longer way of not splitting the key. It would
  protect against one person walking off with a key during a ceremony nobody currently performs, and
  against nothing else, while reporting a control that would be believed.
- **Publishing the chain head — still absent; the half that is not an agreement is built.** The
  publishing is unchanged and needs a second organisation. What was missing and was *not* an
  agreement is the ability to take a statement back: `src/protection/witness.ts` answers whether this
  chain is still the chain a held statement was made about, which is the one question a hash chain
  cannot ask of itself, because an empty log verifies. It is worth nothing until somebody else holds
  a head, and it says so on its own face.
- **A section 72 determination — blocked, and it stops there.** It is a legal determination about a
  named recipient in a named country. There is no recipient. What was added is not a control: eleven
  suppliers in `packages/catalog/feeds.json` each carry the determination that will be owed when they
  are signed, marked undetermined, with a boundary check refusing any of them to claim otherwise.

Three need a fact this platform cannot yet establish about a person: **guardian authority** (a birth
certificate, an adoption order or a court order, verified against Home Affairs or a court);
**recipient, scope and expiry per consent, and downstream propagation** (there is no recipient,
because there is no clinical record and nobody to give one to); and **an audited, reversible account
recovery** (somebody has to be accountable for a reversal, and there is no operator organisation).

And two are governance rather than code, and sit under rows this table calls Partly rather than
Absent: the **purpose and field inventory** and the **privacy impact assessment** under data
minimisation, both of which the Information Officer and South African counsel determine and a file
cannot determine on their behalf. The holdings register is an inventory; it is not a limit, and
nothing in this service stops a field being collected.

And one is `clinical-records` itself, which **nothing here changes**. No clinical record exists, no
route touches one, and `scripts/check-boundaries.mjs` still fails the build on a clinical table in
`apps/api`. Four tables were added in this revision — `write_attempts`, `correction_requests`,
`subject_request_responses` and `incidents` — and every one of them was put through that check, which
now also refuses a column in the incident register that somebody could be named in.

---

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
fails the build on a clinical table still refuses one, and why `apps/api/src/config.ts` still says
the service holds no health information. That check has since been made precise rather than
permissive: it reads table and column names instead of the prose around a schema. See "Consent, and
the log of who opened a record" below.

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
that issued it.** Thirteen issuing authorities appear in `packages/catalog/vetting.json`; the running
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
cannot show anybody an attempted intrusion. Every entry that reaches the gate carries the id of the
gate's own hash-chain entry for the same decision, so the two can be read side by side. It is
append-only by contract, guarded by a boundary check on `UPDATE` and `DELETE`, exactly as `audit` is.

**And it is now tamper-evident, without the consent module holding a key.** The gap this file used to
record here was real and was understated. It said the two logs could be *reconciled* through
`audit_id`; they could be *correlated*, and nothing was reconciling them. An id is a pointer, and a
pointer survives the row it points from being rewritten — somebody with the database file could
change an actor, a subject, a basis or an outcome and leave the id untouched, and every query in the
service would answer the same as before. The entries most worth altering were worse off still: a
reading refused for a missing lawful basis, or on a withdrawn consent, never reaches the gate, so it
carried no id at all and had nothing on the other side to be lined up against.

What closes it is a division of labour rather than a key crossing the wall, and the original
reasoning — *a module that can compute the chain is a module that can forge it* — is kept exactly.
Each row in `record_access_log` now carries `previous_hash` and `hash`, a plain SHA-256 chain over
its own contents. That much is worth nothing on its own and the code says so: SHA-256 is a function
anybody can compute, so an attacker who edits row 40 recomputes rows 40 onwards and hands back a log
that verifies against itself. So the *head* of that chain is committed, periodically, into the
gate's HMAC chain as a seal — by `apps/api/src/protection/seal.ts`, which is on the side that holds
the key. Editing a row changes the head; recomputing the whole chain changes the head; deleting,
reordering or truncating removes a head that was sealed. Forging the seal needs the audit key, and
what crosses the boundary is a `LogSeal` with two methods — commit this head, and nothing else. It
cannot write an access entry, cannot read one, and cannot make a tampered log verify. A boundary
check fails the build if the consent module ever imports the chain itself.

`GET /health/access-log` runs the verification and names the first entry that does not follow. It
does not seal before it verifies, which would commit whatever it found; a boundary check holds that
too. `apps/api/test/access-log-integrity.test.ts` proves the whole of it by opening the SQLite file
as a second connection and editing rows the service has no code path for.

**What the seal does not cover, stated as a number rather than a hope.** A seal covers the log as it
stood when it was written. Entries appended since the last one are vouched for by their own
recomputable digest and nothing else, so a row forged into that window is not detected — the
verification reports how many entries are in it rather than rounding it away. The window closes every
fifty entries or five minutes, whichever comes first, and a restart always seals. Rows written before
the links existed are reported as vouched for by nothing rather than as tampering, and are not
backfilled: hashing rows the service cannot know were unaltered would produce a chain that certifies
whatever it found. And everything `apps/api/src/protection/audit.ts` says about its own chain still
applies — it is tamper-evident, not tamper-proof, and it proves nothing at all against somebody
holding the database file *and* the key ring, which are deliberately two different things to steal.

**It records that a record was opened, never what was in it.** There is no column a reading could go
in; `packages/catalog/consent.json` names the column words that may never appear, and the boundary
check reads that list from the contract rather than from anybody's memory.

The clinical-table check beside it *was* touched, and it needed to be. It used to take every
`CREATE TABLE …;` out of a source file with a regular expression and grep the whole statement for
words like `clinical`, `vital` and `observation`. Two things were wrong with that. `CREATE TABLE[^;]+`
runs to the next semicolon in the *file*, so it scanned the prose underneath a schema — the sentence
"a CREATE TABLE will not add one" in `apps/api/src/vetting/store.ts` was being read as a table. And
grepping a whole statement cannot tell a table of clinical data from a table about access to clinical
records, which is why this log is called `record_access_log`: `clinical_access_log` would have failed
the build for entirely the wrong reason, and a check that pushes people towards vaguer names is a
check making the codebase worse. `scripts/clinical-tables.mjs` now parses the table name and every
column name and holds *those* to the word list. The word list itself is unchanged, to the letter.
The one distinction it draws is that `observation` is a column that holds a reading and
`observation_id` is a column that names one, so an identifier whose last segment is one of seven
words that can only name, group, count or order a thing — id, ids, type, ref, count, log, seq — is
read as being about the record rather than being it. A date is deliberately not among them:
`observation_at` is when somebody's reading was taken, and it is refused. The check proves itself
both ways on every run, against schemas that must still fail and schemas that must now pass, and it
still does not catch a table called `readings` with a column called `value` — precision does not fix
vocabulary, and a green build is not the proof that no clinical value can reach this service.

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
Closing that needs a disposal a boundary check can tell apart from a deletion, and it is not built —
and it is now harder rather than easier, because a disposal has to be something the seal can be told
about or every sweep would read as tampering. Nothing has been added to the configuration for any of
this and nothing is refused for it in production: sealing has no switch to turn off, which is the
only reason there is no refusal to write. A knob would have needed one.

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

No backend calls, analytics or external media dependencies are included. The browser’s fixture state is not written to localStorage, sessionStorage or IndexedDB. Web CSP disallows objects, off-origin scripts and form submission; inline styles remain allowed for presentation. The development CSP allows same-host WebSocket connections for Vite.

The identity service sets its own security headers rather than waiting for a hosting layer to supply them. That sentence used to read “production must supply HTTP security headers … at the hosting layer”, which is a control owned by nobody — and the box named in `deploy/README.md` serves five unrelated production sites whose config this repository is forbidden to touch, so “the hosting layer” was never going to be edited for this. Every answer from `apps/api`, refusals and preflights included, now carries `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, a `Permissions-Policy` refusing camera, microphone and geolocation, `Cross-Origin-Resource-Policy` and `Cross-Origin-Opener-Policy: same-origin`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. HSTS — two years, subdomains included, **no `preload`** — is sent only where the session cookie is already `Secure`, because a development server that taught a browser to refuse `localhost` over http for two years would be a header nobody could turn off. A proxy may add more; it can no longer be the only thing that adds any. Nine boundary checks keep each of them set, and hold HSTS to being conditional.

Time is capped as well as size. The body has been held to 8 KiB since the service was written; the request is now capped at fifteen seconds, the headers at five, an idle keep-alive connection at five, and the header count at forty. Before that the service inherited Node's defaults — a five-minute request timeout and no header cap — so a connection sending one header byte a minute cost nothing to open and held a socket for five minutes. Nothing here needs five minutes.

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
fails the build on a clinical table in this service still refuses one** — it now reads identifiers
rather than whole statements, which refuses more precisely rather than less. What can be built honestly
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

## GilbertOne's second tier, and what it sends

GilbertOne answers in two tiers. The first is the on-device matcher — the approved sentences and the emergency red flags Thuso SOS already asks about — and nothing about a question it can place leaves the patient's browser or phone. The second is `apps/assistant-api`: a service the web panel may ask, same-origin, only after the on-device contract could not place the question, and only when an operator has configured a model provider. Four states matter between the code existing and a public model answering, and they are four different answers to "is it working":

| State | What is true |
|---|---|
| **Bridge shipped** | Every deploy publishes the panel's own code and the `/assistant/` nginx location. The panel asks the bridge and silently falls back to the on-device answer while the service is dark — its behaviour during an outage is its behaviour on day one, which is why no deploy ever needed this to succeed. |
| **Runtime installed, disabled** | The bundle and its unit sit at `/opt/mythuso/assistant`; `systemctl is-enabled assistant-api` says `disabled`. This is the state of every deployment of this build. |
| **Provider configured** | `/etc/mythuso/assistant.env` holds an Azure endpoint, key and deployment name — typed into `deploy/ops/configure-assistant-env.sh` on the box, `0600 root:root`, never through this repository, never printed. In production the service still refuses to start: a credential alone may not switch a public model on. |
| **Production operational** | The operator has appended `MYTHUSO_ASSISTANT_PRODUCTION=acknowledged` to that file by hand and enabled the unit. Only then can text reach a model. `deploy/RUNBOOK.md`, "Activating the assistant service", is the full sequence and the rollback. |

**What the second tier may receive, and after what.** Typed text — or text the browser's own speech recognition turned a patient's speech into — is posted same-origin to `/assistant/turn` and, after `redactPHI` has removed identifying detail, may be sent to the language model provider configured for MyThuso. **No audio recording is kept at any point**: the web microphone is push-to-talk browser recognition with no recorder anywhere in the build, and the phone applications transcribe on-device. The consent disclosure in `packages/catalog/assistant.json` now says all of this in the patient's own words: what may be sent and after what removal, that nothing is recorded, and that identifying health information should not be entered. The sentence that used to be there — that no model receives what a person says — was true of the matcher and false of the tier standing behind it, and it is gone.

**What it cannot do.** The model never diagnoses and never prescribes; the emergency and refusal language stays the matcher's and the contract's, unchanged and never softened; an answer a model refined is marked as such rather than presented as an approved sentence. The provider is reached only over HTTPS, through a location with a 16 KB body limit and a per-address rate limit in nginx; a browser origin other than the site's own two names is refused before any route reads the URL. `GET /assistant/health` answers in booleans — never the endpoint, never the key — and the service holds nothing at rest: sessions live in memory, no file is written, and the unit runs as systemd's ephemeral `DynamicUser` with `LimitCORE=0` so the key in its environment cannot reach a core file.

**What this does not change.** No capability becomes connected because the assistant is: `/status` still reports fifteen capabilities and none of them live, and activation of the second tier is not the activation of `screening`, `voice`, `clinical-records` or anything else. And **before real patient text is acceptable, the Azure data-processing and residency questions are decisions, not defaults** — the section 72 determination this document names everywhere else applies here too, and the acknowledgement line is the operator's moment to have answered it.

## Health Passport P0, and why it does not deploy

The master document puts the Passport in Phase 0 — its own service, database and keys, live before the first visit — and makes a signed DPIA and a governance sign-off its exit criteria. `apps/passport` is the first half of that: the separation, the gateway, the sealed keys, the audit chain and break-glass, built and tested against synthetic data. The second half is not code. There is no data protection impact assessment, no registered Information Officer and no decision on where the data may reside; the master key is an environment variable rather than a key held in an HSM or KMS; nothing authenticates a requester beyond a signed grant artefact; and the chain head is anchored nowhere. So the service refuses to start without an explicit development flag, answers only on the loopback, and `scripts/check-boundaries.mjs` fails the build if anything under `deploy/` names it or its port. When the DPIA is signed, that check is the one to change — deliberately, in the same commit that says why.

### Passport P1: share links, the export and the emergency card, still development only

P1 adds three things the Passport does and changes nothing about where it may run. **A share link** is made by the
patient in their own session and rides on a consent grant they already made: it opens no more than that grant, for
that grant's purpose, ends with the grant or sooner and never after the grant ceiling in `packages/catalog/consent.json`,
and is never made for a scheme, an insurer or an employer. Its secret is shown once, kept only as a SHA-256 digest,
travels on the Authorization header and never in an address, and is never written into the audit chain, which names
the link by its reference. Every use, granted or refused, is a gateway read in the patient's chain, written as the role
of the grant the link rides on — the chain knows no more about a bearer than that, and says nothing it cannot know. A
grant's terms and a link's scope are sealed under the subject's own key, because a scope can name a sealed category.
**The export** is the patient's own record as a FHIR R4 Bundle, in their own session; it is **not stepped up**, because
the Passport has no second factor and the identity service's step-up does not reach it, and the answer says so rather
than implying a control. Sealed entries go in only when ticked by name; private entries, break-glass notes, the chain
itself, keys and blinded tags never do. Nothing is kept for collection. **The emergency card** is a share link
restricted to the emergency summary, and every screen that shows one says first that it is a preview and connected to
no responder; its QR code reads as a sentence saying so. None of this is absent from the list above in any way that
matters less than before: a link is a copy of access at an address, which makes the missing OIDC, mutual TLS, KMS
custody and anchoring of the chain head more pressing, not less.

Nothing in it changes the state of `clinical-records`. The identity service still holds no clinical table, and the boundary check that says so is untouched.

### The HL7 v2 bridge (Wave 5), still development only

§26's `POST /hl7v2/inbound` is built inside the Passport P0 and inherits every reason above that it does not deploy, and
adds one: a partner interface is a network path from outside into the record, and the mutual TLS per partner, the
operator agreements under POPIA section 21 and the conformance testing it needs do not exist. So **no partner system
reaches it**. A developer holding a console-minted credential sends a message from one of two registered synthetic
partners as JSON over the loopback; **MLLP is not served**, and the build fails if `apps/passport` opens a TCP or TLS
listener of its own or frames a message as MLLP does, and if anything in `deploy/` names the bridge.

**Minimisation, as refusals.** The parser reads MSH, PID-3, PV1, OBR and OBX and nothing else: a note (NTE) is not read,
because free text is where a name is written and the Passport cannot screen a name out of prose. A patient is matched
**only** on a hospital number they linked in their own session — the consent basis for acting on a message — kept as a
keyed digest under a partner key derived from the master key; the Passport holds no name or date of birth and never
matches on one. A matched message carrying any other PID field is refused, nothing from it is stored, and the refusal is
written into that patient's chain. A thirteen-digit identifier is refused whatever authority it is linked under. A
visit number and a partner's control ID are kept only as tags.

**Unmatched messages are refused, not guessed.** A message the Passport cannot match is refused with AR and recorded in
a quarantine that holds who sent it, what kind, which refusal and when its record is deleted — never the message, its
control ID, an identifier or a value — and nothing is ever released from it into a record. Its retention is a Record
setting proposed at 30 days, which **the Information Officer confirms (D-8)**; each record keeps the deletion day it was
given, and deleting it is the only DELETE in the service besides the replay rows of messages that reached nobody. The
audit chain is still never updated or deleted.

**Every message is an access.** Accepted or refused, each is written into the hash-chained audit log under the partner
that sent it and the developer's reference, in the patient's chain when a patient was found and under nobody when not;
the patient reads each in `/audit/mine` and on the access log screens, by partner and kind, and never by content. A
discharge revises its admission's Encounter as a new version and keeps the old one sealed.

**What crosses to an engine.** Nothing a message said. An admission and a discharge are announced by reference, and both
events now refuse a diagnosis, result values, the patient identifier, a name, the visit number and the raw message. A
result is handed to Medicines as references, a time and a verifier's registration — the lab-result door's rules — and
Medicines, not Record, announces it; it is not complete until the clinician who ordered it acknowledges it. An
Encounter or a DiagnosticReport a partner wrote is left out of the export and of share links, and says so, until new
versions of those routes declare them.

Nothing in it changes the state of `clinical-records` or `laboratory-results`, which stay absent.
