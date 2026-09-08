# Proposal coverage

An audit of `Documentation/MyThuso_Funding_Proposal.docx` (September 2026, R9.7m seed request)
against this repository, commitment by commitment.

The founder's question was: *factor in all the requirements we have on this document, or confirm if
they are done.* This file is the answer. It was written by reading the proposal end to end and then
reading the code — `docs/FEATURE-MAP.md` was used to find things, never as evidence that they exist.

## The one thing to read first

**Nothing in this repository is a real service.** No visit is booked, no payment is taken, no
clinical decision is issued, no device is contacted, no credential is confirmed by the body that
issued it, and no message reaches anybody. What exists is a preview of three native applications, a
set of machine-checked contracts, and one small identity-and-vetting service that deliberately holds
no health information. That is a substantial amount of real engineering, and it is not a business.

Where the tables below say a refusal is enforced, that is a genuine claim: the refusal is in a
contract file, rendered on all three platforms, and `scripts/check-boundaries.mjs` fails the build if
it is removed. Where they say a workflow is designed, that is a screen, not a workflow.

## How to read the state column

| State | Means |
|---|---|
| **Built** | The commitment exists as a working software artefact in this repository, and is checked. This never means licensed, contracted, integrated, deployed or operating. |
| **Partly built** | The interaction, the wording and the refusals exist, usually on all three platforms and usually held in step by a boundary check. The service, integration, licence or data behind it does not. |
| **Not built** | Nothing in the repository does this. A card on a roadmap screen naming the module is noted but does not change the state. |
| **Not software** | Funding, hiring, premises, partnerships, procurement, regulator meetings. Code cannot satisfy it and pretending otherwise would be the dishonest kind of green tick. |

Paths are relative to the repository root.

---

## 1–3. Executive summary, the ask, and the solution

| Commitment (section) | State | Evidence / what is missing |
|---|---|---|
| "A SANC-registered nurse arrives at the patient's home in under an hour" (§1) | Not built | No dispatch, no nurse, no arrival. The dispatch board (`apps/web/src/features/Dispatch.tsx`) ranks fictional nurses by an estimated arrival computed in `packages/geo/eta.ts`, which returns `null` rather than a number when it has no basis. Honest, and connected to nothing. |
| "From R249" (§1) | Built (as a price) | `packages/catalog/services.json` line 2: `vitals`, `price: 249`. `scripts/check-boundaries.mjs:567–571` fails the build if the landing page advertises a nurse share the catalogue does not pay. |
| A dispatch marketplace — nearest suitable nurse, live ETA, fixed price, OTP-confirmed completion, cash or card (§3) | Partly built | Fixed price and the OTP-style visit code exist: `apps/web/src/features/Clinical.tsx` blocks the visit outright on a failed code. Nearest-nurse ranking and ETA are designed in `packages/geo/`. **Missing:** any live position, any assignment that reaches anybody, and any payment at all — cash or card. |
| A connected diagnostic kit whose readings push into the record (§3) | Partly built | `packages/catalog/capture.json`, `apps/web/src/features/Kit.tsx`, `apps/web/src/lib/capture.ts`, `apps/api/src/capture/`. Pairing, calibration, consumable expiry, four provenance marks and a four-conflict offline queue are modelled and enforced. **Missing:** any Bluetooth transport. `apps/web/src/lib/capture.ts:17` states there is no Web Bluetooth call anywhere in this codebase; that is correct. |
| AI screening with doctor sign-off — "the AI is the filter, the doctor is the decision" (§3) | Not built | There is no model and no inference anywhere in the repository. Out-of-range readings are flagged against indicative adult reference ranges and labelled as *not* a validated early-warning score. The doctor half is designed — `apps/web/src/features/Clinical.tsx` requires an outcome and a written rationale before any signature — but a filter that does not exist makes the whole commitment unbuilt. |
| A patient-owned Health Passport that grows with every visit (§3) | Partly built | `apps/web/src/features/Pages.tsx` (Passport), `apps/web/src/features/PatientFile.tsx`, `packages/catalog/records.json` (43 record types over 8 tabs, every access gated by `can()`). The export produces a fictional JSON file and says so. **Missing:** any real record, any signed document, and the emergency QR card. |
| Brand promise: "Verified nurse · Under an hour · Fixed price · Doctor-reviewed · Insured · Your record, your phone" (§3) | Partly built | Three of the six are designed — *fixed price*, *doctor-reviewed* and *your record*. *Verified* is a reviewer looking at a supplied document, because no issuing authority is integrated (see §14). *Under an hour* and *Insured* are not built at all. Presenting six promises as one line, when two of them are absent and a third is weaker than the word, is the kind of claim a regulator reads closely. |

---

## 4. Platform architecture — the 21 modules

All 21 appear as navigation entries in `apps/web/src/lib/catalog.ts:13`, with the proposal's own
phase against each. That is honest scaffolding, not delivery.

