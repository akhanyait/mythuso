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
| Thuso SOS, the emergency pathway | Real South African emergency numbers first and most prominently — 10177 for an ambulance, 112 from a mobile, 10111 for the police — above anything MyThuso sells; three questions that route rather than triage, any one of eight named conditions ending them at an ambulance; under 45 minutes shown as a target with what happens when it cannot be met; an arrival estimate that says it does not know; the same `can(subject, 'take-visit')` gate dispatch uses; standing down, and an unanswered callback that is not a cancellation; and a screen for each of the six ways it fails | All three |
| Cancelling and moving a visit | Three states worked out from the visit's own start and the window declared in `packages/catalog/cancellation.json` — nothing types "2 hours" any more. The move is offered before the reasons, and again to whoever says the day is the problem; none of the four reasons asks a person to justify themselves and choosing none of them still cancels, recorded as "I would rather not say". Cancelling inside the window is never refused — it is recorded as late and costs nothing — and the one cancellation refused is one for a visit that has already begun, which belongs to the clinical record rather than a booking screen. A cancelled visit is kept under Cancelled with its reason; a moved one keeps its reference, person, address and service. No screen states a charge: what a late cancellation costs is recorded in the contract as an open legal and commercial decision. The window is refused as a literal in hand-written native source by `check-boundaries.mjs`, which is the check the contract was written for — the two hours had lived as a string in one Swift file and one Kotlin file with nothing to compare them against | iOS and Android; the web has a cancel flow and still needs the window |
| Vetting, for all thirteen vetted parties | Nurse, locum, doctor, pharmacy, laboratory, courier, SASL interpreter, Control Tower operator, admin staff, employer, sponsor, guardian and Thuso Corner site. Per-authority credential validation (SANC, HPCSA, SAPC, SANAS, SAPS, Home Affairs, CIPC, RTMC, SAHPRA, SATI), scope of practice, evidence, declarations and attestation | All three |
| Vetting lifecycle and refusals | Expiry resolved on every read, so a lapsed check suspends a party automatically; renewals due; a second reviewer required on every high-risk check, with one name refused both decisions; decline with a recorded reason and an appeal; and a matrix of exactly what each party is refused until its checks pass | Reviewer console web-only; applicant flow and status on all three |
| Vetting that gates real screens | Dispatch will not assign a nurse whose clearance lapsed, the clinical queue refuses a signature from a lapsed HPCSA registration, a laboratory without current ISO 15189 accreditation cannot release a result, and a pharmacy without a current responsible pharmacist is not routed a prescription — each with the refusal shown, not implied | All three |
| Patient file | A clinician-facing record: a permanent summary header, eight tabs over 42 record types, a visual overview and a filterable timeline. Every tab, action and field group asks `can()` first, and a refusal shows its written reason rather than an absence | All three |
| Protected categories | Sexual and reproductive health, mental health, HIV, substance use, termination of pregnancy and social support are classified in the contract. They never become a header chip, never appear in a summary or an export, and are released by the patient entry by entry — never by a scope. The notice that says so is constant, because a notice that appeared only where there was something to hide would be the disclosure it prevents | All three |
| Consultation record | One structure for every encounter, written in long form or in SOAP — the same fields either way, so there is no second copy to drift. A nurse's assessment and a doctor's diagnosis are different fields, not the same field with a warning | All three |
| Teleconsultation call | The encounter between the review queue and the record. A roster naming everyone who can see and hear the patient — doctor on video, nurse in the room, guardian, interpreter — each consented to separately and each removable mid-call at a cost stated before the question. Recording asked as a second question and refused outright in the preview, with what it would keep, for how long and who could open it written down. A four-rung connection ladder where sound only is a designed path and what the doctor may conclude shrinks with the line. A dropped call held open for ninety seconds on both screens, with the doctor calling back. And seven encounter outcomes, worked out rather than chosen, of which five are not consultations and cannot write an assessment, a plan or a charge | All three |
| Household record | Members, shared appointments, scheme dependants, immunisations and medicine collections due. Membership is not consent: another adult's record stays closed, a guardian's reach over a child of 12 or older is capped because that child may consent for themselves, and the roster itself discloses no more than the viewer may see | All three |
| Health summary | The nine-field summary, shareable bound to a purpose and a period rather than as a permanently valid document, with an unguessable token. The export is checked against its own bytes for protected content before it is produced | All three |
| Thuso Kit, capture and the offline queue | Pairing over a named transport, calibration and consumable expiry as separate gates, and four provenance marks — device, hand-entered, patient-reported and derived — carried from the instrument through the assessment into the consultation record and the patient file. A queue that holds readings on the phone, and the four disagreements a queue actually produces: a duplicate, a stale write, a clock skew and a capturer whose standing lapsed between capture and arrival. Three of the four are settled by a clinician; only the clock one is settled by the server | All three |
| Nurse earnings and payouts | A week's visits with what each one paid, four payout states including one the bank sent back, a reversal and a correction that each name the visit and the reason, the whole split of a visit — the nurse's share, the card fee and what MyThuso keeps — the tax-year total with a statement that nothing was withheld, and a payout-account change that re-verifies and then waits 48 hours. Not one visit amount is written down: a line names a service and the money is that service's nurse share in the catalogue the patient is quoted from | All three |
| Prescription substitution and chronic authorisation | Three substitution classes rather than two, because section 22F of the Medicines and Related Substances Act 101 of 1965 does not permit generic substitution — it requires the pharmacist to tell the patient and dispense, with four exceptions. So the lowest class is *may be substituted, and the patient is told*; the middle one is the pharmacist's own judgement, carrying their name, SAPC registration and a written reason, with the prescriber informed; the third is *must not*, and an item in it carries no control at all rather than a disabled one. Five fictional items covering all four statutory exceptions and two clinical grounds — narrow therapeutic index, a patient stabilised on a product, a prescriber's own-hand *no substitution*, a biological, a supply failure and a patient who simply said no. Nothing can be marked handed over until the words said to the patient have actually been shown. A chronic authorisation boxed twice, by a date and by a number of repeats, ending on whichever comes first and then in a review; an early collection refused with a date and a question about the last month; and the expiry written down nowhere, worked out on all three platforms from the same 30.44-day month the vetting module renews credentials on | All three |
| Employer and sponsor programme administration | An employer's report is built by asking which counts may be published at all: a floor of twelve people, a dominance rule for the group where thirteen of fourteen answered the same way, secondary suppression so that nothing hidden can be had by subtracting the published groups from the total, and rounding to the nearest five so two reports laid side by side do not name whoever changed their mind. The published groups deliberately do not sum to the total and the screen says why. A suppressed group keeps its name and says why it is suppressed, because a blank reads as an error somebody goes and asks about. Declining is not a category anywhere: the difference between eligible and took part contains people who said no, people who have not got round to it and people who were away, and nothing separates them. Enrolment, and what leaving does and honestly cannot do. For a sponsor: a statement of what they paid for, defaulting to an amount and a date, with the service named only if the recipient switches it on for that sponsor | All three |
| Append-only vetting audit | Who decided, when, on what evidence and what changed. Prepend-only in the preview, and gone on reload | Web |
| Accessible clinical charts | Every chart carries a spoken summary and the same values as a real table | Passport, doctor review |
| System states | Loading, service error, offline, permission denied and empty, as shared components used by the real screens and collected in one gallery | All three |
| Localisation, and how much of it is real | The shell, navigation, tab bar and primary actions in all eleven written official languages — English, isiZulu, Sesotho, Afrikaans, isiXhosa, Sepedi, Setswana, Xitsonga, siSwati, Tshivenḓa and isiNdebele. Ten of the eleven were drafted by software and read by nobody who speaks them, and every screen that offers one says so on the row where the choice is made rather than in a footnote. A language may only be presented as reviewed once the contract names the person who read it, the organisation and the day; the build fails otherwise. Four languages carry the hero banner and the vetting console as well, and which sets a language covers is declared rather than discovered | All three |
| Clinical wording, and the one language it is in | English, in every locale, until a clinician who reads the language has reviewed it — enforced structurally rather than promised. There is no clinical key in the locale contract for a translator to fill in, `clinicalLocale()` is generated onto all three platforms and returns English for every locale whose clinical review is not complete, the build fails if any string in the locale table matches a sentence from a clinical contract, and it fails again if a locale claims a completed clinical review without naming the clinician, their registration and the date | All three |
| South African Sign Language | An official language since 2023 and a visual one, so it is deliberately **not** in the list of languages the interface is translated into — a toggle that changes nothing is a claim of access rather than access, and the build fails if it appears there. It is a communication requirement on the account, with the written language a separate choice; six things a visit and a call must do, and six that must never happen, including a family member used as the interpreter for a clinical conversation and a Deaf patient written to in English and assumed to have understood. The interpreter is the participant the teleconsultation roster already has — named, consented to and removable — rather than a second, quieter mechanism. None of it is a working service, and the screen says so | Web screen and language dialog; native language screens |
| Large text, small screens and the size of a target | Measured on every build rather than asserted. `tests/accessibility.spec.ts` runs the shell, the emergency pathway, the nurse workspace and the language screens at a 320 px viewport and with the layout viewport halved — what 200% browser zoom does to a page — on both project viewports, and fails on horizontal overflow, on any control under 44×44 that the token file has not declared as an exemption with a reason, on any declared exemption under the 24×24 WCAG 2.2 SC 2.5.8 requires at AA, and on any rendered text below the smallest size the type scale declares | Web tested; iOS by inspection; Android lint plus inspection |
| Colour contrast, computed | Thirty-two foreground/background pairs are computed from `packages/design-tokens/tokens.json` on every build against WCAG 2.2 AA, and none of them fails. Six once did and were parked with a measured replacement each; all six are now fixed rather than re-parked — `--faint`, `--amber` and `--danger` darkened to the values that had been measured beside them, and two teal-on-tint pairs reclassified, because they are icons at 3:1 and had been held to 4.5:1 as if they were label text. The build still refuses a parked failure whose proposed fix has not been measured, and one that has started passing and been left in the confessions. The focus indicator is two rings with tokens of its own: it was `--amber`, which also labels warnings, and darkening the warning enough to be readable took the ring to 2.2:1 on a dark panel. No single colour clears 3:1 against both a white card and a forest panel, so a light inner ring carries the dark grounds and a dark outer ring carries the light ones | Web; the palette is shared with native |
| Shared design language | One token set, one illustration source and one set of shared components, implemented natively three times | All three |
| The vetting vault, reachable | **Built and running** in `apps/api`. Nine routes reach the evidence vault and the gate: your own standing, another party's, enrolment, a document in, a document out, a decision, a second reviewer, a suspension and a restoration. Who is asking is never on the request — the account id comes off the session cookie and the role out of `vetting_parties` — so the refusals that were only ever true in a test suite are now true of a request: nobody decides their own vetting, a second reviewer is a different person, a standard-risk check will not take one, a check with no document on file cannot be verified, and a suspension has to say why. A reviewer whose own police clearance ran out overnight loses the vault this morning with nobody having to notice | Web console; the service holds the vault |
| Subject access, correction and the request queue | **Built** in `apps/api`. An export of everything the service holds about you, demanding a code, scoped to you because there is nowhere on the request to name anybody else, and written into the answer rather than into a file — so nothing expires and nothing is delivered anywhere. Correction as a right separate from deletion, with the mobile number refused because it *is* the account. A queue of both section 24 rights with the thirty-day clock and an overdue count, holding ids and dates and no names, and a proof of response naming who answered and never editable afterwards | Service; the web preview has the request screens |
| The security compromise register | **Built** in `apps/api`. POPIA section 22, with no severity ladder — that question is a yes or a no, and a four-rung ladder in front of it is a way of answering it "medium". Any vetted party may report one whatever their standing, because a report you have to be in good standing to file is a report nobody files on the worst day. Nothing closes before it is contained, and nothing that reached personal information closes until both the Regulator and the people affected are recorded as told. Detection, paging and delivery are absent and the module says so | Service; the Control Tower's operational incident board is a separate, web-only preview |
| Versioned consent, and the log of who opened a record | **Built** in `apps/api/src/consent`. Consent is to a *version* of a *purpose*, never a boolean on a person: the fingerprint of the exact wording and of the withdrawal sentence is what is stored, so the words cannot be edited out from under a recorded consent; wording that has changed does not carry the old agreement forward, and the person is asked again with the reason for the change; withdrawal is one action with no reason required, is recorded as an entry of its own, and answers with what is kept anyway and the law that keeps it. The consents care depends on are separated from the optional ones structurally — an optional purpose has no route to the care decision at all. Beside it a clinical access log distinct from the sign-in log: who opened whose record, when, under what lawful basis and what capability, refused attempts included, readable in full by the person whose record it is. Records no reading, and has no column one could go in. Each of its entries hashes onto the one before it, and the head is sealed into the gate's keyed chain by the module that holds the key, so a row altered in the database file is detected rather than only correlated — `GET /health/access-log` says so, and names the first entry that does not follow | Web; the service holds both ledgers |
| Identity service | **Built**: one-time-code sign-in over a first-party HttpOnly cookie, peppered hashes, attempt burning, rate limits, no account enumeration, sliding and absolute session limits, append-only auth audit, production refusals. Holds identity only — no health information | Web; native keeps its first-run route |
| Admin console | Reporting against the funding plan, vetting pipeline gating dispatch, catalogue pricing with live platform margin, subscriptions and B2B, milestone-gated tranches, compliance checklist | Web only — a back office, not a phone surface |
| Session and sign-out | Sign out from the profile menu or More; the shell and the account are unreachable until sign-in | Web; native keeps its first-run route |
| Commercial model | The proposal's prices, nurse shares, subscriptions, B2B lines, screening packages, device costs, trajectory and seed round as checked data | Shared data; phase-one prices held in step with native |
| One Johannesburg, on real streets | **Built.** The dispatch board used to be a 100×100 SVG square with circles on it, and the suburbs, their coordinates and the map window were typed into a React component, a SwiftUI view and a composable separately — three cities that had already drifted. There is one now: `packages/catalog/geography.json`, generated into Swift and Kotlin. The web renders it on Mapbox GL v3 with the base map's point-of-interest clutter turned off, and falls back to the schematic — the same zones and pins from the same contract — when no tile token is configured, which is the state every test runs in and the state the repository ships in. What the map refuses is the substance: a visit is drawn at the centre of its suburb and never at its address, no coordinate is sharper than three decimal places, the maximum zoom is 15 because at 16 a reader can pick out a house, a nurse not sharing a position is absent rather than placed somewhere plausible, no map draws where anybody has been, and nothing about the caseload is sent to a tile provider. Each of those is a boundary check that was proved by breaking it | Web on tiles; iOS and Android draw the schematic, and neither declares a location permission |
| How a person reaches a doctor | **Designed and checked, on all three platforms.** The call itself was already built — who is in the room, what a bad line takes away, what an unfinished encounter may be called. What was missing was the module around it: the three routes in, the wait, and what may come out. The proposal sells no standalone video consultation, so none is invented — Thuso Doctor joins a nurse's visit, reads what was captured, or takes the booked counselling session that is already in the catalogue. The route a patient does not buy carries no price at all, because a nurse who has to justify the cost of a second opinion will sometimes not ask for one. The wait ends after fifteen minutes with a different plan rather than a longer wait. A call may write a prescription where a record exists, renew a chronic authorisation at the review that authorisation already ends with, and refer — and it may **not** issue a medical certificate or extend one, because a certificate says a doctor was satisfied somebody could not work and nobody was in the room. That last one is a question for the HPCSA rather than for this repository, and until it is answered the build fails if anybody flips it | All three |
| The assistant, drawn rather than pretended | The visual language the founder asked for — a soft, luminous sage shape that changes with what the app knows — built as a status drawing and not as a voice product. `packages/catalog/capabilities.json` carries `voice` as unconnected with three things blocking it, and its `neverSoften` note refuses a microphone affordance of any kind: not an enabled one, not a disabled one, not a decorative one. So there is no mic glyph, no waveform, no listening ring and no tap-to-speak, and the sentence saying MyThuso cannot listen is rendered from the contract rather than typed. Four states — nothing waiting, a visit on the first day the scheduling contract offers, a laboratory result released, and a registration inside the 45 days after which vetting withdraws what it carried — each carried by words as well as by tone, because sage is a fill and never a label. The breath stops under Reduce Motion and when the screen goes away, and moves nothing anything else is measured against | iOS; the contract is generated into Swift and Kotlin, and the Android screen is not built |
| Three bodies of prose, made contracts | The seven reading explanations — about 2,500 words on what each observation measures, what a number outside its range may follow from and what to do about it — were written once in `lib/explain.ts`, again in `Explain.swift` and a third time in `Explain.kt`, with nothing comparing them; six arrival refusals were written twice; and what the offline queue survives was written twice in different words about the same file on the same phone. They are `records.json`'s `explanations`, `geography.json`'s privacy rules and refusals, and `capture.json`'s `durability`. Moving them edited nothing: all 33 explanation strings were already byte-identical across the three platforms and are byte-identical in the contract. The rules they carry are checked rather than trusted — the ordinary cause is said before the frightening one, no paragraph names a number, every urgent condition is an id `sos.json` actually has, the oximeter still admits it reads high on darker skin, and the one sentence that mentions a dose refuses it. Three platforms do not keep the same things and the queue contract does not pretend they do: what a store survives and what a screen says about it are separate fields, the two phones are held to one promise, and the browser is held to keeping less | Contracts and the web read them; nine hand-written copies are quarantined, held to every word, and their quarantines fail the build the day they are no longer needed |
| Hero banner | Three auto-rotating slides with animated background texture, a figure that breaks the banner's top edge, pause control and a photography drop-in point | All three |

