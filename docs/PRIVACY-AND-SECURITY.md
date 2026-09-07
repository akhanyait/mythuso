# Privacy and security implementation plan

This is a requirements and release-gate document, not a claim that the UI is POPIA-compliant. POPIA is the Protection of Personal Information Act; health information is special personal information. Determine the lawful basis and applicable authorisation for each processing purpose with the Information Officer and qualified South African counsel. Do not treat one checkbox as permission for every use.

Authoritative starting points: [Information Regulator POPIA resources](https://inforegulator.org.za/popia/), [special personal information provisions, including section 32](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-b-processing-of-special-personal-information/), [guidance on special personal information](https://inforegulator.org.za/wp-content/uploads/2020/07/InfoRegSA-GuidanceNote-Processing-SpecialPersonalInformation-20210628.pdf), [prior authorisation](https://eservices.inforegulator.org.za/priorauthorisation/default.aspx).

| Control | Preview now | Required before real information |
|---|---|---|
| Data minimisation | Fictional fixtures; memory-only state; no analytics | Purpose/field inventory, minimum collection, privacy impact assessment |
| Identity | **Built** in `apps/api`: one-time-code sign-in, peppered hashes for codes and sessions, attempt burning, rate limits per number and per address, no account enumeration, sliding idle and hard absolute session limits, append-only auth audit, and production refusals for a weak pepper, an http origin or no SMS provider. Plus the sign-up preview with local check-digit validation and three account-recovery routes as designed states | OIDC, MFA where appropriate, Home Affairs verification through an accredited provider, clinician verification, guardian authority, rate limiting, device binding and an audited, reversible recovery process |
| Authorisation | Twelve vetted parties, and a capability each is refused by name until its checks pass — dispatch, clinical sign-off, prescribing, dispensing, result release, sample custody, guardian access and the rest. Enforced in the interface only | Server-side deny-by-default object/tenant/relationship checks; audited break-glass process |
| Consent | Optional switches, sharing preview, sign-up consent separated into required and optional, and spoken visit consent that records refusal as a valid outcome | Versioned purposes, lawful basis, recipient/scope/expiry, proof, withdrawal and downstream propagation |
| Family care | Guardian invitation preview in which scope, duration and identity verification are three separate decisions, revocable, with sensitive categories excluded from every scope | Verify guardianship and delegated authority with proof; no record access merely because someone pays; a record of the child's own views as they grow older |
| Export | Explicit export of a fictional sample | Step-up identity check, scoped export, audit, expiry and secure delivery |
| Deletion/correction | Acknowledgement preview on web | Track requests and response duties; distinguish deletion from legally required clinical retention |
| Audit | Sample access timeline including a guardian access event; append-only incident log in the Control Tower preview; an append-only vetting decision log recording who decided, when, on what evidence and what changed. All of it in memory, and gone on reload | Append-only access/decision logs with integrity, restricted retention and no full clinical payloads |
| Encryption | No connected backend; cleartext disabled on Android | TLS; managed KMS/envelope encryption; key separation and rotation; encrypted backups; storage access policies |
| Residence/transfers | No cloud deployment | Prefer SA regions as a project choice; assess every operator/subprocessor and cross-border transfer under section 72 and applicable prior-authorisation requirements. POPIA is not a blanket SA-only hosting rule. |
| Clinical AI | No model or inference. Out-of-range readings are flagged against indicative adult reference ranges and labelled in the UI as not a validated early-warning score | Validated intended use, provenance, review state, model/version audit, clinician sign-off, incident monitoring; no autonomous diagnosis |
| Devices | No device access. The permission-denied state is designed, and declining never blocks a visit | Applicable registration/exemption assessment, validated readings, signed firmware and secure pairing |
| Incidents | Severity triage, immediate-action choice, handover note and demo log; a critical severity states that the form never precedes calling emergency services | Detection, containment, investigation, real paging, and notifications under applicable law; rehearsed playbooks and accountable owners |
| Research and marketing | Off by default in preview | Separate purpose assessment; no assumption that pseudonymised health data is anonymous |

## What the identity service does and does not hold

`apps/api` holds a name and a mobile number. Under POPIA that is personal information; it is not the
special personal information that health data is, and that distinction is the whole reason this
slice could be built before the rest of the controls in this document exist. It is enforced rather
than trusted: `scripts/check-boundaries.mjs` fails the build if a clinical table appears in the
service, if the audit table is ever updated or deleted from, or if the service stops declaring what
it holds.

Before any health information reaches a server, the rest of this document applies in full —
PostgreSQL with encryption at rest and key separation, SA hosting, step-up authentication before
records, sharing and export, an append-only clinical access log distinct from the auth log, a
retention schedule that distinguishes deletion from legally required clinical retention, an
Information Officer, and a data protection impact assessment.

## Concrete preview protections

No backend calls, analytics or external media dependencies are included. The browser’s fixture state is not written to localStorage, sessionStorage or IndexedDB. Web CSP disallows objects, off-origin scripts and form submission; inline styles remain allowed for presentation. Production must supply HTTP security headers (including CSP frame-ancestors, HSTS, Permissions-Policy and Referrer-Policy) at the hosting layer. The development CSP allows same-host WebSocket connections for Vite.

Android denies cleartext and disables backup; no network or sensitive permissions are declared. SwiftUI/Compose implement screens directly. The no-WebView gate scans native source; it does not replace an audit of future third-party binary SDKs. No production credentials or private proposal contents are copied into public web assets. The catalogue and branding intentionally appear in the UI; deployment is not authorised or performed by this work.

## Clinical and operational separation

A nurse can capture observations within verified scope; a doctor signs diagnosis, prescription and certificate outputs. Drafts and algorithm flags cannot masquerade as signed decisions. Pharmacy/laboratory partners receive only the minimum order information needed for fulfilment. Employers and sponsors do not receive named health data by default. Unresolved incidents require a real escalation policy rather than a decorative dashboard counter.

The preview now shows what that separation looks like in the interface. A visit does not start if the patient's visit code fails; the nurse contacts the Control Tower instead. A nurse assessment is presented as an assessment, attributed to a SANC registration, and states that prescriptions, sick notes and referrals need a doctor. A doctor cannot sign a decision without selecting an outcome and writing a rationale. Abnormal laboratory results are held until a clinician releases them with an explanation, rather than being pushed to a patient automatically. Nurse dispatch is gated on a vetting record that re-runs on a schedule rather than once at sign-up, and that schedule is arithmetic rather than a claim: a stored "verified" is resolved against its own expiry date every time it is read, so a lapsed police clearance suspends a nurse and a lapsed ISO 15189 accreditation withdraws a laboratory's ability to release a result, with nobody having to notice first. A high-risk check verified by one reviewer does not count until a different reviewer agrees, and the console refuses to let one name do both. None of these are enforced by anything other than the interface in this preview; the server must enforce every one of them before real information is involved.

Real urgent-care functionality must not launch until referral/ambulance pathways, coverage, response expectations and failure handling are verified. The preview dispatches no emergency help.