| Module (phase) | State | Evidence / what is missing |
|---|---|---|
| Thuso Nurse (1) | Partly built | Nine phase-one services in `packages/catalog/services.json`; catalogue, filters and a three-step booking in `apps/web/src/features/Booking.tsx` and `apps/web/src/features/Pages.tsx`. **Missing:** matching, scheduling against real availability, messaging, live ETA, cancellation policy, payment. |
| Thuso Doctor (1) | Partly built | Review queue and sign-off (`apps/web/src/features/Clinical.tsx`); teleconsultation with a participant roster, per-participant consent, a four-rung connection ladder and seven encounter outcomes (`apps/web/src/features/Teleconsult.tsx`, `packages/catalog/teleconsult.json`). **Missing:** any media transport. The boundary check refuses a screen that touches a camera or microphone. |
| Thuso Kit (1) | Partly built | As above. No transport. |
| Thuso Devices — Pod, Band, Home, Lab (3–4) | Not built | A roadmap card and four target costs in `packages/catalog/business-model.json:42–47`. No industrial design, no firmware, no partner. |
| Thuso AI (1–3) | Not built | No model, no inference, no vendor, no licence. |
| Thuso Pass (2) | Partly built | See §1–3 above. |
| Thuso Screen (2–3) | Not built | Six packages priced in `packages/catalog/business-model.json:31–38` and a roadmap card. No questionnaire, no eligibility, no referral pathway, no screening workflow. |
| Thuso Wear (2) | Not built | Three cards — Apple Health, Health Connect, Thuso Kit — with a permission-denied state (`apps/web/src/features/Pages.tsx:130`). No HealthKit or Health Connect code on either native app. |
| Thuso Pharmacy (2) | Partly built | Prescription detail with a five-step chain of custody (`apps/web/src/features/Orders.tsx`), and substitution and chronic repeats held to section 22F (`apps/web/src/features/Dispensing.tsx`, `packages/catalog/dispensing.json`). **Missing:** any pharmacy, any dispensing record, any stock system, any formulary, Schedule 5 and above, and any notification that reaches a prescriber. |
| Thuso Labs (2) | Partly built | Laboratory order detail: sample seal, courier handover, verification, reference ranges, and release as a deliberate clinical act (`apps/web/src/features/Orders.tsx`). **Missing:** any laboratory, any courier, any result. |
| Thuso Routine (2–3) | Not built | Five plan cards, none purchasable, each marked as a phase preview (`apps/web/src/features/Pages.tsx:158–164`). No billing, eligibility, schedule or care pathway. |
| Thuso Family (2) | Partly built | Family circle, household record and guardian invitations in which scope, duration and identity verification are three separate decisions (`apps/web/src/features/Household.tsx`, `apps/web/src/features/Guardian.tsx`). A guardian's reach over a child of 12 or older is capped. **Missing:** any invitation that reaches anybody, proof of guardianship, diaspora sponsorship. |
| Thuso Wallet (2) | Not built | A demo balance and two sample transactions (`apps/web/src/features/Pages.tsx:175–186`), with a note that no money is held, moved or owed. No provider, no ledger, no voucher, no stokvel or church wallet. |
| Thuso SOS (2–4) | Partly built | The most complete flow in the repository: `packages/catalog/sos.json`, `apps/web/src/features/Sos.tsx`, and native equivalents. Real South African emergency numbers first (10177, 112, 10111), eight named conditions that end the questions at an ambulance, nothing scored, the 45-minute figure shown as a target and never as an arrival estimate, the same vetting gate dispatch uses, and a screen for each of six failures. `scripts/check-boundaries.mjs:589–661` checks all of it, including that no screen has grown a way to place a call. **Missing:** an ambulance partner, an urgent rota, telephony, and clinical review of the routing questions. |
| Thuso Corner (2) | Not built | Appears as an account-recovery route (`apps/web/src/features/Onboarding.tsx:96`) and as a vetted site type in `packages/catalog/vetting.json:1227`. No sites, no schedule, no walk-up screening. |
| Thuso Work (3) | Partly built | Employer programme reporting with a suppression rule applied in each app from unsuppressed counts (`apps/web/src/features/Programmes.tsx`, `packages/catalog/programmes.json`). **Missing:** any programme, invoice, invitation, reporting pipeline, sick-note verification API, or vaccination drive. |
| Thuso Locum (2) | Not built | A locum is the second of thirteen vetted roles (`packages/catalog/vetting.json:359`) and a workspace tool entry. No shifts, no hospitals, no marketplace. |
| Thuso Academy (3) | Not built | A workspace tool entry only (`apps/web/src/features/Pages.tsx:242`). |
| Thuso Money (3) | Not built | Named once, in a refusal: `packages/catalog/earnings.json:46` says MyThuso does not advance money against work not done and that Thuso Money is a regulated partner product. That is the right sentence and it is the whole of the module. |
| Thuso Cover (4) | Not built | A price in `packages/catalog/business-model.json:15` and a roadmap card. |
| Control Tower (1) | Partly built | `apps/web/src/features/Admin.tsx` — eight tabs: overview against the funding plan, vetting, dispatch, clinical queue, catalogue with live platform margin, growth, finance with milestone tranches, compliance. Web only, which is right for a back office. **Missing:** every live figure. The console's own copy says approving a nurse approves nobody and releasing a tranche moves no money. |

---

## 5. Services and value-adds

### Layer 1 — visits (pay-as-you-go)

All sixteen priced rows but one exist as data in `packages/catalog/services.json`, with the proposal's
price, nurse share and phase. `scripts/check-boundaries.mjs:564` fails the build if a phase-one
service pays the nurse outside 74–76% of its price. **None of them can be booked, and no service is
performed**, so every row is `Partly built` at best: the price is real data and the service is not a
service. The table records the price fidelity, which is the part that can be checked.

| Service (proposal price / nurse share) | State | In the catalogue |
|---|---|---|
| Injection / vaccination R249 / R187 | Partly built | Yes, phase 1 |
| Family planning injection R249 / R187 | Partly built | Yes, phase 1 |
| Vitals + chronic check R249 / R187 | Partly built | Yes, phase 1 |
| Wound care R299 / R224 | Partly built | Yes, phase 1; also the worked unit-economics example |
| Blood draw R299 / R224 | Partly built | Yes, phase 1 |
| Mother and baby R349 / R262 | Partly built | Yes, phase 1 |
| Post-operative check R349 / R262 | Partly built | Yes, phase 1 |
| Elderly care R399 / R299 | Partly built | Yes, phase 1 |
| Sick-note visit R249 / R187 | Partly built | Yes, phase 1. See the note on medical certificates in "What no engineer can close" below. |
| AI screening bundle R449 / R300 | Not built | Priced, phase 2. Its content is the AI of §6, none of which exists. The proposal's own share here is 66.8%, not 75%. |
| Thuso SOS urgent visit "visit + R99, premium split 50/50" | Partly built | Priced, phase 2, **and the arithmetic does not reconcile.** `services.json` carries `price: 398, nurseShare: 249`. R299 + R99 = R398 is right; a 75% base share plus half the premium is about R274, not R249. The row is phase two and so is exempt from the 74–76% check. One of the two numbers is wrong and nothing in the build catches it. |
| Men's health check R299 / R224 | Not built | Priced, phase 2 |
| Mental-health check-in R349 / R262 | Not built | Priced, phase 3. Needs a tele-counsellor who does not exist. |
| Allied health R450–R800 at 75% | Not built | Priced, phase 3, collapsed to R600 / R450 — a range became a single figure |
| Home carer R120–R180/hr at 75% | Not built | Priced, phase 3, collapsed to R150 / R113 |
| Palliative care (package, partner split) | Not built | Not in the catalogue at all. The only Layer 1 row with no data behind it. |