## Feature coverage

| Area | Web preview | Native iOS / Android preview | Later functionality |
|---|---|---|---|
| Onboarding | Six-step sign-up, identity check-digit validation, recovery setup, consent separation held in step with the contract by a boundary check | Native equivalents of every step | Home Affairs verification, SMS provider, rate limiting, device binding; the sign-up screen writing to the consent register rather than to its own state |
| Identity recovery | Three recovery routes with acknowledgement state | Native routes and acknowledgement | Verified trusted-contact flow, cooling-off period, physical-site process |
| Patient home | Dashboard, care illustration, service cards, upcoming visit, family, Passport | Native home, services, visit card, Passport and family routes | Real personalised care data |
| Thuso Nurse | Nine service catalogue, filters, search, 3-step booking | Searchable catalogue and native booking review | Matching, scheduling, secure messaging, live ETA, reschedule/cancel policies |
| Visits | Upcoming/past fixtures, new bookings, details, integration states | Upcoming fixtures, new bookings, details, integration states | Real visits, status events, receipts, cancellation |
| Thuso Pass | Accessible trend charts with data tables, timeline, documents, sample prescription and laboratory order, limited sharing/revoke, JSON export | Native charts with tables, records, sharing toggle, native system export | Verified clinical record, scoped grants, signed documents, emergency QR design |
| Thuso Family | Family cards, add-member preview, guardian invitations with scope/duration/verification and revocation | Native family list, add-member preview and invitation management | Real invitations, verified authority, guardianship proof, diaspora sponsorship |
| Thuso Routine | Five plan cards with indicative pricing | Five native plan cards | Billing, eligibility, schedules, care pathways |
| Thuso Wallet | Sample balance/activity and entry dialogs; the nurse side is the earnings and payout screen | Native balance/activity and entry screens | Payment provider, vouchers, immutable ledger, sponsorship |
| Privacy | Switches, sharing, guardian access, request acknowledgement, and — reading the service where one is running — your consents with their versions, wording, fingerprints and withdrawal, and the real access log including refused attempts | Native switches, invitations and rights entry screens; consent and the access log are web-only | Recipient, scope and expiry per consent and propagation downstream; guardian consent as a proven authority; a disposal for the access log's own six-year period |
| Nurse workspace | Schedule, availability toggle, full visit assessment with device capture, the offline queue, weekly earnings and payouts, onboarding and vetting | Native equivalents | A payment provider, a real ledger, bank verification, real dispatch integration |
| Doctor workspace | Review queue with trend chart, outcome and rationale sign-off, and the teleconsultation call with its roster, consent, connection ladder and encounter outcomes | Native queue, review and call | A media transport, real prescriptions, referrals |
| Partner workspace | Prescription and laboratory order detail with chain of custody and release control | Native fulfilment queue and order detail | Partner APIs, real dispensing, courier integration, result delivery |
| Control Tower | Dispatch map and assignment gated on vetting, incident triage and log, the vetting queue for all thirteen roles | Native dispatch board, incidents and vetting | Live positions, real assignment, paging, escalation, revenue |
| Localisation | Shell, navigation and primary actions in eleven written languages, ten of them labelled machine-drafted; the language and access screen; SASL as a communication requirement rather than an interface language | The same eleven languages and the same labels, from the same generated table; SASL guidance on the native language screens | A human review of ten languages, and a clinical review of any of them |
| SASL interpreting | An interpreter is a vetted party with six checks of their own — identity, SATI accreditation, a police clearance, health-setting interpreting, a confidentiality undertaking and POPIA — and one capability, granted nothing that opens a record. A roster of four interpreters carrying free hours rather than conclusions; a visit that needs an interpreter and has not got one is held rather than dispatched; a wait shown when there is one and admitted when there is not; cancelling free and recorded against MyThuso; and on the call the interpreter cannot be unticked and asking them to leave ends the consultation | All three |
| Thuso Kit / AI | Pairing, calibration, capture with provenance, and the offline queue with its four conflicts | Native equivalents | Real Bluetooth transports, validated models, clinical governance |
| Thuso Screen | Feature entry | Native feature entry | Package eligibility, clinician-approved questionnaires, referrals |
| Thuso Wear | Apple Health / Health Connect entries with a permission-denied state | Platform-specific native entry and state | Granular permissions, compatible reading types, sync |
| Pharmacy / Labs | Order detail and partner workspace | Native order detail and workspace | Partner APIs, prescriptions and laboratory reports |
| SOS / Corner | The Thuso SOS pathway end to end: emergency services first, routing questions, the target, vetting-gated dispatch, standing down and every failure screen. Thuso Alert is described and refused rather than sold, and Thuso Corner appears as a recovery route | Native equivalents of the whole pathway | A contracted ambulance partner, a real urgent rota, telephony, clinically reviewed routing questions and community schedules |
| Work / Locum / Academy / Money | Roadmap entries, relevant workspace tools | Native roadmap/tool entries | Employer programmes, shifts, learning and regulated finance partners |
| Cover / Devices | Roadmap entries | Native roadmap entries | Regulated insurer/device partnerships; Pod/Band/Home/Lab development |

