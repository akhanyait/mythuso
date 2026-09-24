# Data Protection Impact Assessment — draft

> **Draft prepared for review. Not a signed DPIA and not legal advice. It has no effect until the
> named person signs.**
>
> Prepared on 15 September 2026 by the Governance documentation lead (Wave 3), from the repository
> as it stood at commit `3294e1a`. It is written to be completed by the responsible party with the
> Information Officer and South African counsel. Every factual statement about the system cites
> the file it comes from. Likelihood and impact are left blank for the assessor. Where the answer
> is a legal judgement, this draft asks the question and leaves the answer blank.

**How to use it.** Read `DATA-RESIDENCY-OPTIONS.md` and `KEY-CUSTODY-OPTIONS.md` first: several
risks below cannot be rated until those are decided. Then complete the blanks, rate each risk, and
sign section 12. The Information Officer's own decisions are in `INFORMATION-OFFICER.md`.

## 1. Scope and context

### What MyThuso is meant to do

A patient books a home visit; a SANC-registered nurse visits; a registered doctor reviews what the
nurse found. Around that sit a patient-owned Health Passport, field safety for nurses, payments,
an assistant called GilbertOne, devices, rewards and family care (`CLAUDE.md`; `docs/FEATURE-MAP.md`).

### What is live today

**Nothing.** `packages/catalog/capabilities.json` lists every capability, and none is connected:
each is `simulated`, `absent` or, for voice, `on-device`. No visit is booked, no payment taken, no
clinical decision issued, no device contacted and nobody can sign in (`deploy/RUNBOOK.md`, "What the
site does, and what it does not, on day one").

| Component | State | Evidence |
|---|---|---|
| Public page, app preview, status page | Deployed as static files; hold nothing | `deploy/README.md` |
| Web preview state | Memory only; no browser storage | `CLAUDE.md`; `scripts/check-boundaries.mjs` |
| Identity service (`apps/api`) | Built and tested; installed but switched off | `deploy/README.md`, "The identity service is not turned on" |
| Health Passport P0 (`apps/passport`) | Built and tested; development only, synthetic data only, loopback only, may not be deployed | `apps/passport/src/config.ts`; `packages/catalog/passport-gateway.json` |
| Engines runtime and contract mock | Loopback development services | `packages/engines/`, `packages/mock-api/` |
| Native apps | Preview apps with generated fixtures | `apps/ios/`, `apps/android/` |

### What this assessment covers

The processing MyThuso intends to perform once services are live, as designed in the contracts and
the code. It is assessed now, before any real processing, because the planning documents make a
signed DPIA a condition of the Passport going live (MyThuso Full Scope v1.0, Engine 7; ThusoIQ
Master v3.5, §27), and because `apps/passport` will not deploy without one.

| Field | Entry |
|---|---|
| Responsible party | |
| Information Officer | |
| Assessor(s) | |
| Version of this assessment | |
| Commit of the repository assessed | `3294e1a` |
| Review trigger (the ThusoIQ Master v3.5, §25, expects a DPIA per major change) | |

## 2. Data inventory

"Special?" means special personal information under POPIA section 26. Where that is a judgement,
it is marked **Question**.

| # | Category | What it holds | Special? | Where it would be held | Evidence |
|---|---|---|---|---|---|
| I-1 | **Identity** | Mobile number (the account key), name if given, sign-in codes and sessions stored as peppered hashes, a sealed authenticator secret, hashed recovery codes, a sign-in audit | No | `apps/api` SQLite database | `apps/api/src/personalData.ts`, `apps/api/src/identity.ts`, `apps/api/src/config.ts` |
| I-2 | **Workforce vetting evidence** | SANC, HPCSA and other registrations, identity documents, qualifications, indemnity schedules, references, police clearance certificates, reviewers' decisions, authority answers | **Question** (police clearance: criminal behaviour, section 26(b)) | `apps/api` (sealed through the protection module) | `packages/catalog/vetting.json`; `apps/api/src/vetting/` |
| I-3 | **Shift-start face match and door photo** | Designed events only; the face template and photo are never carried on the bus | **Question** (biometric information) | Not built | `packages/catalog/events.json` `trust.shift_start.matched@1`, `trust.door.verified@1` |
| I-4 | **Health Passport records (P0)** | FHIR-shaped Patient token, Observation, AllergyIntolerance, MedicationStatement, Consent, Provenance, AuditEvent; sealed categories under separate keys; entries a patient marks private | **Yes** (health) | `apps/passport` SQLite database, separate from identity | `packages/catalog/passport-gateway.json` `resources`, `sealed`; `apps/passport/src/store.ts` |
| I-5 | **Protected categories** | HIV, mental health, maternal health and other categories the record contract marks protected | **Yes** (health, and sex life where it applies) | Sealed in the Passport | `packages/catalog/records.json` `sensitivity`, `records` |
| I-6 | **Consent decisions** | One row per decision on a version of a purpose, with the fingerprint of the wording | No, but they reveal that a person uses a health service | `apps/api` `consent_decisions` | `apps/api/src/consent/`; `packages/catalog/consent.json` |
| I-7 | **Consent grants to the Passport** | Who may read which scope, for which purpose, until when; the ceiling per recipient role | Grants reveal care relationships | `apps/passport` `grants` | `packages/catalog/consent.json` `grants.maximumExpiryDays` and `grants.recipientRoles`; `apps/passport/src/gateway.ts` |
| I-8 | **Access logs** | Who opened whose record, when, under what basis, and the answer; never the content | Reveals care relationships | `apps/api` `record_access_log`; `apps/passport` `audit_events` | `apps/api/src/consent/`; `apps/passport/src/audit.ts` |
| I-9 | **Nurse location during a panic** | A position shown to the desk for the panic window only; gone when sharing stops; simulated today at a suburb centre | No, but it is location of a worker in danger | Not stored | `packages/catalog/field-safety.json` (`panic`, refusal `location-retained`, setting `panic-window`); `packages/catalog/geography.json` `privacy.rules` |
| I-10 | **Visit zone and patient address** | A booking event carries a zone and never a street address or coordinates; a map plots suburbs, never addresses | No, but address beside a service type reveals health information | Address in the booking, not on the bus | `packages/catalog/events.json` `booking.requested@2` `neverCarries`; `neverInEnvelope` (`address`); `packages/catalog/geography.json` rule `address-is-not-a-pin` |
| I-11 | **Nurse position before a visit** | Shown to the patient on the day of the visit only; no history drawn | No | Not built | `packages/catalog/geography.json` `privacy.rules` |
| I-12 | **Payments** | Payment state and amounts; card numbers refused wherever they appear; a cash code kept only as a salt and a digest | No | Engines runtime (development) | `packages/catalog/money.json` `cardFieldNames`; `packages/catalog/apis.json` `neverCrossesAnApi`; `packages/engines/src/money/domain/secrets.ts` |
| I-13 | **Payouts** | Nurses' bank details, once a payout provider exists | No | Not built | `packages/catalog/feeds.json` (the payouts feed) |
| I-14 | **GilbertOne conversations** | Speech recognised on the phone; no audio recorded or kept; the transcript lives for the conversation; no model improvement; events never carry audio or a transcript. **Corrected 24 September 2026:** from 21 to 24 September the service log also kept each message, redacted only for identifiers. Since 24 September it keeps the route and the length only. The earlier lines are an open retention decision (`docs/governance/ASSISTANT-ACTIVATION.md`) | **Yes, while it exists**, because a person may describe symptoms | The phone's memory during the conversation | `packages/catalog/assistant.json` `voice` (`recognition`, `audioStored`, `transcriptLifetime`, `modelImprovementOffered`) and `refusals` (`no-audio-kept`), `events[].neverCarries` |
| I-15 | **Handover from GilbertOne to a nurse** | A reference to a summary entry and an urgency code; never the transcript or symptoms | **Yes** (the summary entry) | Record | `packages/catalog/events.json` `conversation.handover@1` |
| I-16 | **Visit thread** | Words between patient and nurse, kept with the visit; photos switched off pending clinical review | **Yes**, likely | Not delivered anywhere | `packages/catalog/booking.json` `thread`, setting `visit-thread-photos` |
| I-17 | **Devices** | Readings from Apple Health, Health Connect or a Thuso Kit, none connected; offline capture ledger holding a device id, the device's claimed time and a digest, never a reading | **Yes** (readings) | Not connected; ledger in `apps/api` | `packages/catalog/passport.json` `devices`; `packages/catalog/capabilities.json` (`devices`); `apps/api/src/capture/`; `packages/catalog/consent.json` (`wearable-readings`) |
| I-18 | **Rewards** | Points for looking after oneself; may disclose that a follow-up was kept and its date; never the reason for a visit; a minor cannot earn | No, but close to the line | Not built | `packages/catalog/rewards.json` `_popiaNote`, `earnReasons`, `refusals` |
| I-19 | **Family members and guardians** | Caregiver and next-of-kin grants; guardian role requiring proven legal authority; a child's protected categories remain the child's; no guardian code exists | **Yes** where children's health information is involved | Designed only | `packages/catalog/vetting.json` (`guardian`); `packages/catalog/consent.json` `grants.recipientRoles`; `packages/catalog/records.json`; `docs/PRIVACY-AND-SECURITY.md` "Family care" |
| I-20 | **Employers and sponsors** | Pay for care and never see who used it or why | No (aggregate only) | Designed only | `packages/catalog/vetting.json` (`employer`, `sponsor`); `packages/catalog/programmes.json` |
| I-21 | **Concerns and escalations** | Codes, owners and deadlines; never the concern's detail on the bus | May reveal that a patient had a concern | Engines runtime | `packages/catalog/closed-loop.json`; `packages/catalog/events.json` (`loop.*`, `alert.*`) |
| I-22 | **Safeguarding reports** | A category code and the reporter's role; never the narrative on the bus | **Yes**, likely | Designed only | `packages/catalog/events.json` `safeguarding.reported@1` |
| I-23 | **Security incident register** | Counts of people reached; never names | No | `apps/api` `incidents` | `apps/api/src/incidents.ts` |
| I-24 | **Rate-limit measurement** | Five integers per window with nothing to join to anybody | No | `apps/api` `write_windows` | `docs/PRIVACY-AND-SECURITY.md` "What is rate-limited" |

## 3. Purposes and lawful basis

The consent contract names a basis for each consent purpose. This draft does not confirm any of
them. Section numbers are POPIA's.

| Purpose | Basis the contract names | Question for the Information Officer and counsel | Answer |
|---|---|---|---|
| Arranging and delivering care (`care-delivery`) | Consent, also resting on other bases | Is consent the right primary basis for care that is required, or is it the health-professional authorisation in section 32 with consent for specific parts? | |
| Processing notice (`processing-notice`) | Legal obligation | Does the notice meet section 18 as worded? | |
| Health tips and news (`product-updates`) | Direct marketing | Does the opt-in meet section 69? | |
| Readings from a watch or band (`wearable-readings`) | Consent | Is consent specific enough, given readings arrive continuously? | |
| De-identified service improvement (`service-improvement`) | Consent | Is the information de-identified within section 6, or still personal information? | |
| Identity and sign-in | Not in the consent contract | What is the basis — contract, legitimate interest, consent? | |
| Workforce vetting | Consent to be vetted (`packages/catalog/vetting.json`, gate `apply`) | Is consent right for an employment-like relationship, and does police clearance processing meet section 33? | |
| Nurse location during a panic | Not stated | Is it a legitimate interest or vital interest of the nurse, and is the window proportionate? | |
| Break-glass access to an emergency summary | Vital interest (`packages/catalog/consent.json` `lawfulBases`) | Are the scope and the review adequate? | |
| Payments | Not stated | Contract with the patient? | |
| Rewards | Not stated | Consent, and is any health inference avoided? | |
| Employer and sponsor programmes | Not stated | Does aggregate-only reporting avoid processing health information about staff? | |

Source for the first five rows: `packages/catalog/consent.json` `purposes[].lawfulBasis` and
`lawfulBases`, which say they are not advice.

## 4. Data flows between engines

The engines talk over an event bus whose contracts are frozen in `packages/catalog/events.json`
and the `events` arrays it lists in `sources`. **Nothing is a running bus**: no event is published,
delivered or stored (`packages/catalog/events.json` `_note`). The flows below are the design.

### What never travels on the bus at all

`packages/catalog/events.json` `neverInEnvelope` refuses, on every event: identity number, passport
number, name, phone, email, address, date of birth, medical aid number and a raw clinical value.
`packages/catalog/apis.json` `neverCrossesAnApi` holds every request and response to the same list
for identity numbers, transcripts, card and bank numbers and trust scores. A boundary check holds
both (`scripts/check-boundaries.mjs`).

### Where health information does not travel

| Flow | From → to | What the event refuses to carry | Evidence |
|---|---|---|---|
| A visit is asked for | Access → Care, Core | reason for visit, street address, coordinates | `events.json` `booking.requested@2` |
| A visit is completed | Care → Core, Record, Trust, Access | findings | `events.json` `appointment.completed@2` |
| A follow-up is needed | Care → Core, Record | clinical reason | `events.json` `appointment.follow_up_required@1` |
| A record entry is written | Record → Core, Clinical, Care | record category, content | `events.json` `passport.entry.written@1` |
| A consent grant is given or revoked | Record → Core, Access, Care, Medicines, Movement | scope, sealed categories | `events.json` `passport.consent.granted@3`, `passport.consent.revoked@3` |
| Break-glass | Record → Core, Trust, Access | justification text | `events.json` `passport.access.breakglass@1` |
| A doctor signs a review | Clinical → Care, Record, Core | assessment | `events.json` `review.signed@1` |
| A result is acknowledged | Clinical → Medicines, Record, Core | result values | `events.json` `result.acknowledged@1` |
| Triage completes | Clinical → Access, Care, Safety, Core | symptoms, diagnosis, reason codes | `events.json` `triage.completed@2` |
| A prescription is written | Medicines → Core | medication, dose | `events.json` `prescription.prescribed@1` |
| A reading deviates | Safety → Core, Care, Clinical | reading values, deviation detail | `events.json` `sentinel.rung_raised@1` |
| A nurse presses panic | Safety → Core, Care, Movement | live location | `events.json` `panic.raised@1` |
| A nurse is overdue | Safety → Core, Care | last known location | `events.json` `checkin.overdue@1` |
| GilbertOne hands over | Access → Care, Core | transcript, symptoms | `events.json` `conversation.handover@1` |
| GilbertOne escalates | Pulse → Safety, Care, Core | transcript, audio, emergency groups | `assistant.json` `pulse.escalation.started@2` |
| An order ships | Money → Core | delivery address | `events.json` `market.order.shipped@1` |
| The desk's field-safety queue | Safety desk screen | service, patient, address | `field-safety.json` `desk.neverCarries` |

### Where health information does travel

- **Into the Passport**, written as FHIR-shaped resources through the gateway, with Provenance
  sealed under the entry's key (`packages/catalog/passport-gateway.json` `resources`).
- **Out of the Passport**, only through the consent gateway to a holder of a valid grant for that
  scope and purpose, or through break-glass to the emergency summary only, and every access is
  written to the patient-visible audit (`apps/passport/src/gateway.ts`, `apps/passport/src/audit.ts`).
- **To a pharmacy**, the prescription and the allergies that bear on filling it
  (`packages/catalog/vetting.json`, the `pharmacy` role's grants).
- **To a laboratory**, the order and its own results (`packages/catalog/vetting.json`, `laboratory`).
- **On a nurse's or doctor's screen**, during the visit being attended, under the vetting gate
  (`packages/catalog/vetting.json`, `nurse` and `doctor` grants).

**A residual inference risk to rate (risk R-12):** several events carry a `serviceId` beside a zone,
a time or a clinician reference (for example `booking.requested@2`, `appointment.completed@2`).
A service such as family planning, beside a suburb and a time, can reveal health information to any
subscriber that logs it — the reason the field-safety desk refuses to show the service
(`packages/catalog/field-safety.json` `desk.neverCarries`).

## 5. Third parties and cross-border transfers

| Third party | Status | Section 72 question | Evidence |
|---|---|---|---|
| Hosting provider | Only the preview is hosted, on a shared VPS; no decision for real data | See `DATA-RESIDENCY-OPTIONS.md` | `deploy/README.md` |
| SMS provider | Not chosen; the identity service will not start in production without one | Many aggregators route outside South Africa; not determined | `apps/api/src/config.ts`; `packages/catalog/feeds.json` (first feed) |
| Payment provider | Simulated | Depends on where the provider settles; not determined | `packages/catalog/capabilities.json` (`payments`); `packages/catalog/feeds.json` |
| Payout provider | Not chosen | Holds bank details for the whole workforce; not determined | `packages/catalog/feeds.json` |
| Identity verification provider | Adapter built, never used; none contracted | Processing location is a contract term; not determined | `apps/api/src/vetting/identityProvider.ts`; `packages/catalog/feeds.json` |
| Credentialing authorities (SANC, HPCSA, SAPS and others) | All `not-integrated` | Twelve are South African statutory bodies | `docs/PRIVACY-AND-SECURITY.md` "Verified by a reviewer, confirmed by nobody" |
| Media stack for teleconsultation | Not chosen | Would carry the content of a consultation; not determined | `packages/catalog/feeds.json` |
| Clinical AI model | Not chosen for clinical use. **Corrected 24 September 2026:** a conversational model, Azure OpenAI, has answered the public through GilbertOne's second tier since 21 September 2026. It answers only messages the on-device matcher did not place, and triage stays gated shut | Messages are sent after `redactPHI`, which removes identifiers and nothing clinical; the Azure region and data-processing terms are not recorded | `docs/governance/ASSISTANT-ACTIVATION.md`; `apps/assistant-api`; `packages/catalog/feeds.json` |
| Speech provider | **Corrected 24 September 2026:** the phones recognise speech on the device. The web panel uses the browser's own recognition, which Chrome processes on Google's servers. A cloud voice, Azure Speech, is configured and, since 24 September, restricted to `southafricanorth` | Azure Speech in South Africa North; Chrome's server recognition is not determined | `apps/assistant-api/src/lib/speech.ts`; `apps/web/src/lib/voice.ts`; `docs/governance/ASSISTANT-ACTIVATION.md` |
| WhatsApp (visit reports to a family) | Not connected. The Money setting's proposed default sends nothing; its only other allowed value sends a message that a report is ready, and its guardrail refuses any report, photo or reading | A third party nobody has assessed, and even a "report ready" message tells somebody's contacts that a parent is being nursed; not determined | `packages/catalog/money.json` setting `visit-reports-whatsapp` |
| Map tiles (OpenFreeMap) | Off by default; when turned on, sees the map square, the internet address and the time | Where the tile server is hosted is not recorded | `packages/catalog/geography.json` `rendering.tiles` |
| Apple Health, Health Connect | Not connected; asked on the phone | Data stays on the phone until connected | `packages/catalog/passport.json` `devices` |
| Open-source modules and models | Nothing adopted | None | `packages/catalog/open-source.json` |
| Pharmacy, laboratory, interpreter, ambulance partners | None signed | Each partner's software location; not determined | `packages/catalog/feeds.json` |

**Questions:** for each supplier chosen, is it an operator under section 21, is there a transfer
under section 72, and does any transfer of special personal information or children's information
require prior authorisation under section 57(1)(d)? Answers: ______

## 6. Retention

| What | What the repository states | Status |
|---|---|---|
| Identity tables | Each has a retention basis and a disposal date derived from it, or none where no honest date exists | Periods marked "MyThuso's own setting" await the Information Officer (`apps/api/src/personalData.ts`) |
| Clinical records | The clinical bases are modelled and hold nothing: a record kept from its last entry, longer for a minor, longer again for mental and occupational health | Instruments to be confirmed by counsel (`apps/api/src/personalData.ts`; `docs/PRIVACY-AND-SECURITY.md` "Retention against erasure") |
| Record access log | Period stated as MyThuso's own setting; **nothing carries it out** | `packages/catalog/consent.json` `accessLog.retention`; `docs/PRIVACY-AND-SECURITY.md` |
| Proof of consent, proof a request was handled, vetting evidence, capture receipts | Periods stated as MyThuso's own setting | `apps/api/src/personalData.ts` |
| Backups | Archives are kept for a stated period, so an erased person remains in the oldest archive until it expires | `deploy/README.md` "The backups, and what they are not" |
| GilbertOne | No audio kept; transcript for the conversation only | `packages/catalog/assistant.json` `voice` |
| Nurse position during a panic | Gone when sharing stops | `packages/catalog/field-safety.json` refusal `location-retained` |
| Visit thread | Kept with the visit; open for a set time after it | `packages/catalog/booking.json` `thread`, setting `visit-thread-open-hours-after-visit` |
| Passport P0 | No retention or disposal is built | `apps/passport/src/store.ts` |
| Rewards, payments, payouts | Not stated | — |

**Undecided:** every period marked as MyThuso's own setting; the Passport's retention and disposal;
the payments and payouts periods; how disposal of the access log is told apart from tampering.

## 7. Data subject rights

| Right | What exists | Evidence | Gap |
|---|---|---|---|
| Access (section 23) | Scoped export of the person's own information; the patient reads their Passport audit; a person reads who opened their record | `POST /account/export` (`apps/api/src/subjectExport.ts`); `GET /audit/mine` (`apps/passport/src/server.ts`); `GET /consent/access-log`; `POST /export` at version two (`apps/passport/src/gateway.ts`, development only) | The Passport's export is not stepped up: it has no second factor of its own |
| Correction (section 24) | Its own route, separate from deletion, with stated refusals | `POST /account/correction` (`apps/api/src/subjectRequests.ts`) | Clinical correction does not exist |
| Deletion (section 24) | Erasure with a grace period and an answer naming what could not be erased | `apps/api/src/erasure.ts` | Backups keep the person until the archive expires; no per-person key to destroy (`docs/DATA-PROTECTION.md`) |
| Objection (section 11(3)) and withdrawal of consent | Withdrawal is one call with no reason asked, naming what is kept anyway | `POST /consent/withdraw`; `packages/catalog/consent.json` `retainedOnWithdrawal` | Objection to processing on a basis other than consent has no route |
| Direct marketing opt-out (section 69) | Optional purpose; can never open a record | `packages/catalog/consent.json` (`product-updates`); `apps/api/src/consent/contract.ts` | — |
| Children | A child's protected categories are the child's; a minor cannot earn rewards | `packages/catalog/records.json`; `packages/catalog/rewards.json` | Guardian authority cannot be proven; no guardian code exists (`docs/PRIVACY-AND-SECURITY.md` "Family care") |
| Family members | Grants to caregivers and next of kin are time-limited and revocable | `packages/catalog/consent.json` `grants` | A consent a guardian gives is refused until authority can be proven |
| Complaint to the Regulator | An erasure answer that is a partial refusal says so and points at the Information Regulator | `docs/PRIVACY-AND-SECURITY.md` "Retention against erasure" | — |

## 8. Security measures that are built

Built and tested in development. None is running with real information.

| Measure | Evidence |
|---|---|
| A consent gateway in front of every Passport read: no grant, an altered, revoked or expired grant, the wrong subject, purpose or scope each refused | `apps/passport/src/gateway.ts`; `packages/catalog/passport-gateway.json` `refusals` |
| Sealed categories under their own keys, never in the emergency summary; private entries opened by no grant | `packages/catalog/passport-gateway.json` `sealed`, `emergencySummary` |
| Hash-chained audit logs: the identity service's keyed chain, the access log sealed into it, and the Passport's patient-readable chain | `apps/api/src/protection/audit.ts`, `apps/api/src/protection/seal.ts`, `apps/passport/src/audit.ts` |
| Envelope encryption: per-record data keys in `apps/api`; per-subject and per-category keys wrapped under the master key in P0 | `apps/api/src/protection/crypto.ts`; `apps/passport/src/keys.ts` |
| Key separation between the Passport and the identity service, checked at start-up | `apps/passport/src/config.ts` |
| Development flags and loopback binding: the Passport refuses to start without `MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only`, in any production environment, or on a non-loopback Host; the mock refuses without `MYTHUSO_MOCK=synthetic-data-only` | `apps/passport/src/config.ts`; `packages/mock-api/` |
| Nothing under `deploy/` may name the Passport or the mock | `scripts/check-boundaries.mjs` |
| No clinical table may appear in the identity service | `scripts/clinical-tables.mjs`, `scripts/check-boundaries.mjs` |
| Identity-shaped values refused at any depth of a Passport resource | `packages/catalog/passport-gateway.json` `identityScreen` |
| Route contracts locked: callers, purposes, refusals and shapes frozen, with a changed route a new version | `packages/catalog/apis.lock`, `apis.callers.lock`, `apis.refusals.lock`, `apis.shapes.lock` |
| Event contracts frozen with `neverCarries` per event | `packages/catalog/events.json`, `events.lock` |
| The vetting gate: capability, standing, purpose, a patient's release of a protected category, and break-glass that overrides only the capability check | `apps/api/src/protection/gate.ts` |
| Second factor for sensitive roles; step-up before export | `apps/api/src/stepUp.ts`, `apps/api/src/twoFactor.ts` |
| Transport headers and time caps on the identity service | `apps/api/src/server.ts` |
| Production refusals: weak pepper, http origin, no SMS provider, no Information Officer, no protection keys | `apps/api/src/config.ts` |
| Every supplier feed refuses every payload until switched on | `apps/api/src/feeds/`; `packages/catalog/feeds.json` |
| No browser storage in the web preview; no WebViews in the native apps | `scripts/check-boundaries.mjs` |
| Backups refuse to run if a clinical table appears, and refuse to keep a snapshot containing its own keys | `deploy/README.md` |

## 9. Security measures not yet built

From `docs/PRIVACY-AND-SECURITY.md` ("Which of these controls actually exists" and "Health Passport
P0, and why it does not deploy") and `docs/DATA-PROTECTION.md` ("What is not built").

| Missing | Why it matters | Blocked on |
|---|---|---|
| This DPIA, signed | A condition of the Passport going live | The responsible party |
| A registered Information Officer | Accountability; a production refusal | `INFORMATION-OFFICER.md` |
| A data residency decision | Where information and backups may be | `DATA-RESIDENCY-OPTIONS.md` |
| HSM or KMS custody of keys; split-knowledge custody; per-patient key derivation; re-encryption after a compromise | Anyone with a key and the database reads everything | `KEY-CUSTODY-OPTIONS.md` |
| OIDC and mutual TLS in front of the Passport gateway | Nothing authenticates a requester beyond a signed grant | A contracted identity provider |
| Anchoring the audit chain head somewhere MyThuso does not control | An operator with the key can rewrite history undetected | An agreement with a second organisation |
| Clinician verification against issuing authorities | A credential reviewed by a person is not confirmed by the body that issued it | Agreements with the authorities |
| Guardian authority proven | An adult could assert authority over a child's record | Access to proof (Home Affairs, courts) |
| Recipient, scope and expiry per consent in the identity service; downstream propagation | Consent cannot follow information given onward | A clinical record and a recipient |
| Device binding | A device id on a request is a claim | A key per device |
| Breach detection, paging and notification delivery | A breach is noticed and reported late | A messaging provider and an operator organisation |
| Encrypted, off-site backups | A lost server loses everything; a stolen disk exposes identity data | Hosting decision |
| Logging of reads of key files | Nobody knows who read a key | Hosting decision |
| A patient-configurable emergency summary | Break-glass scope is fixed | Build |
| A penetration test | Unknown weaknesses | Before deployment |
| Access log retention carried out | The log is kept indefinitely in practice | A disposal the seal can be told about |
| Server-side enforcement of visit codes, assessment attribution, held laboratory results and doctor sign-off | Today enforced by the interface alone | Clinical records on a server |

## 10. Risk register

Likelihood and impact are for the assessor. The evidence column says why each risk is real.

| ID | Risk to data subjects | Evidence | Likelihood | Impact | Overall |
|---|---|---|---|---|---|
| R-1 | Health information placed on a host shared with other sites is read by somebody with root on that host | `deploy/README.md` (five co-tenant sites); `DATA-RESIDENCY-OPTIONS.md` | | | |
| R-2 | A master key held as an environment variable is copied with the database, exposing every record, and the Passport audit chain is rewritten to hide it | `apps/passport/src/keys.ts`, `apps/passport/src/audit.ts` | | | |
| R-3 | The audit chain is truncated or rewritten by an operator and nobody outside MyThuso can tell | `apps/passport/src/audit.ts`; `docs/PRIVACY-AND-SECURITY.md` "Publishing the chain head" | | | |
| R-4 | A person whose registration has lapsed or was never valid reaches a patient, because no authority confirms credentials | `docs/PRIVACY-AND-SECURITY.md` "Verified by a reviewer, confirmed by nobody" | | | |
| R-5 | An adult without legal authority reads a child's record | `docs/PRIVACY-AND-SECURITY.md` "Family care" | | | |
| R-6 | A supplier transfers special personal information outside South Africa without a basis | `packages/catalog/feeds.json` `operator.section72` | | | |
| R-7 | A breach is not detected, or the Regulator and the people affected are told late | `apps/api/src/incidents.ts` (detection, paging and delivery absent) | | | |
| R-8 | A nurse's position shown during a panic becomes a tracking record | `packages/catalog/field-safety.json` (`panic`, `location-retained`); `packages/catalog/geography.json` | | | |
| R-9 | A patient's address and the service booked together reveal an illness at a household | `packages/catalog/geography.json` rule `address-is-not-a-pin`; `packages/catalog/events.json` `neverInEnvelope` | | | |
| R-10 | Health information in visit thread messages, or photos if switched on, sits on a personal phone with no way to take it back | `packages/catalog/booking.json` `thread`, setting `visit-thread-photos` | | | |
| R-11 | Something a person says to GilbertOne about their health is kept or sent somewhere | `packages/catalog/assistant.json` `voice`, `events[].neverCarries` | | | |
| R-12 | An event carrying a service id beside a zone or a time lets a subscriber infer health information | `packages/catalog/events.json` (`booking.requested@2`, `appointment.completed@2`); `packages/catalog/field-safety.json` `desk.neverCarries` | | | |
| R-13 | Police clearance or face-match information is handled as ordinary personal information when it may be special | Section 2, rows I-2 and I-3 | | | |
| R-14 | Information is kept longer than needed: the access log is never disposed of; erased people stay in backups | `packages/catalog/consent.json` `accessLog.retention`; `deploy/README.md` | | | |
| R-15 | Backups are unencrypted and on the same disk as the database | `deploy/README.md` "The backups, and what they are not" | | | |
| R-16 | A consent recorded on somebody else's say-so (read aloud, on paper, by a guardian) is relied on | `docs/PRIVACY-AND-SECURITY.md` "Who wrote the consent down" | | | |
| R-17 | A rewards ledger or a sponsor's invoice discloses that somebody receives care | `packages/catalog/rewards.json`; `packages/catalog/programmes.json` | | | |
| R-18 | A requester to the Passport is impersonated, because nothing authenticates beyond a signed grant | `docs/PRIVACY-AND-SECURITY.md` "Health Passport P0" | | | |
| R-19 | "De-identified" information used for service improvement can be re-identified | `packages/catalog/consent.json` (`service-improvement`); `docs/PRIVACY-AND-SECURITY.md` "Research and marketing" | | | |
| R-20 | Turning map tiles on tells a third party which area of the city a user is looking at, and from which internet address | `packages/catalog/geography.json` `rendering.tiles` | | | |
| R-21 | A compromised key keeps opening old data, because rotation re-wraps and does not re-encrypt | `docs/DATA-PROTECTION.md` "What is not built" | | | |
| R-22 | Clinical defaults nobody has reviewed cause harm (a clinical safety risk rather than a privacy one, recorded so it is not lost) | `CLINICAL-REVIEW-PACK.md` | | | |
| R-23 | Switching WhatsApp visit notices on tells a family's contacts, and a third party, that somebody is being nursed | `packages/catalog/money.json` setting `visit-reports-whatsapp` (its proposal says a DPIA must come first) | | | |

## 11. Measures to reduce each risk

"Existing" is built in development. "Proposed" is for the responsible party to accept or reject.

| ID | Existing measures | Proposed further measures | Accepted? | Owner | Residual risk |
|---|---|---|---|---|---|
| R-1 | Nothing clinical is deployed; the Passport may not be named in `deploy/` | Hosting separated from co-tenants (`DATA-RESIDENCY-OPTIONS.md`, condition R1) | | | |
| R-2 | Envelope encryption; key separation checked at start-up | KMS or HSM custody; separate audit key (`KEY-CUSTODY-OPTIONS.md`, K1, K6) | | | |
| R-3 | Hash chains; a witness statement that can be checked later | Publish the chain head to a second organisation | | | |
| R-4 | Two-reviewer rule for high-risk checks; lapse arithmetic on every read; `not-integrated` recorded as an answer | Agreements with SANC, HPCSA and SAPS routes; contracted identity provider | | | |
| R-5 | No guardian code, so no route exists | Proof of authority before any guardian route is built | | | |
| R-6 | Every feed refuses every payload; section 72 recorded as undetermined | A section 72 assessment and operator agreement before any feed is switched on | | | |
| R-7 | A section 22 register that cannot close until both the Regulator and the people affected are recorded as told | Detection, paging, a written procedure and exercises (`INFORMATION-OFFICER.md`, D-4) | | | |
| R-8 | Fixed window; the desk cannot stretch it; positions are not kept | Confirm the window with the Clinical Governance Lead (`CLINICAL-REVIEW-PACK.md`) | | | |
| R-9 | Address never on the bus or a map; suburb only | Confirm the address release rule for the nurse going to the house | | | |
| R-10 | Words only; photos off until reviewed; the thread route refuses attachments | A proper store for any photo before the setting is switched on | | | |
| R-11 | On-device recognition; no audio; events never carry a transcript | A section 72 determination before any speech provider | | | |
| R-12 | Service withheld from the field-safety desk | Review whether `serviceId` needs to travel beside a zone or a time, or be replaced by a category code | | | |
| R-13 | Documents sealed; reads through the gate | Information Officer decides (`INFORMATION-OFFICER.md`, D-2, D-3) | | | |
| R-14 | Retention bases and a dry-run sweep for identity tables | A retention schedule; disposal for the access log; per-person keys | | | |
| R-15 | Readable only by root; backup refuses if a clinical table appears | Encrypted off-machine backups in-region (`DATA-RESIDENCY-OPTIONS.md`, R3) | | | |
| R-16 | Only `web-account` consents accepted; the other three routes refused | Build proper recording once the nurse's authority and guardianship can be proven | | | |
| R-17 | Rewards never carry a visit's reason; sponsors see invoices by service and date only | Information Officer to review the reward reasons that disclose a follow-up | | | |
| R-18 | Signed grant artefacts; development-only operator credentials | OIDC for clinicians and mutual TLS for the desk | | | |
| R-19 | Optional purpose; marketing consent cannot open a record | Legal view on de-identification before any use | | | |
| R-20 | Tiles off by default; the tile server is never told about a visit, patient or nurse | Record where the tile provider is hosted | | | |
| R-21 | Rotation that re-wraps | Re-encryption plan after a compromise (`KEY-CUSTODY-OPTIONS.md`, K9) | | | |
| R-22 | Unreviewed settings shown as not clinically reviewed | Clinical review (`CLINICAL-REVIEW-PACK.md`) | | | |
| R-23 | Off by default; guardrail refuses any report, photo or reading; no WhatsApp channel is connected | Keep off until this assessment, an operator agreement and a section 72 determination cover it | | | |

## 12. Sign-off

| Field | Entry |
|---|---|
| Residency decision this assessment relies on (date and signatory) | |
| Key custody decision this assessment relies on (date and signatory) | |
| **Prior authorisation (POPIA sections 57 and 58).** Does any processing assessed here require the Information Regulator's prior authorisation? (yes / no / not determined) | |
| If yes: which processing, and the date the Regulator was notified | |
| Residual risks accepted by the responsible party | |
| Processing may proceed? (yes / no / only with the conditions below) | |
| Conditions | |
| Next review date or trigger | |
| **Responsible party** — name, role and signature | |
| Date | |
| **Information Officer** — name, registration reference and signature | |
| Date | |
| Counsel consulted — name and firm | |