### Layer 2 — subscriptions

Seven rows in `packages/catalog/business-model.json:8–16`. Five appear as plan cards
(`apps/web/src/features/Pages.tsx:163`); Alert and Cover appear only as data.

| Subscription | State | Note |
|---|---|---|
| Chronic Routine R199/month | Not built | Card only. No billing, no schedule, no adherence nudges, no medicine delivery. |
| Family Planning Plan R99/month | Not built | Card only. |
| Thuso Mom R249/month | Not built | Card only. |
| Thuso Senior (Gogo) R699/month | Not built | Card only. |
| Thuso Recover (per package) | Not built | Card only, priced `null`. |
| Thuso Alert R79/month — "panic button dispatching nearest nurse and ambulance partner" | Not built, and refused rather than sold | `packages/catalog/sos.json` carries an `alert` block whose job is to say what Alert is not. That is the correct handling of a panic button with no ambulance partner behind it. |
| Thuso Cover R99–R199/month | Not built | Collapsed to R149 in the catalogue. Insurance requires an insurer and an FSCA-regulated intermediary; neither exists. |

### Layer 3 — network and B2B

Twelve of the proposal's fourteen rows are in `packages/catalog/business-model.json:17–30` as revenue
lines. Two — event medics and school health screening — the catalogue keeps only partially.

| Line | State |
|---|---|
| Pharmacy fulfilment and adherence packs (8–15% of script value) | Not built |
| Laboratory tests (R50–R150 per test) | Not built |
| Devices sold or rented to homes | Not built |
| Nurse locum marketplace (15–20% of shift value) | Not built |
| Employer wellness and vaccination drives | Not built (the *reporting* is partly built — see Thuso Work) |
| Sick-note verification API | Not built |
| Hospital discharge programme | Not built |
| School health screening | Not built |
| Event medics | Not built, and not in the catalogue |
| Estate and retirement-village concierge nurse | Not built |
| Sponsored community screenings | Not built, and not in the catalogue as a line |
| Insurer services | Not built |
| Government and donor programmes | Not built |
| Stokvel, church and corporate wallets | Not built |
| Anonymised population-health insights (POPIA-first) | Not built. `docs/PRIVACY-AND-SECURITY.md` records the right warning against it: no assumption that pseudonymised health data is anonymous. |

---

## 6. Thuso AI — fifteen tests captured at home

**None of the fifteen is built.** There is no model, no inference, no licensed vendor and no device
in this repository. What exists is the frame the results would arrive in: a doctor review queue that
requires an outcome and a written rationale, provenance marks that distinguish a device reading from
a nurse's hand entry from something the patient said, and an offline queue that refuses to merge two
disagreeing blood pressures.

| Test (phase) | State | Nearest thing that exists |
|---|---|---|
| Vital-sign risk score (1) | Not built | Indicative adult reference ranges flag a reading and are labelled as *not* a validated early-warning score (`apps/web/src/features/Clinical.tsx`). This is the correct refusal and it is not a risk score. |
| Blood glucose and HbA1c (1) | Not built | Glucose appears as a device in `packages/catalog/capture.json` and as a chart in the Passport. |
| Single-lead ECG (2) | Not built | — |
| Wound imaging (2) | Not built | Wound care exists as a service; no imaging. |
| Skin lesion and rash triage (2) | Not built | — |
| Urine dipstick reading (2) | Not built | — |
| Rapid test reading — HIV, pregnancy, malaria, syphilis, COVID/flu (2) | Not built | — |
| Anaemia screening (2) | Not built | — |
| Cough and lung sound analysis (3) | Not built | — |
| Diabetic eye screening (3) | Not built | — |
| Foot ulcer risk (3) | Not built | — |
| Antenatal ultrasound with AI guidance (3) | Not built | — |
| Child growth and malnutrition (3) | Not built | Growth records are a record type in `packages/catalog/records.json`. |
| Medication adherence prediction (3) | Not built | — |
| Symptom triage assistant in app or WhatsApp (2) | Not built | No WhatsApp integration exists. Note that `packages/catalog/sos.json` deliberately refuses to triage in software; a symptom triage assistant is a different product and would need its own clinical governance. |

### Regulatory approach (§6)

| Commitment | State | Evidence / what is missing |
|---|---|---|
| "AI is decision support with a registered doctor accountable for every diagnosis, prescription and certificate" | Partly built | The principle is enforced in the interface: a nurse assessment is never presented as a diagnosis, and a doctor cannot sign without a recorded reason. There is no AI to govern and no registered doctor. |
| "Devices must be SAHPRA-registered or exempt; software with a diagnostic claim is treated as a medical device" | Not software | No submission, no regulatory consultant, no device. The repository's discipline of never making a diagnostic claim is what currently keeps this question shut. |
| "Telehealth follows HPCSA guidelines; nurses act within SANC scope" | Partly built | Scope of practice per role is data in `packages/catalog/vetting.json` and rendered on all three platforms. Nobody at HPCSA or SANC has read it. |
| "A Clinical Governance Lead and a Medical Director own protocols and regulator relationships" | Not software | Both posts are unfilled (§17 says "to be appointed at funding"). Every clinical judgement in this repository was made by an engineer. |

---

## 7. Devices — Thuso Kit