## What the new flows deliberately refuse to do

- A failed visit code stops the visit. It does not warn and continue.
- A vendor feed that carries more than was asked for is refused at the door rather than stripped on
  arrival, because a field that is stripped is a field that was received. A position feed may not
  carry a patient id, a roster may not say why somebody is off work, a pharmacy may not send back a
  diagnosis, a media session may not arrive with a recording, and a model may not return a
  prescription.
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
- MyThuso is not an ambulance service and is never arranged to look like one. The ambulance number is
  at the top of the emergency screen, above everything MyThuso sells, and no answer to any question
  moves it — because a screen that offers its own service first is asking a frightened person to
  compare the two, and some of them will choose wrong.
- Software does not triage. The emergency screen asks three questions and they route rather than
  assess: any one of eight named conditions — chest pain, difficulty breathing, uncontrolled
  bleeding, unresponsiveness, stroke signs, a seizure, a child under two who is floppy or not
  feeding, an obstetric emergency — ends the questions at an ambulance. Nothing is scored, and a
  condition in the contract that carried a severity would fail the build.
- Under 45 minutes is a target, not a guarantee, and it is never printed as an arrival estimate. An
  arrival the app cannot work out says it is estimating and says why, with the basis of every
  estimate beside it — the same rule the dispatch board follows.
