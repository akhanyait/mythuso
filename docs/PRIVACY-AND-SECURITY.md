# Privacy and security implementation plan

This is a requirements and release-gate document, not a claim that the UI is POPIA-compliant. POPIA is the Protection of Personal Information Act; health information is special personal information. Determine the lawful basis and applicable authorisation for each processing purpose with the Information Officer and qualified South African counsel. Do not treat one checkbox as permission for every use.

Authoritative starting points: [Information Regulator POPIA resources](https://inforegulator.org.za/popia/), [special personal information provisions, including section 32](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-b-processing-of-special-personal-information/), [guidance on special personal information](https://inforegulator.org.za/wp-content/uploads/2020/07/InfoRegSA-GuidanceNote-Processing-SpecialPersonalInformation-20210628.pdf), [prior authorisation](https://eservices.inforegulator.org.za/priorauthorisation/default.aspx).

| Control | Preview now | Required before real information |
|---|---|---|
| Data minimisation | Fictional fixtures; memory-only state; no analytics | Purpose/field inventory, minimum collection, privacy impact assessment |
| Identity | **Built** in `apps/api`: one-time-code sign-in, peppered hashes for codes and sessions, attempt burning, rate limits per number and per address, no account enumeration, sliding idle and hard absolute session limits, append-only auth audit, and production refusals for a weak pepper, an http origin or no SMS provider. Plus **a second factor**: TOTP (RFC 6238) on `node:crypto`, its secret encrypted at rest, enrolment inactive until a code is typed back, hashed single-use recovery codes, and a sign-in that has answered the one-time code but still owes an authenticator code holding a ten-minute challenge rather than a session. Step-up is never demanded of an account with no second factor enrolled. Plus the sign-up preview with local check-digit validation and three account-recovery routes as designed states | OIDC, Home Affairs verification through an accredited provider, clinician verification, guardian authority, device binding and an audited, reversible recovery process. **Designed, not wired:** which roles must carry a second factor derives from the vetting grants `prescribe`, `sign-clinical-review`, `dispense`, `release-lab-result` and `view-patient-record` (`apps/api/src/stepUp.ts`), and the service does not yet know about roles at all |
| Authorisation | Twelve vetted parties, and a capability each is refused by name until its checks pass — dispatch, clinical sign-off, prescribing, dispensing, result release, sample custody, guardian access and the rest. **Built** in `apps/api/src/vetting`: the evidence vault, the lifecycle and the refusals now run on the server, and the gate resolves an actor's standing out of stored evidence on every single read, so a lapsed clearance withdraws a capability with nobody having to notice first. What is still interface-only is everything the server has no records for — patients, visits, care relationships | Server-side deny-by-default object/tenant/relationship checks over clinical records, which do not exist yet; an audited break-glass process (the gate's break-glass route is built and refuses to write anything at all) |
| Consent | Optional switches, sharing preview, sign-up consent separated into required and optional, and spoken visit consent that records refusal as a valid outcome | Versioned purposes, lawful basis, recipient/scope/expiry, proof, withdrawal and downstream propagation |
| Family care | Guardian invitation preview in which scope, duration and identity verification are three separate decisions, revocable, with sensitive categories excluded from every scope | Verify guardianship and delegated authority with proof; no record access merely because someone pays; a record of the child's own views as they grow older |
| Export | Explicit export of a fictional sample | Step-up identity check, scoped export, audit, expiry and secure delivery |
| Deletion/correction | **Built** in `apps/api`: a holdings register classifying every table `erase`/`anonymise`/`retain`, each with a plain-English ground written for the data subject and each naming a **retention basis** — what keeps it, from when, under which instrument, and whether it pulls against section 24. Disposal dates are derived from the basis and its anchor, and are *null* wherever no honest date can be worked out. The section 24 thirty-day clock runs from receipt; erasure has a seven-day grace period, an immediate sign-out and a tombstone that is unique and unreachable (RFC 2606 `.invalid`, and not a number that could be dialled); the retention sweep is a dry run unless committed. The answer names what could **not** be erased and calls it a partial refusal in that word, with the ground and the disposal date, and points at the Information Regulator. The clinical retention rules — six years from the last entry, a minor's record until twenty-one, mental health and occupational health longer again — are modelled and marked as holding nothing, because nothing clinical is held here. Acknowledgement preview on web | The clinical bases attached to actual clinical holdings, once any exist; correction as distinct from deletion; an operator queue and proof of response; and a determination by the Information Officer and counsel of every period this register currently records as MyThuso's own setting |
| Audit | Sample access timeline including a guardian access event; append-only incident log in the Control Tower preview. **Built** in `apps/api/src/protection/audit.ts`: a hash chain keyed from the key ring, so an edited, deleted, re-ordered or forged entry is detectable and `verify()` names the first break — tamper-evident, not tamper-proof. **The vetting decision log is now that chain rather than a preview**: every enrolment, submission, verification, second reviewer, decline, suspension and detected substitution is an entry in it, and two append-only logs would have been one append-only log and one table somebody eventually tidies. The audit key is pinned to the oldest key version, so a key rotation does not make the whole log stop verifying | Publishing the chain head somewhere the operator does not control, which is what turns evidence of tampering into evidence somebody else can check |
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
diploma, a schedule of cover. Every table of it is listed, classified and explained in
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
Affairs, there is no accredited verification provider, and "verified" in this service means a named
reviewer looked at a document the platform can still produce and said so.