| Commitment | State | Evidence / what is missing |
|---|---|---|
| Standard nurse kit, ten line items, ≈R8,000 per nurse (§7) | Not built; costed | `packages/catalog/business-model.json:40` holds `nurseKit: 8000`. `packages/catalog/capture.json` names six device types with a transport and a calibration interval each. No device is procured or paired. |
| Shared area kit, eight line items, ≈R160,000 per zone (§7) | Not built; costed | `business-model.json:41`. |
| "Higher-cost devices held as area kits, booked through the nurse app" | Not built | There is no booking of area kits on any platform. |

---

## 8. Thuso Devices — own hardware

Everything in this section is `Not built`. The four devices exist as four rows of target costs in
`packages/catalog/business-model.json:42–47` and one roadmap card. No design partner has been
selected, no firmware exists, and no certification has been started.

| Commitment | State | Note |
|---|---|---|
| 5G / LTE-M eSIM in every device, offline store-and-forward | Not built | The store-and-forward *idea* is built, in software, as the capture queue (`apps/api/src/capture/`). |
| Edge AI processor, sub-second on-device screening | Not built | — |
| NFC tap-in and fingerprint login | Not built | — |
| Secure element, end-to-end encryption, OTA updates, remote wipe | Not built | Record-level encryption exists on the server (`apps/api/src/protection/crypto.ts`) and is a different thing. |
| Load-shedding-ready batteries and solar | Not built | — |
| Voice guidance in 11 official languages | Not built | Eleven written languages exist in the interface (see Localisation below); voice is not attempted. |
| Thuso Pod — twelve checks, target BOM R1,800 | Not built | Costed only |
| Thuso Band — wearable with SOS and fall detection, target BOM R550 | Not built | Costed only |
| Thuso Home — station with pill dispenser and video, target BOM R2,400 | Not built | Costed only |
| Thuso Lab — microfluidic analyser, eight results in twelve minutes, target BOM R9,000 | Not built | Costed only; explicitly outside this round |
| "Design partner selection month 10, SAHPRA submission month 15, pilot units month 18" | Not software | — |

---

## 9. Sample testing and wearables

| Commitment | State | Note |
|---|---|---|
| Urine — 10-parameter dipstick, hCG, microalbumin, drug screen; lab culture and ACR | Not built | — |
| Stool — FIT, H. pylori, rotavirus, calprotectin; lab parasites and microbiome | Not built | — |
| Mouth and saliva — oral HIV, COVID/flu, strep A, saliva drug test, AI oral-cancer photo | Not built | — |
| Blood (fingerprick) — eleven analytes | Not built | — |
| Blood (venous draw) to the laboratory | Partly built | A blood draw is a bookable phase-one service and the laboratory order screen models seal, custody and release. No sample and no laboratory. |
| Breath and lungs — spirometry, peak flow, breathalyser, cough recording | Not built | — |
| Consumable and analyser costs (eleven rows) | Not built | These figures are **not** in `packages/catalog/business-model.json` — the only equipment numbers carried are the two kit totals and the four own-device BOMs. If consumable economics matter to a funder, they live only in the proposal. |
| Apple Health and Google Health Connect sync | Not built | Three cards and a permission-denied state. Searched both native trees: no `HKHealthStore`, no `androidx.health`, no entitlement, no permission. The proposal budgets R150,000 once-off for this integration; none of it has been spent. |
| "Consumer wearables are not diagnostic devices, so Thuso AI treats them as trend data" | Not built, but the principle has a home | The provenance model in `packages/catalog/capture.json` already distinguishes a device reading from a derived value, which is where this rule would attach. |
| Subsidised R700 band for Chronic Routine and Senior subscribers | Not software |

---

## 10. Thuso Screen — pre-screening programmes

| Commitment | State | Note |
|---|---|---|
| Cancer screening: cervical (HPV self-sample), breast, colorectal (FIT), prostate (PSA), oral, skin, lung, HIV-linked — eight pathways with named follow-up | Not built | No questionnaire, no sampling workflow, no referral pathway on any platform. |
| Other pre-screening: cardiovascular, kidney, liver, TB/HIV, mental health (PHQ-9, GAD-7), cognitive, osteoporosis and falls, vision and hearing, child development, antenatal risk, occupational health — eleven areas | Not built | PHQ-9 and GAD-7 are licensed instruments used clinically; neither is implemented and neither has been licensed. |
| Six screening packages, R649–R999 and one sponsor-funded | Not built | Priced in `packages/catalog/business-model.json:31–38`, and nothing else. Worker Screen's R350–R550 range is collapsed to R450. Nothing sells them and no screen performs one. |
| Screening devices — HPV kit R280/test, breast scanner R65,000/zone, PSA, audiometry | Not built; not costed in the catalogue | As with §9, these figures exist only in the proposal. |
| "Every screen produces structured, anonymisable data on disease burden by area" | Not built | And see §5 Layer 3: the repository's own privacy documentation warns against treating pseudonymised health data as anonymous. |

---

## 11. Business model

| Commitment | State | Evidence |
|---|---|---|
| Unit economics: R299 → nurse R224 → payment R9 → MyThuso R66 | Built as checked data | `packages/catalog/business-model.json:4`. `scripts/check-boundaries.mjs:48` fails the build if the worked example does not add up, and `:46` fails if any service pays the nurse more than its price. |
| "25% of every visit" | Built as data, with a caveat | `platformShare: 0.25` is the gross share. The worked example retains R66 of R299, which is 22% after the payment cost. Both numbers are in the proposal; they describe different things and the proposal does not say so. |
| Eleven revenue streams | Not built | One (visit margin) is modelled; the rest are the Layer 2 and Layer 3 tables above. |
| Indicative trajectory, five checkpoints | Built as checked data, reported against fiction | `packages/catalog/business-model.json:50–56`, rendered in `apps/web/src/features/Admin.tsx:56–70` as a plan-versus-actual table. The "actual" column is a hard-coded fixture and the screen says so. |
| Doctor review paid per case R35–R60 | Built as data | `business-model.json:6`. `packages/catalog/earnings.json` enforces the related refusal: the doctor's review fee comes out of MyThuso's quarter and is never deducted from the nurse's share. |