- Urgency never relaxes vetting. A nurse whose police clearance lapsed is refused on the emergency
  screen in the register's own words, and there is no override there for anybody.
- Silence is not a cancellation. An unanswered callback keeps the request open and the nurse
  travelling; a dropped request is the one failure a panic button cannot be allowed to have.
- No fictional phone number may appear on the emergency pathway. Every other screen in this preview
  is fictional on purpose; that one is checked digit by digit against the numbers South Africa
  actually uses, and nothing in any app dials any of them.
- A consultation is not a private appointment with a doctor. Everyone who can see or hear the patient is
  named before the call opens, with where they are standing and what they can hear, and anyone except the
  doctor can be asked to leave mid-call without a reason. Nobody observes for training, ever.
- Consent to be treated is not consent to be recorded. The preview offers no recording and no switch for
  one — a control this build cannot honour would teach a patient to grant it — and says instead what a
  recording would be for, who could open it and that it would be destroyed after thirty days.
- A dropped call is not a finished one. The encounter stays open, the doctor calls back rather than the
  patient redialling, and an encounter that never reached a decision is written into the record as an
  interrupted encounter with no assessment, no plan and no signature. There is no button on any of the
  three platforms that would close it as a completed consultation, and it is never charged for.
- Sound only is not an error state. What a poor line takes away is not the patient's standing but what the
  doctor may conclude alone, and the screen names each thing withdrawn. A doctor on a screen examines
  nobody: anything felt or measured is the nurse's finding, under her registration.
- A doctor whose HPCSA registration has lapsed cannot open a call, and is refused in the clinical queue's
  own words rather than in a second sentence written for video.
- Consent is never a boolean on a person. It is to one version of one purpose, and when the wording
  changes the old agreement does not quietly become agreement to the new words — the person is asked
  again, and told what changed.
- What is stored as proof is the fingerprint of the exact words shown, not a pointer to wording
  somebody can edit afterwards.
- Withdrawal is never harder than agreeing was. One action, no reason, no confirmation step — and
  what withdrawing does not undo is on the screen before anything is touched, with the law that
  keeps it, because a withdrawal is not a deletion and saying only "done" tells the pleasant half.
- Refusing an optional consent cannot reach the care decision at all. Not "does not today" — an
  optional purpose has no route to it, and the build fails on a contract that says otherwise.
- Reading a notice is not agreeing to anything. The POPIA notification is recorded as an
  acknowledgement, cannot be withdrawn, and is never counted as a consent.
- A refused attempt to open a record is written down exactly as an allowed one. A log that only
  shows successes cannot show anybody an attempted intrusion.
- The access log records that a record was opened and never what was in it, and there is no column
  one could go in — the forbidden column words are read from the contract, not remembered.
- A log that only refuses to be edited by its own code is not evidence. Each entry hashes onto the one
  before it, and the head of that chain is sealed periodically into the gate's keyed chain by the one
  module that holds a key — so a row rewritten behind the service's back is detected rather than merely
  correlated, and the module that owns the log still cannot forge the chain it is evidence in.
- A substitution is a clinical decision, not a stock decision. An empty shelf is a reason to consider an
  alternative and never on its own a reason to hand one over, and an item that must not be substituted carries no
  control on the screen at all — a button that refuses is still a button somebody looks for a way around.
- A substitution never changes the molecule, the strength or the route. Those are the prescription, and changing one
  of them is prescribing done by somebody who is not a prescriber. The build fails if a fixture does it.
