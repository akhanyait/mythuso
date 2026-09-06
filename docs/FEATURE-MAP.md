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
| Nurse onboarding and vetting | SANC registration, scope of practice, and seven vetting checks that gate dispatch | All three |
| Accessible clinical charts | Every chart carries a spoken summary and the same values as a real table | Passport, doctor review |
| System states | Loading, service error, offline, permission denied and empty, as shared components used by the real screens and collected in one gallery | All three |
| Localisation | English, isiZulu, Sesotho and Afrikaans across the shell, navigation, tab bar and primary actions | All three |
| Shared design language | One token set, one illustration source and one set of shared components, implemented natively three times | All three |
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
| Thuso Wallet | Sample balance/activity and entry dialogs | Native balance/activity and entry screens | Payment provider, vouchers, immutable ledger, sponsorship |
| Privacy | Switches, sharing, guardian access, access-history sample, request acknowledgement | Native switches, invitations and rights entry screens | Identity verification, lawful-basis records, audited rights fulfilment |
| Nurse workspace | Schedule, availability toggle, full visit assessment, onboarding and vetting | Native equivalents | Kit capture, offline sync, earnings, real dispatch integration |
| Doctor workspace | Review queue with trend chart, outcome and rationale sign-off | Native queue and review | Secure native consult, real prescriptions, referrals |
| Partner workspace | Prescription and laboratory order detail with chain of custody and release control | Native fulfilment queue and order detail | Partner APIs, real dispensing, courier integration, result delivery |
| Control Tower | Dispatch map and assignment, incident triage and log, vetting queue | Native dispatch board, incidents and vetting | Live positions, real assignment, paging, escalation, revenue |
| Localisation | Shell, navigation and primary actions in four languages | Same four languages natively | Clinical language review, remaining official languages, SASL guidance |
| Thuso Kit / AI | Preview entries and clinical-review framing | Native entries | Bluetooth capture, validated models, clinical governance |
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
- Nothing in any of these flows is transmitted, stored or acted upon.

## Cross-platform consistency

Clinical reference ranges, locale sets, the demo verification codes and the identity check-digit validation are duplicated in three codebases by design — each app is genuinely native. `scripts/check-boundaries.mjs` fails the build if any of them drift apart, because a reference range that differs between iOS and Android is a clinical-safety problem rather than a cosmetic one.

## Next UI increments

Remaining before a pilot-ready design: nurse earnings and payout detail; kit pairing and observation capture from a device; teleconsultation call UI; prescription substitution and chronic authorisation; employer and sponsor programme administration; a real emergency pathway design; offline capture and conflict resolution for nurses; the remaining official languages and a clinical language review of translated copy; South African Sign Language guidance; large-text, screen-reader and low-end device testing on real hardware. None of these are claimed complete.