---

## 12. Market

Nothing in the repository asserts or depends on any of these figures, which is the right outcome — a
market claim baked into a product is a market claim nobody re-checks. The one place §12 touches code
is the launch zones: SOS coverage areas are checked against zones dispatch can actually reach
(`scripts/check-boundaries.mjs:642`), so the app cannot promise urgent care somewhere it has no map.

| Commitment | State | Note |
|---|---|---|
| ~50 million South Africans without medical aid; ~9 million with | Not software | Not used anywhere in code |
| Hypertension, diabetes, HIV and TB affecting over 15 million people | Not software | Not used anywhere in code |
| A million births a year and a growing elderly population | Not software | Not used anywhere in code |
| Hundreds of thousands of registered nurses, a meaningful share available | Not software | Not used anywhere in code |
| Corporate wellness, insurers, hospitals and government as institutional buyers | Not software | See Layer 3 — none is contracted |
| Initial focus on Soweto, Roodepoort/Randburg, Tembisa/Kempton Park, then five more cities | Not software | The three Johannesburg zones do appear as dispatch zones and SOS coverage areas, checked against each other |

---

## 13. Go-to-market and take-off plan

| Commitment | State | Note |
|---|---|---|
| Days 1–30: company, Clinical Governance Lead, Medical Director, protocols, insurance, POPIA, pharmacy and lab partners, v1 build, 100 nurse applications | Not software (except "v1 build") | The v1 build is the thing this repository is furthest along on, and it is a preview rather than a v1. |
| Days 31–60: vet and train 50 RNs, issue kits, doctor panel of 5, 100-visit friends-and-family pilot | Partly built (vetting only) | The vetting register is real software — see §14. Everything else is people, kit and visits. |
| Days 61–90: public launch in three zones, first-visit offer, first Thuso Corner, referral rewards | Not built | No offer, no Corner, no referral mechanic. |
| Months 1–2: 50 RNs vetted, v1 live, 5 doctors | Not software |
| Months 3–5: nine core services live, 30 visits/day, 500 visits with zero unresolved incidents | Not built | Nine phase-one services exist as a catalogue. Incident triage and an append-only log exist as a preview (`apps/web/src/features/Dispatch.tsx`). |
| Months 6–9: Chronic Routine, pharmacy delivery, labs, ECG/wound/urine/rapid-test AI live, Health Passport, locum marketplace, five Corners, **Play Store app** | Not built | The Android application source exists (`apps/android/`, 24 Compose screens, no WebView — checked) and has never been published to any store. Neither has the iOS application. |
| Months 10–12: Mom and Senior, employer wellness, hospital discharge, school health, Academy, Enrolled Nurses and carers, Pretoria and Ekurhuleni | Not built |
| Months 13–18: retinopathy/lung-sound/ultrasound AI, insurer partner, Pod design, Cape Town, 500 RNs | Not built |
| Demand engine: trusted nodes, Corners, vouchers, diaspora sponsorship, community radio, WhatsApp, referral rewards | Not built | None of these appear anywhere in the code. Sponsorship exists as a *privacy* model (`packages/catalog/programmes.json`) — what a sponsor may and may not be told — not as a way to pay for anybody's care. |

---

## 14. Clinical governance and regulation

This is the section with the most real software behind it, and also the section where the gap between
software and compliance is widest.

| Commitment | State | Evidence / what is missing |
|---|---|---|
| "Nurses: SANC-registered with a current annual practising certificate, verified at onboarding and annually" | Partly built, and the verification is the missing half | `packages/catalog/vetting.json` holds 13 roles and 76 checks; `apps/api/src/vetting/` runs the register, the evidence vault and the lifecycle. Expiry is resolved on every read (`apps/api/src/vetting/expiry.ts`), so a lapsed certificate withdraws dispatch by arithmetic rather than by anybody noticing. **Missing:** any confirmation from SANC. `apps/api/src/vetting/authority.ts` returns `not-integrated` for **all thirteen** authorities. "Verified" here means a named reviewer looked at a document the applicant supplied. |
| "Registered Nurses only at launch; Enrolled Nurses and carers under RN supervision from Phase 3" | Built as data | Roles and scope are in the vetting contract; a home carer is a phase-three catalogue row described as RN-supervised. |
| "Scope: every service mapped to SANC scope of practice; injections only on valid prescription; diagnosis and prescribing by the doctor panel" | Partly built | Scope per role is contract data, rendered on all three platforms. The injection service description says "prescription-led". No prescription is checked because none exists. |
| "Doctors: HPCSA-registered, working under a Medical Director" | Partly built | A doctor with a lapsed HPCSA registration is refused a clinical signature and cannot open a teleconsultation — the refusal is the register's own sentence, rendered rather than implied. No doctor is registered because HPCSA is one of the thirteen authorities that answers `not-integrated`. |
| "Medicines: dispensing and delivery only through licensed pharmacies" | Partly built | A pharmacy without a current responsible pharmacist is not routed a prescription. `packages/catalog/dispensing.json` holds substitution to section 22F of the Medicines and Related Substances Act 101 of 1965 in three classes, and refuses to change molecule, strength or route. **No pharmacist has read a word of it.** |
| "Protocols at launch" — eleven named protocols | Not built | A "Protocols" entry exists in the doctor workspace and opens a preview dialogue. There are no protocols. |
| "Vetting: SANC, ID, police clearance, references, skills assessment, practical sign-off, four hours online and one day practical training" | Partly built | The document checks are modelled and enforced, including a second reviewer on every high-risk check with the same name refused both decisions. Training is not built. |
| "Insurance: professional indemnity per nurse, doctor indemnity, platform public liability, cyber cover" | Not software | Indemnity appears as an issuing authority in the vetting table and as a check. No cover is held. |
| "POPIA: explicit consent, SA hosting, encryption at rest and in transit, role-based access, audit logs, Information Officer, retention policy; patient owns and can export the Passport" | Partly built, and the strongest partly-built item here | **Built:** a versioned consent register where consent is to a *version* of a *purpose* and the SHA-256 of the exact wording is the proof (`apps/api/src/consent/`); a clinical access log distinct from the sign-in log, recording refused attempts, hash-chained and sealed into a keyed chain by a module that holds no key (`apps/api/src/consent/integrity.ts`, `apps/api/src/protection/seal.ts`); AES-256-GCM per-record encryption with rotation as an operation (`apps/api/src/protection/crypto.ts`, `apps/api/src/protection/rotation.ts`); a holdings register classifying every table erase/anonymise/retain with a plain-English ground (`apps/api/src/personalData.ts`); and a boundary check that fails the build if a clinical table appears in the service. **Missing:** an Information Officer, a data protection impact assessment, counsel's determination of the lawful basis for each purpose, SA hosting (there is no cloud deployment), and any clinical record for any of it to protect. |
| "Incident management: acknowledged within 5 minutes, Clinical Lead review within 24 hours" | Partly built | Severity triage, an immediate-action choice, a handover note and an append-only demo log. Critical severity states that the form never precedes calling emergency services. No paging, no detection, no owner. |
| "Regulator engagement: early meetings with SANC, HPCSA, SAHPRA, Gauteng DoH and DENOSA" | Not software | No evidence any meeting has happened. |