- Nothing is handed over as though it were what was written, and nothing can be marked handed over before the words
  said to the patient have been shown. A substitution is not anonymous either: it carries the pharmacist's name and
  SAPC registration, and a placeholder registration fails the build.
- A prescriber's own-hand "no substitution" has no override on the screen. The route back is the prescriber.
- No repeat is authorised by software. An authorisation runs out on a date and on a number of repeats, whichever
  comes first, and what follows is a review rather than a renewal. An early collection is refused with the date it
  may be collected, not filled quietly.
- An employer never receives a named result — not on request, not under a contract, not in an emergency, and not with
  the employee's own consent, because an employee who wants their employer to have something shares it themselves,
  from their own record, to a named person, for a stated purpose and period.
- No figure is published about a group of fewer than twelve people, or about a group where one answer covers four
  fifths of it, or in a shape from which a suppressed group can be recovered by subtraction. Where suppression would
  leave exactly one group hidden, a second is hidden as well. The floor is a judgement rather than a standard, it is
  written down so it can be argued with, and it has not been signed off by an Information Officer.
- There is no report, export, filter or support request that tells an employer who declined. Declining is not a state
  recorded against a name for an employer to be given.
- A sponsor cannot make payment conditional on being told what the care was for, and their statement names an amount
  and a date unless the recipient chooses otherwise — a line reading "sexual health screening" discloses more than
  most diagnoses do.
- Leaving a programme stops the counting from that day. It does not un-publish a figure already issued, and the
  screen says so rather than promising something nobody could keep.
- Nothing in any of these flows is transmitted, stored or acted upon.

## Delivered as build guarantees, 10 September 2026 — the ingestion boundary

Fifteen capabilities are declared and none is connected. Most of them are blocked on something no
engineer can produce: a contracted SMS provider, a payment provider, a nurse roster, live device
positions, agreements with thirteen credentialing authorities, a pharmacy network, an interpreter
service, an ambulance partner, a media stack, an AI licence. Nobody can sign a contract from inside a
repository, and nothing here changes that. **Not one capability became connected, and reaching
`connected: true` is now strictly harder than it was.**

What landed is the seam each of those suppliers would arrive through, described as data and held by a
check, plus the door itself: eleven routes in `apps/api` that validate a payload, refuse it, record
that they refused, and answer with the capability's own not-connected sentence.

| What landed | The refusals it adds | Where |
|---|---|---|
| **Eleven feed seams, one per supplier that would have to be signed.** Each says what would have to arrive as a schema derived from what the product already renders, points at the sample data standing in for it today rather than changing it, names the conditions that must be true before it may be switched on, and lists the fields that must never arrive at all | A capability may not be marked `connected` while any switch-on condition of any feed serving it is unmet — so the flag now needs the specific things somebody would otherwise satisfy in their head at eleven at night. No feed may accept a field another feed refuses by name. Every capability is either served by a seam or carries a written reason there is none: `voice` (the blocker is not a vendor but an unanswered question about recording somebody describing a symptom in their home), `devices` (`src/capture/**` already is the seam) and `clinical-records` (there must not be a route). A feed may not record its section 72 determination as made | `packages/catalog/feeds.json`, twenty checks in `scripts/check-boundaries.mjs` |
| **The doors themselves, all locked.** A route per feed, registered from the contract rather than written out, so a feed added next year cannot forget to be refused. `GET /feeds` is what a vendor would otherwise be sent as a PDF that goes out of date the week after | Every route refuses every payload, **including a well-formed one** — the correct answer to a correct payload, from a service with no adapter behind it. `decide()` returns a refusal type with no success variant. A forbidden field is refused **before** the shape is checked and at every depth, on a canonical spelling, so a patient id in a position feed is caught as `patientId`, `patient_id`, `PATIENT-ID` or nested inside a wrapper. A capability marked connected makes the route throw rather than start accepting | `apps/api/src/feeds/**`, `apps/api/test/feeds.test.ts` (21 tests) |
| **Nothing a stranger typed is written down.** A JSON key is a string somebody else chose, and `{"bp 180 over 110 mmHg": 1}` is a valid one | A forbidden field is reported by **the contract's** name for it, never the sender's. A field that is simply not in the schema is reported as a **count**, never as a name. No value is read, kept, echoed or hashed. Asserted against the response body *and* against the audit chain — the sharpest refusal in the work, because the ordinary way an audit trail becomes a second copy of a record is a free-text field nobody constrained | `apps/api/src/feeds/index.ts`, `apps/api/test/feeds.test.ts` |
| **The chain head can now be carried off the machine and brought back.** Publishing it is still absent and still needs a second organisation; what was missing and was *not* an agreement is the ability to check one | A statement is refused rather than half-read. A chain shorter than one witnessed is refused. A chain truncated to a prefix and grown again with real entries is refused on the hash at the witnessed position — the case `verify()` calls intact. A statement made over an empty chain vouches for nothing and is not blessed. The module may not reach a network, and may not lose the sentence saying it publishes nothing | `apps/api/src/protection/witness.ts`, `apps/api/test/witness.test.ts` |
| **The one number in the service that is a proposal can now be measured.** Sixty writes per caller per fifteen minutes was arrived at by reasoning, not by watching anybody | `write_windows` may not grow a column somebody could be identified by — five integers per window and nothing to join to anything. `busiest` is declared a lower bound rather than presented as the figure, because the limiter slides and the bucket does not. Two things the holdings register promised and no code carried out are fixed: `write_attempts` was never swept, and an erasure never reached it | `apps/api/src/store.ts`, `src/retention.ts`, `GET /health/limits`, `apps/api/test/write-windows.test.ts` |

## Delivered as build guarantees, 9 September 2026

Three pieces of work with no screen of their own. Each turns a claim this repository was making in
prose into something that fails the build when it stops being true.

| What landed | The refusals it adds | Where |
|---|---|---|
| **The seven clinical reference ranges moved into the contract.** They were an array in `apps/web/src/features/Clinical.tsx`, and `check-boundaries.mjs` compared the iOS and Android assessments against that TSX file. A number that decides whether a reading goes to a doctor was declared on a screen, and two native apps were checked against it | No screen on any platform may type a reference range — the check names the file and the observation and points at the contract. A range whose ends are the wrong way round is refused at generation, because it would flag every reading ever taken. A range stated without the sentence saying it is indicative and not a validated early-warning score is refused on every platform. The quarantine for the two hand-written native assessment screens is self-retiring: the day either stops typing its own seven, the build fails until its line is deleted | `packages/catalog/records.json` → `apps/web/src/lib/observations.ts`, `scripts/emit-records.mjs` → `RecordsData.swift` / `RecordsData.kt`, six checks in `scripts/check-boundaries.mjs` |
| **The walked-journey audit became a check.** `docs/FLOW-COMPLETENESS.md` recorded 96 journeys and six of its defects were one shape: a name in a navigation with nothing behind it. Three were still open a day later | A navigation destination may not open a dialog by arriving, may not render the shell's not-drawn placeholder, may not be empty, may not be headed with another section's name, and may not render exactly what another section renders. Every landing-page anchor must point at an id that exists | `tests/journeys.spec.ts`, 40 destinations across four applications, both viewports |
| **The identity service sets its own security headers and caps its own clocks.** The privacy document said production must supply them "at the hosting layer" — a control owned by nobody, on a box serving five sites this repository may not reconfigure | Nothing may frame an answer. An answer loads nothing, submits nothing and asks for no camera, microphone or location. HSTS is sent only where the cookie is already `Secure`, and never with `preload` — a preload entry is a submission to a list the service cannot withdraw itself from. A request is capped at fifteen seconds and its headers at five, so a connection sending one byte a minute can no longer hold a socket for Node's five | `apps/api/src/server.ts`, eight tests in `apps/api/test/server.test.ts`, nine checks in `scripts/check-boundaries.mjs` |

