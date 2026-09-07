# UI scope and feature roadmap

The proposal contains 21 platform modules across four phases. The design establishes navigation for all of them, interactive detail for the patient journey, and — as of this increment — end-to-end interaction design for the flows that carry the most clinical, privacy and operational risk. A feature being listed does not mean its full operational workflow is implemented.

## Delivered as interactive design

These flows exist on all three platforms, with the same steps, the same wording and the same refusals. They hold no real data and reach no service.

| Flow | What it demonstrates | Where |
|---|---|---|
| First run and sign-up | Language choice, mobile number validation, one-time code including the wrong-code state, South African ID entry with a real check-digit validation, recovery setup and separated required/optional consent | Web full-screen route, iOS sheet, Android route |
| Account recovery | Three routes back in — registered number, trusted contact, in person at a Thuso Corner — each with its own honest wait time, and none of which reveals records to the helper | All three |
| Guardian invitations | Scope, duration and verification as three separate decisions; guardianship for a minor treated differently from sharing; revocation with a note on what revocation cannot undo | All three |
| Nurse visit assessment | Visit-code identity check that blocks the visit on failure, spoken consent, seven observations with indicative-range flagging, symptoms, escalation choice and attributed sign-off | All three |
| Doctor clinical review | The nurse's submission with a trend chart, a required outcome and a required written rationale before any signature | All three |
| Prescription detail | Items with dose and repeats, pharmacist check, and a five-step chain of custody | All three |
| Laboratory order detail | Sample seal, courier handover, verification, results with reference ranges, and release as a deliberate clinical act | All three |
| Dispatch board | Abstract Johannesburg map, unassigned visits, nurses ranked by estimated arrival, and assignment — with the list, not the map, as the control | All three |
| Incident management | Severity triage, immediate-action choice, handover note and an append-only demo log | All three |
| Vetting, for all twelve vetted parties | Nurse, locum, doctor, pharmacy, laboratory, courier, Control Tower operator, admin staff, employer, sponsor, guardian and Thuso Corner site. Per-authority credential validation (SANC, HPCSA, SAPC, SANAS, SAPS, Home Affairs, CIPC, RTMC, SAHPRA), scope of practice, evidence, declarations and attestation | All three |
| Vetting lifecycle and refusals | Expiry resolved on every read, so a lapsed check suspends a party automatically; renewals due; a second reviewer required on every high-risk check, with one name refused both decisions; decline with a recorded reason and an appeal; and a matrix of exactly what each party is refused until its checks pass | Reviewer console web-only; applicant flow and status on all three |
| Vetting that gates real screens | Dispatch will not assign a nurse whose clearance lapsed, the clinical queue refuses a signature from a lapsed HPCSA registration, a laboratory without current ISO 15189 accreditation cannot release a result, and a pharmacy without a current responsible pharmacist is not routed a prescription — each with the refusal shown, not implied | All three |
| Patient file | A clinician-facing record: a permanent summary header, eight tabs over 42 record types, a visual overview and a filterable timeline. Every tab, action and field group asks `can()` first, and a refusal shows its written reason rather than an absence | All three |
| Protected categories | Sexual and reproductive health, mental health, HIV, substance use, termination of pregnancy and social support are classified in the contract. They never become a header chip, never appear in a summary or an export, and are released by the patient entry by entry — never by a scope. The notice that says so is constant, because a notice that appeared only where there was something to hide would be the disclosure it prevents | All three |
| Consultation record | One structure for every encounter, written in long form or in SOAP — the same fields either way, so there is no second copy to drift. A nurse's assessment and a doctor's diagnosis are different fields, not the same field with a warning | All three |
| Household record | Members, shared appointments, scheme dependants, immunisations and medicine collections due. Membership is not consent: another adult's record stays closed, a guardian's reach over a child of 12 or older is capped because that child may consent for themselves, and the roster itself discloses no more than the viewer may see | All three |
| Health summary | The nine-field summary, shareable bound to a purpose and a period rather than as a permanently valid document, with an unguessable token. The export is checked against its own bytes for protected content before it is produced | All three |
| Thuso Kit, capture and the offline queue | Pairing over a named transport, calibration and consumable expiry as separate gates, and four provenance marks — device, hand-entered, patient-reported and derived — carried from the instrument through the assessment into the consultation record and the patient file. A queue that holds readings on the phone, and the four disagreements a queue actually produces: a duplicate, a stale write, a clock skew and a capturer whose standing lapsed between capture and arrival. Three of the four are settled by a clinician; only the clock one is settled by the server | All three |
| Nurse earnings and payouts | A week's visits with what each one paid, four payout states including one the bank sent back, a reversal and a correction that each name the visit and the reason, the whole split of a visit — the nurse's share, the card fee and what MyThuso keeps — the tax-year total with a statement that nothing was withheld, and a payout-account change that re-verifies and then waits 48 hours. Not one visit amount is written down: a line names a service and the money is that service's nurse share in the catalogue the patient is quoted from | All three |
| Append-only vetting audit | Who decided, when, on what evidence and what changed. Prepend-only in the preview, and gone on reload | Web |
| Accessible clinical charts | Every chart carries a spoken summary and the same values as a real table | Passport, doctor review |
| System states | Loading, service error, offline, permission denied and empty, as shared components used by the real screens and collected in one gallery | All three |
| Localisation | English, isiZulu, Sesotho and Afrikaans across the shell, navigation, tab bar and primary actions | All three |
| Shared design language | One token set, one illustration source and one set of shared components, implemented natively three times | All three |
| Identity service | **Built**: one-time-code sign-in over a first-party HttpOnly cookie, peppered hashes, attempt burning, rate limits, no account enumeration, sliding and absolute session limits, append-only auth audit, production refusals. Holds identity only — no health information | Web; native keeps its first-run route |
| Admin console | Reporting against the funding plan, vetting pipeline gating dispatch, catalogue pricing with live platform margin, subscriptions and B2B, milestone-gated tranches, compliance checklist | Web only — a back office, not a phone surface |
| Session and sign-out | Sign out from the profile menu or More; the shell and the account are unreachable until sign-in | Web; native keeps its first-run route |
| Commercial model | The proposal's prices, nurse shares, subscriptions, B2B lines, screening packages, device costs, trajectory and seed round as checked data | Shared data; phase-one prices held in step with native |
| Hero banner | Three auto-rotating slides with animated background texture, a figure that breaks the banner's top edge, pause control and a photography drop-in point | All three |