### Localisation and accessibility — commitments the proposal makes in passing

| Commitment | State | Evidence |
|---|---|---|
| Multilingual service (§16 "Inclusion"; §8 "voice guidance in 11 official languages") | Partly built, and honestly labelled | All eleven written official languages, 85 keys, generated into Swift and Kotlin from `packages/catalog/locales.json`. **Ten of the eleven are machine-drafted and have been read by nobody who speaks them** — every locale record carries `review.state: "machine-drafted"` with `by: null`, and the build fails if a language is presented as reviewed without naming a reader. Clinical wording is English in every locale until a clinician who reads the language signs it off, enforced structurally rather than promised. |
| South African Sign Language | Partly built | Deliberately not offered as an interface language, because a toggle that changes nothing is a claim of access rather than access. It is a communication requirement on the account, with an interpreter as a vetted party carrying six checks and one capability that opens no record (`packages/catalog/interpreting.json`). A visit needing an interpreter with none free is held rather than dispatched. **Nothing contacts an interpreter.** |
| Accessibility (implied by "highly legible on low-cost phones", §19) | Partly built | `tests/accessibility.spec.ts` measures 320 px, 200% zoom, target size and rendered text size on every build; 32 colour pairs are computed against WCAG 2.2 AA from `packages/design-tokens/tokens.json` and none fails. **Screen-reader testing is not done anywhere**, and neither is testing on real hardware (`docs/ACCESSIBILITY.md:131`). |

---

## 15. Use of funds, milestones and financial plan

All nine allocation categories and all five milestones are **not software commitments** — they are
what the money buys. They are carried as checked data in `packages/catalog/funding` (within
`business-model.json:57–78`) and rendered in the admin console's Finance tab.

| Category (amount) | State | Note |
|---|---|---|
| Clinical and medical leadership — R1,200,000 | Not software | Both posts unfilled |
| Doctor review panel — R650,000 | Not software | No doctor contracted |
| Technology and AI — R1,650,000 | Not software | The only line this repository is spending against. What has been produced is a three-platform preview, a contract layer, a boundary-check suite and a small identity/vetting/consent service. No AI model licence, no hosting, no wearable integration. |
| Devices and test consumables — R2,200,000 | Not software | Nothing procured |
| Thuso Devices to pilot — R1,850,000 | Not software | Nothing designed |
| Operations and support — R700,000 | Not software | No team |
| Marketing and community activation — R650,000 | Not software | Partly spent in kind: a public landing page exists (`apps/web/src/features/Landing.tsx`) and says in terms that it is a preview and not a live service. |
| Regulatory, legal, insurance — R420,000 | Not software | No cover, no counsel engaged |
| Contingency — R380,000 | Not software | The proposal calls this "about 5% of the round". It is 3.9%. |

The nine categories do sum to R9,700,000, and the three tranches (R3.0m + R3.9m + R2.8m) do too.

| Milestone | State | Where it stands |
|---|---|---|
| M1 — 50 vetted RNs online, v1 live, 5 doctors (releases R3.0m) | Not software | No RN is vetted by any authority; v1 is a preview; no doctor is contracted |
| M2 — 500 visits, zero unresolved incidents, 30 visits/day | Not software | Zero visits |
| M3 — 100 visits/day, 2,000 subscribers, AI bundle and Thuso Screen live (releases R3.9m) | Not software | Zero of each |
| M4 — 200 visits/day, 4,000 subscribers, first B2B contracts, Pretoria open | Not software | Zero of each |
| M5 — 300 visits/day, 6,000 subscribers, 500 RNs, Cape Town, Pod and Band pilots (releases R2.8m) | Not software | Zero of each |

---

## 16–20. Impact, team, risks, brand and next steps