| **The authorisation gate got routes, and an actor nothing can lie about.** `docs/PRIVACY-AND-SECURITY.md` said the sharpest thing anybody has said about this codebase: the gate had a real vault, a real test suite and no HTTP route reaching either. The reason was written into `server.ts` — a route that takes an actor id off a request body and hands it to the gate is precisely the hole the gate exists to close | Nine routes now reach the vault, and every one resolves who is asking from the session cookie and the vetting register: the id is the signed-in account, the role is read out of `vetting_parties`, and the purpose is derived from whether the party being acted on is the caller. Nothing on a request can name any of the three. A reviewer whose own clearance lapsed overnight is refused this morning, over HTTP, by the same arithmetic that always refused her in the tests. The founding ceremony still has no route and a request to one is a 404 | `apps/api/src/actor.ts`, nine routes in `apps/api/src/server.ts`, thirteen journeys in `apps/api/test/vetting-routes.test.ts`, two checks in `scripts/check-boundaries.mjs` |
| **Export, correction, the section 24 queue and a security compromise register.** Four of the controls the privacy document listed as absent, and the four that needed neither a vendor nor a key | An export that is scoped by having no id on the request, demands a code, goes through the gate, and is written into the answer rather than into a file — so there is nothing to expire and nothing to leak. Correction as a right of its own, refusing the mobile number because it is the account rather than a detail on it, and refusing the append-only logs while offering section 24(2)(c)'s note in the same breath. A queue holding both section 24 rights with the thirty-day clock, a proof of response nobody can edit, and a sentence saying plainly that it pages nobody. And a POPIA section 22 register with no severity ladder, no name and nowhere a name could go, which refuses to close an incident that reached personal information until **both** the Regulator and the people affected are recorded as told | `apps/api/src/subjectExport.ts`, `subjectRequests.ts`, `incidents.ts`; twenty-nine journeys in `apps/api/test/privacy-routes.test.ts`; six checks in `scripts/check-boundaries.mjs` |
| **What a legitimate caller may do, decided.** The privacy document listed the unlimited routes and left them, with a reason that was correct: a limiter is a decision nobody had made | Sixty requests per caller per fifteen minutes, on every write and on the four health routes, keyed on the account where a session resolves and on the address where it does not. It is in the dispatcher rather than on each route, so a route added next year cannot forget it, and only the three sign-in routes — which carry tighter limits of their own — are exempt. **The number is a proposal**, arrived at from the busiest honest sequence this service can produce and labelled as such where it lives. And the three `/health/*` integrity routes now answer the loopback only, which is what the comment beside them always claimed | `limits.writesPerCallerPerWindow` in `apps/api/src/config.ts`, the dispatcher in `server.ts`, four checks in `scripts/check-boundaries.mjs` |

And `docs/PRIVACY-AND-SECURITY.md` opens with an audit of its own controls: which are implemented,
which are written and unreachable, and which are prose. Of its twenty-six rows, eleven are now
implemented, five partial and six absent — up from six, four and twelve — and every absent one names
the obstacle rather than a shortage of time: a vendor, a key ceremony, an agreement, or a fact about
a person that no code can establish. Two of the four things it called libraries with test suites now
have routes. The clinical access log's `open()` and offline capture still do not, and their reasons
are now different from each other: one is waiting for a record to open, the other for a device this
service can identify rather than be told about. **`clinical-records` is not connected and nothing in
this increment changes that** — no clinical record exists, no route touches one, and the boundary
check that fails the build on a clinical table in `apps/api` still refuses one.

## Cross-platform consistency

The demo verification codes, the identity check-digit validation, what a nurse is paid — a visit's amount exists in one file and is derived everywhere else, including in the claim the public page makes about it — and the whole vetting table — thirteen roles, seventy-six checks, every issuing authority's credential format, every scope of practice and every refusal sentence word for word — are duplicated in three codebases by design — each app is genuinely native. `scripts/check-boundaries.mjs` fails the build if any of them drift apart. The clinical reference ranges used to head that list and no longer do, for the reason the whole list exists: they lived in the `observations` array of `apps/web/src/features/Clinical.tsx` — a React component — and the boundary check compared the iOS and Android assessments against *that TSX file*, so two native apps were held to a screen. Seven numbers that decide whether a reading is put in front of a doctor are contract, not presentation. They are in `packages/catalog/records.json` now, beside the consultation section that says they are indicative; the web reads them through `lib/observations.ts`, the emitter writes them into `RecordsData.swift` and `RecordsData.kt`, and a check refuses any screen on any platform that types one. The locale table used to be on that list and is not any more: it is generated from `packages/catalog/locales.json` into Swift and Kotlin and read directly by the web, so the two disagreements the old check could not see — isiZulu calling vetting one thing on iOS and another on Android, and a button reading "Apply to join" on one and "Start an application" on the other — have nowhere left to come from. The substitution table, the programme floor and the interpreter roster joined the generated list on the same terms: `packages/catalog/dispensing.json`, `packages/catalog/programmes.json` and `packages/catalog/interpreting.json` are emitted into Swift and Kotlin and read directly by the web, and none of the three generators writes down a conclusion — no authorisation expiry, no suppressed cohort, and no wait — so the arithmetic that decides when a repeat stops, which groups an employer may be told about and when an interpreter could actually be there is done three times from the same numbers rather than once by a generator.

**Live, and what that changed.** https://mythuso.co.za went up on 10 September — five entries over
TLS on liqzar-server, beside five unrelated production sites that were checked before the deploy,
after it, and again after certbot rewrote nginx. The deploy refused its first real run and rolled
itself back, on thirty conflicting-server-name warnings that were all bidza.co.za's and predate this
product; it asks whose conflict it is now, and reports a co-tenant's rather than stopping on it.
Three ways it could have reached another site's config were closed, one of them arbitrary root
command execution proved by creating a file. The health-check timer is enabled and reports honestly
that it is not checking the identity service or the backups, because neither is enabled.