## Feature coverage

| Area | Web preview | Native iOS / Android preview | Later functionality |
|---|---|---|---|
| Onboarding | Six-step sign-up, identity check-digit validation, recovery setup, consent separation | Native equivalents of every step | Home Affairs verification, SMS provider, rate limiting, device binding, audited consent records |
| Identity recovery | Three recovery routes with acknowledgement state | Native routes and acknowledgement | Verified trusted-contact flow, cooling-off period, physical-site process |
| Patient home | Dashboard, care illustration, service cards, upcoming visit, family, Passport | Native home, services, visit card, Passport and family routes | Real personalised care data |
| Thuso Nurse | Nine service catalogue, filters, search, 3-step booking | Searchable catalogue and native booking review | Matching, scheduling, secure messaging, live ETA, reschedule/cancel policies |
| Visits | Upcoming/past fixtures, new bookings, details, integration states | Upcoming fixtures, new bookings, details, integration states | Real visits, status events, receipts, cancellation |
| Thuso Pass | Accessible trend charts with data tables, timeline, documents, sample prescription and laboratory order, limited sharing/revoke, JSON export | Native charts with tables, records, sharing toggle, native system export | Verified clinical record, scoped grants, signed documents, emergency QR design |
| Thuso Family | Family cards, add-member preview, guardian invitations with scope/duration/verification and revocation | Native family list, add-member preview and invitation management | Real invitations, verified authority, guardianship proof, diaspora sponsorship |
| Thuso Routine | Five plan cards with indicative pricing | Five native plan cards | Billing, eligibility, schedules, care pathways |
| Thuso Wallet | Sample balance/activity and entry dialogs; the nurse side is the earnings and payout screen | Native balance/activity and entry screens | Payment provider, vouchers, immutable ledger, sponsorship |
| Privacy | Switches, sharing, guardian access, access-history sample, request acknowledgement | Native switches, invitations and rights entry screens | Identity verification, lawful-basis records, audited rights fulfilment |
| Nurse workspace | Schedule, availability toggle, full visit assessment with device capture, the offline queue, weekly earnings and payouts, onboarding and vetting | Native equivalents | A payment provider, a real ledger, bank verification, real dispatch integration |
| Doctor workspace | Review queue with trend chart, outcome and rationale sign-off | Native queue and review | Secure native consult, real prescriptions, referrals |
| Partner workspace | Prescription and laboratory order detail with chain of custody and release control | Native fulfilment queue and order detail | Partner APIs, real dispensing, courier integration, result delivery |
| Control Tower | Dispatch map and assignment gated on vetting, incident triage and log, the vetting queue for all twelve roles | Native dispatch board, incidents and vetting | Live positions, real assignment, paging, escalation, revenue |
| Localisation | Shell, navigation and primary actions in four languages | Same four languages natively | Clinical language review, remaining official languages, SASL guidance |
| Thuso Kit / AI | Pairing, calibration, capture with provenance, and the offline queue with its four conflicts | Native equivalents | Real Bluetooth transports, validated models, clinical governance |
| Thuso Screen | Feature entry | Native feature entry | Package eligibility, clinician-approved questionnaires, referrals |
| Thuso Wear | Apple Health / Health Connect entries with a permission-denied state | Platform-specific native entry and state | Granular permissions, compatible reading types, sync |
| Pharmacy / Labs | Order detail and partner workspace | Native order detail and workspace | Partner APIs, prescriptions and laboratory reports |
| SOS / Corner | Feature entries; Thuso Corner appears as a recovery route | Native entries | Verified emergency pathways and community schedules |
| Work / Locum / Academy / Money | Roadmap entries, relevant workspace tools | Native roadmap/tool entries | Employer programmes, shifts, learning and regulated finance partners |
| Cover / Devices | Roadmap entries | Native roadmap entries | Regulated insurer/device partnerships; Pod/Band/Home/Lab development |