| Commitment | State | Note |
|---|---|---|
| 500 nurse-entrepreneurs earning R4,000–R15,000/month within 18 months (§16) | Not software; and the top of the range does not follow from the plan | At the month-15 target of 300 visits/day shared across 500 nurses, that is roughly 18 visits per nurse per month — about R4,000 at a R224 share. R15,000 needs about 67 visits a month, which the stated volumes do not supply to 500 people. Both ends of the range should not be presented as achievable at the same headcount. |
| Earlier detection of eight named conditions (§16) | Not built | Nothing screens for anything. |
| Measurable decongestion of public clinics and a data layer for planning (§16) | Not built | |
| Founder and CEO (§17) | Not software | |
| Clinical Governance Lead, Medical Director — "to be appointed at funding" (§17) | Not software | This is the single most consequential unfilled post in the document, because every clinical judgement now in the codebase was made without one. |
| Nurse Community Manager, dispatch and support team, B2B sales lead (§17) | Not software | |
| Advisers: healthcare attorney, SAHPRA consultant, electronics partner, bookkeeper (§17) | Not software | No evidence any is engaged. |
| Risk mitigations: protocols, indemnity, escalation SLA (§18) | Not built | The SLA is a number in the admin console. |
| Risk mitigation: "AI is decision support only; doctor sign-off on every result; continuous audit of AI-versus-doctor outcomes" (§18) | Partly built | The audit *screen* exists (`apps/web/src/features/Admin.tsx`, Clinical tab: "AI agreed with the doctor 91%") with fictional figures, and the screen's own copy says the figures are the reason it exists. There is no AI to audit. |
| Risk mitigation: "OTP completion, reconciliation against payouts, cashless incentives" (§18) | Partly built | The visit code that blocks a visit on failure is real design. Reconciliation is not built; no money moves. |
| Risk mitigation: "SA hosting, encryption, access controls, cyber cover, Information Officer" (§18) | Partly built | Encryption and access controls are built in `apps/api/src/protection/`. Hosting, cover and the Information Officer are not. |
| Risk mitigation: milestone-gated tranches (§18) | Not software | A term of a funding agreement that does not exist. The admin console's Finance tab reads the three tranches from `business-model.json` and displays them; releasing one there moves no money. |
| Brand: logo, colour palette, Poppins, tagline, name extensions (§19) | Built | `packages/design-tokens/tokens.json` is the single source; `scripts/emit-tokens.mjs` generates it into CSS, Swift and Kotlin, and the build fails if they drift. Vital Teal, Deep Indigo, Mango and the two greys are all present, and 32 contrast pairs derived from them are computed on every build. |
| Register MyThuso (Pty) Ltd; secure mythuso.co.za, mythuso.africa, trademarks (§20) | Not software | A DNS zone file for `mythuso.co.za` exists at `deploy/dns/mythuso.co.za.zone`, which suggests the domain is at least intended. No trademark evidence. |
| Appoint the Clinical Governance Lead and Medical Director (§20) | Not software | |
| Open nurse recruitment; onboard first 50 RNs (§20) | Not software | |
| Sign one pharmacy, one laboratory and five doctors (§20) | Not software | |
| Procure 50 kits and one area kit; select AI vendors; start Health Connect and Apple Health integration (§20) | Not built | None of the three has started. |
| Build and pilot v1; launch in three Johannesburg zones (§20) | Partly built | The build exists. The pilot and the launch do not. |

---

## Where `docs/FEATURE-MAP.md` was checked against the code

The feature map is unusually honest for a document of its kind, and on the substantive claims it is
accurate. Every "Built" it asserts was checked against a file, and each one held: the identity
service, the consent register and access log, the vetting register and its expiry arithmetic, the
encryption and rotation modules, the locale generation, the suppression floor, the substitution
classes and the emergency pathway all exist as described. Three points of friction, none of them a
misstatement:

1. It describes flows as "delivered as interactive design", which is right, but a reader skimming the
   table headings could take the volume of detail for delivery. This document is the counterweight.
2. Its "Next UI increments" section lists only the native vetting console as remaining before a
   pilot-ready *design*. That is true of the design. It is a long way from a pilot-ready *service*,
   and the feature map does not have a column for that distinction.
3. The site is deployed and unreachable, which is a distinction worth stating plainly because
   "deployed" is the word people hear as "live". `/var/www/mythuso` holds the built landing page,
   `mythuso.conf` is enabled, and nginx serves it correctly when asked for it by name at the
   server's address. No hostname resolves to it. `mythuso.liqzar.co.za`, which the config claims,
   has no DNS record and never had one; `mythuso.co.za` still points at the registrar's parking
   page. Nobody outside this machine has ever been able to load it. Two A records close the gap and
   they have not been created.

---

## The gaps that matter most

**Not one credential has been confirmed by the body that issued it.** This is the gap a funder and a
regulator will both reach for first, and it is the one the codebase is most honest about.
`apps/api/src/vetting/authority.ts` has an adapter per issuing authority and a closed set of
outcomes in which `not-integrated` is a first-class answer rather than an error — and all thirteen
authorities return it today. The one adapter written as far as it can be written is Home Affairs
(`apps/api/src/vetting/identityProvider.ts`), and it has never spoken to a provider because none has
been contracted and no key exists. Until that changes, "verified nurse" — the first of the six
promises in the brand line — means a named reviewer looked at a PDF the applicant supplied. Twelve of
the thirteen need an agreement, an accreditation or a customer account that does not exist; the
thirteenth needs a contract with an accredited identity provider. This is a commercial and legal task
with a small amount of code at the end of it, not the other way round.

**There is no AI.** Section 6 is the longest technical section of the proposal, it is the pitch's
differentiator, it names fifteen tests across three phases, and none of it exists — no model, no
inference, no vendor, no licence, no device to read. The proposal's own phase-one answer is the right
one: buy certified devices and license proven models. Nothing has been bought or licensed. Meanwhile
the codebase has done the harder and less visible half of that work — provenance, offline conflict
resolution, a review queue that will not accept a signature without a reason, and a flag that
explicitly refuses to call itself an early-warning score — so the frame is ready for a model that
does not exist. A funder reading "AI-assisted" on the cover should be told plainly that the assist is
not built.

**No money moves, in either direction.** There is no payment provider, no card acceptance, no cash
reconciliation, no wallet, no voucher, no subscription billing and no payout run. The nurse earnings
screen is the best-argued screen in the repository — nothing deducted from the nurse's share, a
suspension that never touches money already earned, every deduction naming its visit, no tax
withheld and said so — and every amount on it is arithmetic on a demo catalogue. Since the entire
revenue model is "25% of every visit", and since M2 gates a R3.9m tranche on 500 completed visits,
payments are on the critical path to the first milestone that releases money.