**The map draws real streets, and asks first.** MapLibre and OpenFreeMap need no key, so the swap
removed a vendor rather than adding one. Tiles are **off by default**: a request tells whoever
serves it which square of Johannesburg somebody is looking at, and for a patient that is roughly
which suburb she is in and roughly when a nurse came to her house. The disclosure sits beside the
switch before it is pressed, and the 1.1 km figure in it is recomputed by the build from the zoom
limit, which fails if the sentence disagrees. Measured: zero tile requests before pressing, eleven
after.

**Eleven seams, all locked.** For every capability blocked on a supplier nobody has signed,
`packages/catalog/feeds.json` says what must arrive, what happens while it does not, what must be
true before it may be switched on, and what must never arrive — a nurse's coordinate may not carry
a patient id, a settlement file may not name the service, a media session may not carry a recording
URL. `apps/api` serves a route per feed that refuses every payload including a well-formed one, and
nothing a stranger typed is written down: an undeclared field is recorded as a count, never a name.

## Next UI increments

Remaining before a pilot-ready design: the vetting reviewer console on native, which is web-only
today — and which now has a server behind it, so the console is a surface rather than a design.

**Nine quarantined copies, and what retires each one.** Moving the three bodies of prose into the
catalogue could not finish, because adopting a contract means editing the file that holds the old
copy and two other people have those trees open. So each copy is held to every sentence of the
contract, word for word, and its quarantine line is written to expire: an entry whose file has
*stopped* carrying the prose is an error too, so the day a file reads the generated data the build
fails until somebody deletes the line. Waiting are `Explain.swift` and `Explain.kt` (read
`Records.explanations` and `recordExplanations`), `Arrival.swift` and `Arrival.kt` (read the seven
sentences out of `Geography.privacyRules` and `Geography.refusals`), `CaptureQueue.kt`,
`CaptureQueueView.swift` and `VisitQueueView.swift` (read `CaptureData`), and two web files that
each type one sentence a lib module now exports — `Arrival.tsx` and `VisitQueue.tsx`.

**One generated file is not yet in the iOS target.** `CaptureData.swift` is emitted beside its Kotlin
twin, and Gradle compiles the Kotlin one because it globs the source tree. Xcode does not:
`project.pbxproj` needs a `PBXFileReference`, a `PBXBuildFile`, a group `children` entry and a
`PBXSourcesBuildPhase` entry, and that file is hand-maintained by somebody else this week. Until
those four lines exist the iOS queue screens cannot read the contract even after their quarantine is
lifted.

**The glass redesign, 8–9 September 2026.** The founder chose a reference and then said of the first
attempt *"this is not the design I sent you"* — the palette had been taken and the shapes had not.
He then said what he had actually meant: *"something futuristic and having a futuristic glassy feel
with smooth animations… and also putting all functionalities on it from start to finish."*

What landed is a component language rather than a colour scheme. A metric is a status chip floating
*above* a large thin numeral with a small label beneath — this product did the exact inverse
everywhere, and that inversion was most of why it looked nothing like the reference. Navigation is a
pill row with a circular arrow that inverts on the active row. Separation is a hairline, not a
shadow. And over all of it, frosted glass on a luminous ground.

**Glass has one hard problem and it is solved rather than ignored.** A translucent surface has no
colour of its own — it is whatever is behind it, tinted — so a contrast figure measured against it
is a guess about where the panel sits. Every glass surface therefore declares a *floor*: the tint
composited over the darkest point the ground may reach. Contrast is measured against that, the
ground is built so it cannot go darker, and four things fail the build — an undeclared floor, a
floor that is not actually the composite, a ground darker than the one the floor came from, and a
stylesheet that ignores `prefers-reduced-transparency` or `prefers-reduced-motion`. The check caught
its author's own error on its first run: the wrong colour had been named as the darkest ground.
Charcoal is 16.28:1 on the floor and 14.48:1 on the ground at its worst. 54 pairs, none failing.

The fallback is not a degradation. `backdrop-filter` is expensive on the mid-range Android handsets
this product is for, and where it is missing the glass resolves to the floor — precisely the colour
every ratio was measured against. One agent first put a blur on every chip and button, about forty
compositor layers a screen, and a click began timing out one run in three; it is on six surfaces
now. Glass may never sit on top of text.

**And the flows.** All 96 journeys were walked in a real browser and written down in
`docs/FLOW-COMPLETENESS.md`: 61 complete, 12 blocking, 18 incomplete, 5 rough. Most of the blockers
are closed. A booked visit could not be cancelled at all — and of four visits exactly one had any
controls — while the Cancelled tab promised "the reason and any refund" for a feature that did not
exist. Care plans and the wallet were a single placeholder dialog pressed 28 times across the app,
which meant the two recurring revenue lines the proposal rests on could not be read. The Control
Tower's vetting queue rendered *the nurse's own application form*. The doctor's five outcomes all
opened the same form, and now seven do, each opening what it produces, with the two refusals — a
medical certificate and its extension — rendered on every signed decision. Thuso SOS, one of the
most complete journeys in the build, was reachable only from the fourteenth card inside Explore.

The line held throughout: **a missing next screen is a dead end; a notice saying a capability is not
connected is not.** Otherwise "complete the flows" becomes "pretend it works", which is the one
thing this product cannot do.

**What the glass redesign has not reached: iOS and Android.** Both native apps build green and carry
the new palette, because the tokens are generated into them — but the glass language, the metric
shape and the pill navigation are web only. The two apps and the web app currently look like
relatives rather than the same product.

**The redesign of September 2026.** The founder's words were "not serious and modern, a bit
cartoonish", and the diagnosis was brand drift: the shipped product was a herbal-green system with
no Deep Indigo in it at all, while the funding proposal names Vital Teal, **Deep Indigo**, Mango,
Slate and Soft Grey. Indigo carries the interface now; teal and mango are accents that cannot hold
text on a light ground and are written into `tokens.json` as not-measured with that reasoning beside
them. The decorative serif is gone — a magazine's judgement on a headline that says who is coming to
your house. The web type scale was twenty-five arbitrary sizes with an 11px floor and is thirteen
steps from 13px; Android had twenty-one sizes typed at the call site and eighty-one strings below
the floor; iOS had 410 fixed point sizes that ignored Dynamic Type entirely. All three read one
generated scale now. 38 contrast pairs are computed on every build and none fails.

What that pass also found, by looking at screens rather than at source: a profile button drawn 10px
off the right edge at 390px, a sign-up step number unreadable on its own fill, two family avatars at
3.98:1 and 3.46:1, three horizontal overflows hidden *inside* `main` where no page-level test could
see them, a Compose status pill breaking "Vitals" across four lines at the largest font scale, two
Android tones that had silently fallen through to the indigo default so no reading in range was ever
teal, a 1MB duplicate logo, no launcher icon at all, and a carousel animating nine bubbles forever
behind a screen that no longer rendered them.

**What is still not done in the redesign.** The deep clinical screens on both native apps — patient
file, capture queue, dispensing, vetting, teleconsultation, programmes — took the systemic pass
(type, spacing, colour, scaling) but not an information-architecture pass; several are still walls of
equal cards. No screen-reader testing has been done anywhere: VoiceOver and TalkBack semantics were
written and inspected, never driven. Nothing has been tested on real hardware or a slow connection.