It is enforced rather than trusted: `scripts/check-boundaries.mjs` fails the build if a clinical
table appears in the service, if the audit table is ever updated or deleted from, or if the service
stops declaring what it holds.

Before any health information reaches a server, the rest of this document applies in full —
PostgreSQL with encryption at rest and key separation, SA hosting, step-up authentication before
records, sharing and export, an append-only clinical access log distinct from the auth log, an
Information Officer, and a data protection impact assessment.

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

## Clinical and operational separation

A nurse can capture observations within verified scope; a doctor signs diagnosis, prescription and certificate outputs. Drafts and algorithm flags cannot masquerade as signed decisions. Pharmacy/laboratory partners receive only the minimum order information needed for fulfilment. Employers and sponsors do not receive named health data by default. Unresolved incidents require a real escalation policy rather than a decorative dashboard counter.

The preview now shows what that separation looks like in the interface. A visit does not start if the patient's visit code fails; the nurse contacts the Control Tower instead. A nurse assessment is presented as an assessment, attributed to a SANC registration, and states that prescriptions, sick notes and referrals need a doctor. A doctor cannot sign a decision without selecting an outcome and writing a rationale. Abnormal laboratory results are held until a clinician releases them with an explanation, rather than being pushed to a patient automatically. Nurse dispatch is gated on a vetting record that re-runs on a schedule rather than once at sign-up, and that schedule is arithmetic rather than a claim: a stored "verified" is resolved against its own expiry date every time it is read, so a lapsed police clearance suspends a nurse and a lapsed ISO 15189 accreditation withdraws a laboratory's ability to release a result, with nobody having to notice first. A high-risk check verified by one reviewer does not count until a different reviewer agrees, and the console refuses to let one name do both.

Those last two are no longer interface-only. `apps/api/src/vetting` holds the evidence, resolves the expiry on every read, and refuses a second reviewer who is the first reviewer, the party themselves, or a check that is not high-risk in the first place; a new document dropped against a check that was already verified clears the previous decision *and* the previous second, because neither of them saw this file. The renewal warnings are built to survive a night the sweep did not run — a milestone is due once its date has been reached or passed and it has not been sent, with a dedupe key so a nightly run does not re-alert until somebody stops reading them — and the smallest passed milestone is the one delivered, because an alert headed "45 days" about a certificate expiring in nineteen is simply wrong. The rest of the separation in this paragraph — visit codes, assessment attribution, held laboratory results, doctor sign-off — is still enforced by the interface alone, and the server must enforce every one of them before real information is involved.

Real urgent-care functionality must not launch until referral/ambulance pathways, coverage, response expectations and failure handling are verified. The preview dispatches no emergency help.