Behind those three: **there is no clinical record.** Every privacy control built so far — the consent
versions, the access log, the encryption, the retention register — protects an identity service that
deliberately holds no health information. The controls are real and they are ahead of the data, which
is the right order. But the moment a single blood pressure reading is stored on a server, the whole
of `docs/PRIVACY-AND-SECURITY.md` applies at once: SA hosting, a DPIA, an Information Officer, and a
lawful basis determined by counsel rather than named by a JSON file.

---

## What no engineer can close

Each of these needs a person with an authority no amount of code confers. The four already known are
confirmed as still standing; the rest were found in this audit.

**Confirmed as still open:**

1. **The SATI accreditation route for SASL interpreters is drafted and unconfirmed.**
   `packages/catalog/interpreting.json` records `confirmedBy: null`, `confirmedOrganisation: null`,
   `confirmedOn: null`, and states in terms that nobody at SATI, DeafSA or PanSALB has read the row
   or the six checks hanging off it. If accreditation runs through another body, the authority row is
   wrong and the check is the wrong check. **Needs:** a named person at the accrediting body.

2. **Ten of the eleven languages have been read by nobody who speaks them.** Every non-English locale
   in `packages/catalog/locales.json` carries `review.state: "machine-drafted"` and `by: null`. The
   build refuses to let anybody claim otherwise. **Needs:** a speaker of each language reading every
   string in the screen it appears in, and a name, organisation and date recorded. Separately and
   more seriously, **no clinical language review has started**: clinical wording is English in all
   eleven locales, enforced structurally, until a clinician who reads the language signs it off.

3. **Medicine substitution classes need a pharmacist's sign-off.** `packages/catalog/dispensing.json`
   builds the whole screen on a reading of section 22F of the Medicines and Related Substances Act
   101 of 1965 — that telling the patient is a duty on every substitution, so the lowest class is
   *may be substituted, and the patient is told* rather than a silent swap. If that reading is wrong,
   the shape of the screen is wrong. The medicines placed in each class (levothyroxine, an insulin
   analogue as a biological, a hydrochlorothiazide supply failure) are the same kind of judgement.
   **Needs:** a registered pharmacist.

4. **The twelve-person suppression floor needs an Information Officer's ruling.**
   `packages/catalog/programmes.json` states it plainly: nothing in POPIA names a number; twelve
   people, a four-fifths dominance ceiling, rounding to five and never leaving exactly one group
   hidden are a design written down so it can be argued with, and no Information Officer has agreed
   to it. **Needs:** an Information Officer, and — for the differencing problem across a series of
   reports over time, which rounding narrows and does not close — somebody who does statistical
   disclosure control professionally.

**Found in this audit, and added to that list:**

5. **A Deaf South African and a qualified interpreter have read none of the SASL work.** Not the
   refusals, not the roster, not the sentence shown when the app cannot say when somebody will be
   free. The three interpreting modes and their relative scarcity are an engineer's guess at how SASL
   interpreting is actually arranged in South Africa.

6. **The medical certificate service is a clinical-governance question, not a build question.** A
   R249 "sick-note visit" in which a nurse attends and a remote doctor issues the certificate is a
   live HPCSA question about what a doctor may certify without personally examining the patient.
   **Needs:** the Medical Director and, realistically, an HPCSA view.

7. **Thuso Alert is a panic button that promises an ambulance.** The codebase currently refuses to
   sell it, which is correct. Whether it can ever be offered is a contracting decision with an
   emergency medical services provider, and a clinical one about what a panic button may claim.
   **Needs:** the founder's decision and a contracted partner, before the subscription is priced
   anywhere a patient can see.

8. **"Anonymised population-health insights" as a phase-four revenue line.** The repository's own
   privacy documentation warns that pseudonymised health data must not be assumed anonymous. Selling
   it is a lawful-basis question about special personal information under POPIA. **Needs:** the
   Information Officer and counsel, before it appears in a data-room revenue model.

9. **The eleven clinical protocols named in §14 do not exist and cannot be written by an engineer.**
   Injection administration, wound care, phlebotomy, medical certificate criteria, emergency
   escalation and the rest are the Clinical Governance Lead's first deliverable.

10. **Whether the SOS nurse share is R249 or R274 is a founder's decision.** The catalogue and the
    proposal disagree (see §5 above) and no check catches it, because the row is phase two. Somebody
    has to say which number is the promise.

11. **Screening instruments carry licences.** PHQ-9, GAD-7 and the cognitive screens named in §10 are
    not free-to-implement in every context, and a screening pathway without a referral partner at the
    end of it is a finding with nowhere to go. **Needs:** the Clinical Governance Lead and a
    licensing check before any of §10 is built.

---

## Counts

Counted from the state column of every table above.

| State | Commitments |
|---|---|
| Built | 7 |
| Partly built | 42 |
| Not built | 94 |
| Not a software commitment | 38 |
| **Total assessed** | **181** |

Seven `Built` out of 181 reads harshly, and it is the honest number, because **`Built` was reserved
for a commitment the proposal makes that a piece of software can satisfy on its own** — a price, an
arithmetic identity, a colour palette, a scope table. Almost everything else in a home-healthcare
proposal needs a person, a licence, a partner or a patient at the other end, so the most a repository
can reach is `Partly built`. The forty-two of those are where the engineering actually is.

The seven are: the "from R249" price claim, held to the catalogue by a boundary check; the worked
unit economics, which the build refuses to let stop adding up; the "25% of every visit" share; the
indicative trajectory; the doctor review fee; RN-only-at-launch with scope per role as contract data;
and the brand identity generated from one token file into CSS, Swift and Kotlin.

What that count does **not** capture, and what a reader should not miss, is the work that is not a
proposal commitment at all — it was built because building the commitments honestly required it. The
versioned consent register, the hash-chained clinical access log and its seal, record-level
encryption with key rotation, the personal-data holdings and retention register, the vetting register
with expiry resolved on every read, the thirteen-authority verification layer that answers
"not integrated" rather than guessing, the eleven-language locale table with its review states
enforced, and the 1,300-line boundary-check suite that holds three codebases in step. None of those
is a row in the proposal. Several of them are the reason the rows that exist can be trusted.