Six items that used to be on this list have moved, and only as far as they have actually gone.

**Prescription substitution and chronic authorisation** is designed, built on all three platforms, and checked — twenty-five ways of breaking it were tried and every one of them fails the build. **None of its clinical wording has been read by a pharmacist**, and one judgement in it is worth a pharmacist's attention rather than an engineer's: the screen has three substitution classes, not the usual "may / may with telling / must not", because section 22F of the Medicines and Related Substances Act 101 of 1965 makes telling the patient a duty on every substitution — so the lowest tier here is *may be substituted, and the patient is told*, and a silent swap is outside the model rather than at the bottom of it. If that reading of section 22F is wrong, the whole shape of the screen is wrong. The medicines chosen to sit in each class — levothyroxine and a stabilised patient in *must not*, an insulin analogue as a biological, a hydrochlorothiazide supply failure as a pharmacist's judgement — are the same kind of judgement and need the same review. What is also not built: Schedule 5 and above, a formulary, any stock system, an actual notification to a prescriber, and the pharmacy's own dispensing record.

**Employer and sponsor programme administration** is designed, built on all three platforms and checked, with the suppression rule applied in each app from unsuppressed counts rather than handed to them pre-suppressed. **The floor is a judgement, not a standard, and no Information Officer has agreed to it.** Nothing in POPIA names a number; twelve people, a four-fifths dominance ceiling, rounding to five and never leaving exactly one group hidden are a design written down so that it can be argued with. What is not built: any real reporting pipeline, an invoice, an invitation that reaches anybody, and the differencing problem across a series of reports over time — the rounding narrows it and does not close it, and closing it needs somebody who does statistical disclosure control for a living.

**The remaining official languages** are there — all eleven written ones, from one contract, generated into Swift and Kotlin. **A human review of them is not.** Ten of the eleven were drafted by software and have been read by nobody who speaks them, which the app says on every screen that offers one and which a boundary check will not let anybody claim otherwise. What remains is a speaker of each language reading every string in the screen it appears on, and a name, an organisation and a date going into `packages/catalog/locales.json`. **A clinical language review has not started and cannot be started by an engineer**: it needs a clinician who reads the language, and until one signs each language off, clinical wording is English in all of them — which is enforced rather than promised.

**South African Sign Language interpreting** is designed, built on all three platforms and checked — twenty-two ways of breaking it were tried and every one of them fails the build. The guidance in `packages/catalog/locales.json` said what was owed and said that none of it was built; `packages/catalog/interpreting.json` is what carries it out. An interpreter is now the thirteenth vetted party, with six checks of their own and one capability — a build failure if that role is ever granted the patient summary, the record, a result or a protected category, because hearing a consultation is not reading one. The roster carries free hours rather than conclusions, so which hour answers a request is worked out three times from the same numbers; all three `firstFree` signatures can return nothing, and the build fails if one of them stops being able to. A visit that needs an interpreter and has not got one is held rather than dispatched, on the booking screen and in the visit list, in the contract's own word. Cancelling that wait costs nothing at any point and is recorded against MyThuso rather than the patient — both halves checked, because either alone is the failure. On the call the interpreter is the participant the roster already had: when the requirement is on the account they cannot be unticked, the call does not open until they are consented to, and asking them to leave ends the consultation and rebooks it rather than continuing in a language the patient did not choose. The refusals are rendered rather than merely enforced, on the interpreter screen and again on the call roster, which is where somebody would otherwise offer a relative.

**Three things in it are drafted rather than known, and one of them is load-bearing.** The accreditation route is the load-bearing one: MyThuso has taken SATI's accreditation examination as the route a SASL interpreter is checked against, and **nobody at SATI, DeafSA or PanSALB has confirmed that**. If accreditation runs somewhere else, the authority row is wrong and the check hanging off it is the wrong check. The membership-number format is deliberately not asserted — the register accepts the number as it appears on the certificate — because guessing a format is how a real interpreter is told their real number is invalid; that is the one place this feature refuses to be confident. Second, the three modes — in the room, on video, hand over hand for a Deafblind patient — and their relative scarcity are an engineer's guess at how SASL interpreting is actually arranged in South Africa, and the fixture that leaves tactile interpreting with nothing free is a design decision about what the screen must be able to say rather than a claim about supply. Third, **no Deaf South African and no qualified interpreter has read a word of any of it** — not the refusals, not the roster, not the sentence a patient is shown when the app cannot say when somebody will be free. What is also not built: any contact with an interpreter, a real hold on a real visit, an interpreter's own workspace, tactile interpreting as anything other than a mode name, and any of the arrangements for a visit rather than a call — the dispatch note that tells the nurse before she leaves is still guidance rather than a screen.

**Large-text and low-end device testing** is done for the web and for iOS, and measured on every build. The web: 320 px, 200 % zoom, target size and rendered text size, on both viewports. iOS has a test target now — `apps/ios/MyThusoUITests`, XCUITest, run by `xcodebuild test` and by the `ios` job in `.github/workflows/ui-quality.yml` — which drives the home, the booking flow and the Health Passport at the default content size and again at `AccessibilityXXXL`, walks each to the bottom of its content, and measures target size, labels, decorative images announced as elements of their own, anything pushed past the edge of the screen, whether a control laid out clear of the bars can actually be tapped, whether the foot of a nine-screenful page is reachable by scrolling, and whether each string answers the setting at all. It also books a visit end to end and reads the result back: the weekday on every date chip is checked against the date it names by asking the calendar rather than the app, and the visit ends its own service's length after it starts rather than a flat hour — the defect `f0b34df` fixed, now held down on iOS specifically. **It found what reading the screens had not**: every point size in the iOS design system ignored Dynamic Type, so at the largest setting the headings had tripled and the status pills and menu rows were still eleven and fifteen points, and nine controls were under 44 points at the default size, among them the *Change* link on the last screen before a booking is confirmed and the switch beside the preview consent. Both are fixed. **Screen-reader testing is still not done anywhere**, and neither is testing on real hardware. Android lint runs with its accessibility checks as errors and touch targets and roles on the four newest screens were corrected by hand, but no instrumented test runs. TalkBack, VoiceOver, and a low-end Android phone on a slow connection are all still ahead, and no measurement above is a substitute for any of them. Nor is the iOS suite complete: three screens rather than all of them, one simulator rather than a device, and a `Text` that is visually clipped while its accessibility label stays whole is not something XCUITest can see. The six colour pairs that failed WCAG 2.2 AA are fixed rather than recorded: `--faint`, `--amber` and `--danger` carry the values that had been measured beside them, two teal-on-tint pairs were reclassified as the icons they are, and the focus indicator became two rings with tokens of its own once darkening the warning colour took the old single ring to 2.2:1 on a dark panel. Thirty-two pairs are computed on every build and none fails.

None of these are claimed complete. `docs/ACCESSIBILITY.md` is the longer version of this paragraph.