## What the new flows deliberately refuse to do

- A failed visit code stops the visit. It does not warn and continue.
- Out-of-range readings are flagged for the nurse's attention and labelled as *not* a validated early-warning score. Nothing is triaged automatically.
- A nurse assessment is never presented as a diagnosis, and a doctor cannot sign a decision without recording why.
- Abnormal laboratory results are held until a clinician releases them with an explanation.
- Paying for someone's care grants no clinical access. Scope, duration and identity verification are separate, explicit choices.
- Sexual and reproductive health, mental health and HIV-related entries stay hidden under every guardian scope.
- The dispatch map is decorative. Every dispatch action is available from the list, with a keyboard, and the map carries only a spoken summary.
- A high-risk check verified by one reviewer is not verified. The console refuses to let the same name second its own decision.
- A lapsed credential is not a warning. Dispatch, clinical sign-off, dispensing and result release are withdrawn by arithmetic on the expiry date, without anyone having to notice.
- Paying for care is not a permission. A sponsor is verified for payment and told, in writing, that it grants no clinical access.
- An employer is verified to run a programme and never receives a named result, under any circumstance.
- A protected category is never a header chip, for anyone. The header says a category is withheld, in the same words on every record, so a clinician knows to ask rather than assuming there is nothing to know.
- Finance sees a service code and an amount, never a diagnosis in words — and a protected service's line is withheld entirely, because a code is not anonymous to anyone holding the code book.
- Sharing a household is not consent, and paying for a member's care is not a permission.
- A conflict in the capture queue is never merged and never discarded automatically. A later timestamp does not win a
  clinical disagreement, and a retake is not the better reading: last-write-wins over two blood pressures is a silent
  clinical decision taken by a comparison operator.
- A reading never loses where it came from. A device reading, a nurse's hand entry and something the patient said are
  three different things on the screen at every step, and they stay different in the record.
- An overdue calibration does not block a reading — it labels it, permanently. An expired consumable does block it,
  because a strip past its date is not a measurement at all.
- Nothing is deducted from a nurse's share. The card fee and the doctor's review come out of MyThuso's quarter, and
  the whole split is shown — including what MyThuso keeps — because a marketplace that hides its own cut is asking
  to be guessed at.
- A suspension is not a confiscation. A lapsed check stops new visits reaching a nurse; the money for work already
  done goes out on its normal day. Earnings are never withheld as a sanction, because a platform that can do that
  makes every complaint a question of whether the complainant can afford to raise it.
- No tax is withheld, and MyThuso does not advise on it. Both are said on the screen, in those words.
- A deduction always names the visit it came from and the reason. There is no line that says only ‘adjustment’.
- Changing a payout account re-verifies the nurse and then waits, and a payout already in flight goes to the account
  it was authorised against — because account takeover is how a stolen sign-in becomes a stolen payout.
- Nothing in any of these flows is transmitted, stored or acted upon.

## Cross-platform consistency

Clinical reference ranges, locale sets, the demo verification codes, the identity check-digit validation, what a nurse is paid — a visit's amount exists in one file and is derived everywhere else, including in the claim the public page makes about it — and the whole vetting table — twelve roles, seventy checks, every issuing authority's credential format, every scope of practice and every refusal sentence word for word — are duplicated in three codebases by design — each app is genuinely native. `scripts/check-boundaries.mjs` fails the build if any of them drift apart, because a reference range that differs between iOS and Android is a clinical-safety problem rather than a cosmetic one.

## Next UI increments

Remaining before a pilot-ready design: the vetting reviewer console on native, which is web-only today; teleconsultation call UI; prescription substitution and chronic authorisation; employer and sponsor programme administration; a real emergency pathway design; the remaining official languages and a clinical language review of translated copy; South African Sign Language guidance; large-text, screen-reader and low-end device testing on real hardware. None of these are claimed complete.
