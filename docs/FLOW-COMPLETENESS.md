# Flow completeness

Where each journey starts, and where it stops.

Ninety-six journeys were walked with Playwright against the running web app on
`MYTHUSO_PORT=5503`, at commit `e21d172`, on both the desktop and the mobile viewport. Nothing here
was inferred from source; every row below is a screen that was opened, a button that was pressed and
a result that was read back. Line references were looked up afterwards to name the file.

**Sixty-one journeys complete. Thirty-five stop somewhere.** Of those, twelve are *blocking* — a
person cannot finish something the product puts in front of them — eighteen are *incomplete*, and
five are *rough*. By application: patient 15 of 35 complete, nurse 13 of 16, doctor 7 of 13, Control
Tower 7 of 10, partner 6 of 9, admin 13 of 13.

## What is counted as a stop, and what is not

`packages/catalog/capabilities.json` declares fifteen capabilities and none is connected. A screen
that completes and says plainly that nothing was dispatched, charged or sent is **finished**, and no
such screen is listed as a gap. "Your visit is booked… This does not book a visit. Nobody is
dispatched and nothing is charged" is a completed journey. "Nothing was submitted" at the end of the
five-step vetting application is a completed journey. So is the whole of Thuso SOS, which ends in a
nurse being asked and a stand-down offered, under an honest notice.

What is counted is a missing screen or a missing next step. There are three shapes of it in this
build, and they are worth naming because they recur:

- **The roadmap dialog** — "*X* is included in the MyThuso feature roadmap. Its dedicated workflow
  will connect to the relevant clinical, operational or partner services in the functionality
  phase." One button: *Got it*. Rendered from `apps/web/src/App.tsx`. **Twelve** patient controls and
  **sixteen** of the twenty-two Explore MyThuso cards open it.
- **The not-drawn dialog** — "*X* is in the roadmap and is not drawn yet. Nothing behind this name is
  connected to a nurse, a patient, a record, a payment or a device, and opening it changes nothing."
  From `apps/web/src/shells/StaffShell.tsx` and `AdminShell.tsx`. **Five** clinical workflows open it.
- **The subjunctive stub** — "*New consultation* would open here for Thando Mokoena." From
  `apps/web/src/features/PatientFile.tsx`. **Four** doctor actions end there.

These are not capability notices. A capability notice says a real screen is not wired to a real
service. These say the screen does not exist.

---

## Patient (`/`)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| Sign up, first screen to last | Explore MyThuso → *Set up your account* | Overview, signed in | — complete: 6 steps (language, number, OTP `240924`, SA ID, recovery contact and word, three consents) | — |
| Recover a lost phone | Onboarding → *I've lost access to my account* | Overview, with reference `REC-0042` | — complete: three routes, indicative wait, cooling-off notice | — |
| Browse and search the catalogue | Sidebar → *Book a nurse* | 9 bookable + 6 later-phase cards; search for "wound" narrows to 1 | — complete | — |
| Book a visit | Any service card | *Your visit is booked* → *View my visits*, and the visit is in the list | — complete: 4 steps, review blocked until the terms box is ticked | — |
| Book with a sign-language requirement | Language & access → SASL switch → *Book a nurse* | Step 2 gains "How should the interpreter be present?" and holds the visit | — complete: the account-level requirement reaches the booking | — |
| "Not sure what you need? Chat to our care team" | Booking catalogue, foot | The 4-step booking modal for **Vitals & chronic check** | There is no care-team chat. The button routes to an unrelated booking. `Booking.tsx` | blocking |
| Open a booked visit | My visits → *View details* | Modal *Your visit* with one button: *View Health Passport* | No cancel, no reschedule, no arrival state, no message. Its own copy admits it: "Arrival updates, secure messaging and rescheduling will be connected in the functionality phase" | incomplete |
| Reschedule a visit | My visits → *Reschedule* | Roadmap dialog | The booking flow already has a date-and-time picker; reschedule does not reuse it | blocking |
| Cancel a visit | — | Nowhere | **There is no cancel control anywhere in the patient app.** The Cancelled tab exists and holds a cancelled visit, and its empty state reads "Visits you cancel appear here with the reason and any refund" | blocking |
| Open the 2nd or 3rd upcoming visit | My visits → Upcoming | Nothing happens | `Pages.tsx:99` gates the nurse row and the action bar on `i===0&&tab==='Upcoming'`. Rows 2 and 3 (Wound care 25 Sept, Mother & baby 7 Oct) have no controls at all | blocking |
| Open a past visit | My visits → Past | Nothing happens | The completed Wound care visit of 5 Sept has no way in — no summary, no "what the nurse found", no rebook | incomplete |
| Open a cancelled visit | My visits → Cancelled | Nothing happens | No reason shown, no refund state, no rebook | incomplete |
| Health Passport, overview | Sidebar → *Health Passport* | Three trend cards, each with a working *Show readings as a table* | — complete | — |
| Health Passport, all trends | Passport → *See all* | Roadmap dialog | No trends screen | incomplete |
| Health Passport, care timeline | Passport → any of the 3 timeline rows | Roadmap dialog ×3 | A visit on the timeline cannot be opened | incomplete |
| Health Passport, care team | Passport → *Doctors* | Roadmap dialog | No care-team screen | incomplete |
| Health Passport, documents | Passport → Records | *Laboratory results* opens a full order with chain of custody and results; *Visit summary* and *Medical certificate* open "The production record will show the issuing clinician… *Got it*" | Two of the three documents have no screen | incomplete |
| Health Passport, medications | Passport → Medications | *See how a prescription reads* opens a full prescription; *Explore pharmacy fulfilment* opens a roadmap dialog | — the prescription itself is complete | rough |
| Health Passport, devices | Passport → More → *Review permission* | Three cards, each *How this connects* → "Native device permissions will let you… *Got it*" | No permission screen for any of the three | incomplete |
| Share my passport | Privacy & settings → *Who can see my records* | *Preview limited sharing* → "Demo access active" → *Revoke demo access* | — complete | — |
| Add a family member | My family → *Add a family member* | Name + relationship → *Add demo member* → the person is in the circle | — complete | — |
| Invite a guardian | My family → *Invite someone* | 4 steps (who, scope, duration, review) → *Send demo invitation* → row appears as "Verification pending" | — complete | — |
| Revoke a guardian | My family → *Revoke* | Row flips to "Revoked", the button disables | — complete | — |
| Open a family member's profile | My family → any member | "Care without crossing boundaries… *Got it*" | No profile. Cannot book for them from there, cannot see or change their scope | incomplete |
| Join a care plan | Sidebar → *Care plans* → *Explore plan* | Roadmap dialog, on all five plans | **No care plan can be joined, opened or priced.** Five plans, five dead ends | blocking |
| Thuso Wallet, top up | Wallet → *Top up* | "Care credits, on your terms… *Got it*" | No amount, no recipient, no confirmation | blocking |
| Thuso Wallet, sponsor care | Wallet → *Sponsor care* | The same dialog | Same | blocking |
| Change language | Sidebar foot → *Language: English* | 11 written languages, each with its review state, plus the SASL requirement → *Done* | — complete | — |
| Language & access, interpreter | Sidebar foot → *Language & access* | Ask for an hour: an unavailable slot holds the visit and offers a free cancellation recorded against MyThuso; Sunday 14:00 confirms with Karabo Mahlangu named | — complete | — |
| Consent given, withdrawn, re-versioned | Privacy → *My consents* | *Agree to version 2* → *Withdraw* → "Withdrawn. What is kept anyway is on the card, with the law that keeps it" | — complete, including the four optional consents | — |
| Access log | Privacy → *View access history* | 6 entries, 2 refused, each with its lawful basis and the reason for the refusal | — complete | — |
| Request a correction / deletion | Privacy → either row | Reason → *Preview request* → "Demo request recorded" | — complete | — |
| Contact the Information Officer | Privacy → *Information Officer* | "The Information Officer's verified contact details… will be configured before launch. *Got it*" | No contact details, no request tracking | rough |
| Emergency pathway | **Explore MyThuso → Thuso SOS card** | Ambulance numbers → three questions → area, callback, rota, hours → *Ask her to come* → *Asked* → four stand-down reasons | Complete as a screen, but **there is no door to it from the app**: no SOS control on Overview, in the tab bar, in the sidebar or on any visit. The word "emergency" does not appear anywhere on the patient home screen | incomplete |
| Explore MyThuso modules | Sidebar → *Explore MyThuso* | 22 cards: 5 open a working screen (Set up your account, Thuso Kit, Thuso Pass, Thuso Family, Thuso SOS), 1 an explainer (Thuso Doctor), **16 a roadmap dialog** | Two of the sixteen are labelled "Being built now" and their screens exist elsewhere: *Thuso Nurse* (the nurse workspace) and *Control Tower* (the operator workspace) | rough |

## Nurse (`/staff.html` → Nurse)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The day | Sign in as Nurse | Schedule: next visit, two later, duty toggle, day's share R 673 | — complete | — |
| Open a visit | Schedule → *Start this visit* | Visit assessment, step 1 of 5 | — complete | — |
| Identity check | Assessment step 1 | Wrong code `111111` → "That code doesn't match this visit. Call the Control Tower before continuing." Right code `482190` → step 2 | — complete | — |
| Consent, in plain words | Step 2 | Two questions read aloud → *Start observations* | — complete | — |
| Capture readings | Step 3 | Seven fields, each gaining a provenance chip and a *She told me this* switch; MAP calculated from two of them | — complete | — |
| A reading out of range | Step 3 with 176/104, 118, 24, 38.9, 90, 14.2 | "7 readings are outside the indicative range. Flagging is a prompt for your judgement" — each field flagged, carried to sign-off with ⚠ | — complete | — |
| Sign off | Steps 4–5 | *Sign assessment* → "Assessment closed" → *Open the consultation record this produced* / *Back to the workspace* | — complete | — |
| The day after signing off | Back on Schedule | The visit still reads NEXT with *Start this visit*; the header still says "One to sign off" and "3 Today's visits" | A signed visit has no state on the day list. The same visit can be started again | rough |
| Earnings | Sidebar → *Earnings & payouts* | Four weeks, each expandable to every line; reversal and correction lines named; tax; the 75/25 split per service | — complete | — |
| A payout that failed | Earnings → week to 27 Aug | "Your bank sent it back. It is still owed to you and goes out again with the next run once the account is right" | — complete | — |
| Change bank details | Earnings → *Change account* | One-time code `240924` → *Verify and start the wait* → "Waiting 48 hours" → *Cancel the change* | — complete | — |
| Earnings while suspended | Earnings → *Sister Ayanda Dube* | "You will not be sent new visits… A lapsed check stops new visits reaching you. It does not touch money you have already earned" — figures unchanged | — complete | — |
| Vetting application | Sidebar → *Vetting* | 5 steps (credential, scope, 8 evidence items, 3 declarations, attestation) → *Submit application* → "Nothing was submitted" | — complete | — |
| Vetting, after applying | The same screen | There is no application state to return to — no "in progress", no reviewer, no outcome | An applicant cannot see where their application stands. Only the admin console holds that view | incomplete |
| Thuso Kit | Sidebar → *Thuso Kit* | *Look for instruments* → 6 instruments to pair; connection off → on → *Send 3 entries* → *Interrupt the send*; six states counted | — complete | — |
| Locum shifts / Academy | Schedule → *More tools* | Not-drawn dialog, both | Two workflows named on the nurse's own home screen with nothing behind them | rough |

## Doctor (`/staff.html` → Doctor)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The queue | Sign in as Doctor | 3 cases, *Everything* / *Flagged*, waiting times | — complete | — |
| Open a case | Queue → TH-2048 | *Clinical review*: signing doctor, readings with a trend, symptoms, the nurse's next step | — complete | — |
| What the nurse found | The same modal | Flagged systolic 146 with the change since 12 Aug, pulse, symptoms, "Refer for doctor review within 24 hours" | — complete | — |
| Decide and sign | Outcome + rationale → *Sign decision* | "Signed by Dr Ayanda Dlamini · HPCSA MP0483217" | — complete | — |
| Prescribe | Outcome *Adjust medication and issue a prescription* → *Sign decision* | *Write this up as a consultation* — the same consultation form as every other outcome | **No prescription screen.** Prescribing is a free-text box inside the consultation record. All five outcomes lead to the identical next screen | incomplete |
| Refer | Outcome *Refer to a facility* → *Sign decision* | Same | No referral screen — no facility, no urgency, no acceptance | incomplete |
| Book a teleconsultation from a decision | Outcome *Book a teleconsultation with the patient* | Same | Nothing is booked and the teleconsultation screen is not opened | incomplete |
| Return a case to the nurse | Outcome list | Not offered | There are five outcomes and none of them sends the case back for more information. A case a doctor cannot decide has nowhere to go | incomplete |
| Write and sign a consultation | Sidebar → *Consultation records* | 8 fields for a nurse (12 for a doctor), SOAP / long-form / prose views, *Sign consultation* → "Consultation signed", everything disabled | — complete, including the fields a nurse is never granted | — |
| Teleconsultation | Sidebar → *Teleconsultation* | 5 steps (who is in the room, both ends checked, recording refused, the call, the decision) → "Consultation completed", with the twelve sections marked written or not reached | — complete | — |
| Patient file | Sidebar → *Patient context* | 8 tabs, a viewer switcher across 8 parties, Billing marked refused, protected categories withheld by name | — complete | — |
| Patient file actions | Patient file → *New consultation* / *Prescription* / *Referral* / *Upload document* | "*X* would open here for Thando Mokoena." | Four action rows, four stubs. *Book a visit* is correctly refused ("A Doctor is never granted this") — the other four are not refused, they are unbuilt | incomplete |
| Protocols | Sidebar → *Protocols* | *Clinical protocols* and *Referral pathway*, both not-drawn dialogs | **The whole section is two dead links.** They are duplicated as *More tools* on the review queue | blocking |

## Control Tower (`/staff.html` → Control Tower)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The board | Sign in as Control Tower | Dispatch: map drawn from coordinates, 3 visits awaiting a nurse, 24 active, 3 incidents | — complete | — |
| A waiting visit | Dispatch → TH-2049 / TH-2051 / TH-2052 | Service, area, window, priority, status | — complete | — |
| Who is near | The nurse list | 5 nurses, straight-line estimates labelled as such, two with no estimate and the reason for each | — complete | — |
| Assign | *Assign* beside Sister Palesa Khumalo | Button becomes *Assigned*, the visit reads "Assigned to Sister Palesa Khumalo", the map pin changes | — complete | — |
| Assign a nurse whose clearance lapsed | *Cannot be assigned* beside Sister Ayanda Dube | Disabled, with the refusal sentence and "The Control Tower has no override for a lapsed clearance" | — complete | — |
| Unassign or reassign | After assigning | No control | Once assigned there is no way back, and the header still reads "3 visits awaiting a nurse" | rough |
| An incident | Incidents → INC-015 | Severity, an action from six, a handover note, *Add this action to the log*, *Close this incident* | — complete | — |
| The vetting queue | Sidebar → *Vetting queue* | **The nurse's own 5-step application form**, headed "Step 1 of 5 · Your credential · SANC registration number" | There is no queue. An operator cannot see an application, verify a check, second a decision, decline or suspend. *More tools → Nurse onboarding & vetting* opens the same form in a modal titled "Vetting queue" | blocking |
| Quality | Sidebar → *Quality* → *Open Quality* | Not-drawn dialog | The section exists to open one dialog that says the workflow is not drawn | blocking |
| Employer programmes | Dispatch → *More tools* | A full screen — twelve-person floor, what an employer is and is not told | — complete | — |

## Partner (`/staff.html` → Partner)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| An order | Sign in as Partner → Orders | 2 prescriptions, 2 laboratory orders | — complete | — |
| Verify a prescription | Orders → RX-0081 | Both items tick to "2 of 2 items checked by the pharmacist" | — complete | — |
| Dispense and hand over | The same modal, after both ticks | Nothing further. The timeline still shows "Dispensed and sealed" and "Delivered to the patient" as unreached | No seal number, no handover, no way to move the order past the pharmacist check. The modal has no primary button at all | incomplete |
| Substitute | Substitution & repeats → *Read this to the patient* | The 22F wording appears, and only then does *Handed over* become enabled | — complete | — |
| Refuse a substitution | The same screen, Eltroxin 100 µg | "Prescriber only… there is no button here that overrides it. The route back is the prescriber" | — complete | — |
| Refuse an early repeat | Substitution & repeats → *Collect a repeat* | "The next is due in 13 days — and the question worth asking first is how the last month went" | — complete | — |
| Release laboratory results | Orders → LAB-0023 → *Release with an explanation* | State changes, *Withdraw the release* offered | — complete | — |
| Collections | Sidebar → *Collections* | **The Orders screen, verbatim** (`H1: Orders`, the same six controls) | No collections screen: no courier, no window, no handover, no signature | blocking |
| Results | Sidebar → *Results* | **The Orders screen, verbatim** | No results screen. Two of the partner's four nav entries have no screen of their own | blocking |

## Admin (`/admin.html`)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| Overview | Sign in as Operations console | Progress against the funding plan | — complete, read-only by design | — |
| Vetting queue | Vetting → Queue | 33 parties across 13 role types, each with checks passing and a renewal state | — complete | — |
| Suspend a party | Vetting → *Suspend* | A reason box, minimum ten characters, *Cancel* / *Suspend* — "A suspension without a written reason is not reviewable" | — complete | — |
| Decline, renew, record an appeal | Vetting → the row's own buttons | Present on every party, per state | — complete | — |
| Renewals due | Vetting → *Renewals due* | 32 checks sorted by expiry, 3 already lapsed | — complete | — |
| Decision audit | Vetting → *Decision audit* | 7 entries, filterable by 10 event types, each naming the reviewer and quoting the reason | — complete | — |
| Preview an application | Vetting → *Preview an application* | The applicant's own 5-step form, correctly labelled as a preview | — complete | — |
| Operations | Nav → Operations | The Control Tower dispatch board and incident list, assignable | — complete | — |
| Clinical | Nav → Clinical | 4 cases; a row opens the same *Clinical review* modal, signable | — complete (and carries the same five-outcome limits as the doctor app) | — |
| Catalogue | Nav → Catalogue | 15 services, price editable, nurse share and platform margin recalculated live | — complete | — |
| Growth | Nav → Growth | Subscriptions, screening packages, network and B2B | — complete, read-only | — |
| Finance | Nav → Finance | Unit economics, a model with two inputs, the round's allocation, 5 milestones each with *Mark met* / *Mark not met* | — complete | — |
| Compliance | Nav → Compliance | 9 controls, 5 designed and 4 not built, each saying which | — complete, read-only | — |

---

## The five gaps to close first

Ordered by how soon a funder or a nurse meets them.

**1. A booked visit cannot be cancelled, and only the next one can be opened.** This is the first
thing anybody does after booking, and it is where the demo breaks. `Pages.tsx:99` gates the nurse row
and the action bar on `i===0&&tab==='Upcoming'`, so of four visits on the list exactly one can be
touched. There is no cancel button anywhere in the patient app, although the Cancelled tab holds a
cancelled visit and promises "Visits you cancel appear here with the reason and any refund", and
*Reschedule* — the one action offered — opens a roadmap dialog. A person books a visit, opens it, and
finds a modal that says rescheduling will be connected later and offers them their Health Passport.
Everything needed is already built: the date-and-time picker in `Booking.tsx`, the cancellation
wording and the zero-rand refusal in `Interpreting.tsx`. This is one screen, reachable from every
row, with cancel and reschedule on it.

**2. Care plans, the wallet and the family profile — the three revenue screens — are all dialogs.**
Five care plans, priced from R99 to R699 a month, and *Explore plan* opens a roadmap dialog on every
one of them. There is no way to read what a plan includes, let alone join it. *Top up* and *Sponsor
care* do the same. A family member's card does the same. Subscriptions and sponsored care are the two
things the proposal asks a funder to believe in, and in the app they are five identical dialogs. A
plan detail screen and a top-up amount screen are small and would carry a demo a long way.

**3. Six nav entries across three workspaces have no screen behind them.** Whichever workspace a
funder opens, roughly half its navigation is empty. In the **partner** app, *Collections* and
*Results* both render the Orders screen verbatim — same `H1: Orders`, same six controls — so two of
four entries lead nowhere, and the courier handover and the results release the proposal describes
have no screen. In the **Control Tower**, *Vetting queue* renders the nurse's own application form
("Step 1 of 5 · Your credential"), so an operator sees a blank SANC field where the queue should be,
and *More tools → Nurse onboarding & vetting* opens the same form inside a modal titled "Vetting
queue"; *Quality* is a section whose only control opens a dialog saying the workflow is not drawn. In
the **doctor** app, *Protocols* is two links and both are not-drawn dialogs. The Control Tower's
queue already exists, fully built, at `admin.html` → Vetting: 33 parties, suspend with a written
reason, decline, renew, appeal, and a 7-entry decision audit. Part of this is routing, not building.

**4. The doctor's five outcomes all lead to the same screen, and none of them sends a case back.**
*Adjust medication and issue a prescription*, *Refer to a facility* and *Book a teleconsultation with
the patient* each sign a decision and then offer *Write this up as a consultation* — the same form,
every time. Prescribing is a text box; referral is a text box; no teleconsultation is booked, even
though the teleconsultation flow exists and is complete. In the patient file, *New consultation*,
*Prescription*, *Referral* and *Upload document* all resolve to "*X* would open here for Thando
Mokoena." And there is no sixth outcome: a doctor who needs more from the nurse has nowhere to send
the case. The clinical loop the product is named for — nurse finds, doctor decides, something
happens — currently stops at "decides".

**5. The emergency pathway has no door.** Thuso SOS is one of the most complete journeys in the
build: the ambulance numbers first, three routing questions that are explicitly not triage, four
refusal states each with what to do instead, a nurse asked by name, and four ways to stand down at no
cost. It is reachable only by opening *Explore MyThuso* and finding the fourteenth card. The word
"emergency" appears nowhere on the patient home screen, in the tab bar or in the sidebar. A screen
this good, for the moment it is built for, needs to be one press from wherever a frightened person
already is.

---

## What is complete

Sixty-one journeys run start to finish, and say honestly what is not connected at the end. They are
worth listing because most of this build is finished and nothing records that.

**Patient.** Sign-up, all six steps from language choice to consent, ending in the app. Account
recovery, all three routes, with a reference and an indicative wait. Browsing and searching the
catalogue. Booking a visit end to end, four steps, with the review blocked until the terms are
accepted and the confirmation naming the patient, service, date, time, address and payment method
that were actually chosen. Booking with a sign-language requirement on the account, which reaches
step 2 and holds the visit rather than dispatching it. Changing the interface language across eleven
written locales, each showing its review state. The interpreter hour — an unavailable slot holds the
visit, cancels at R0.00 and records the failure against MyThuso rather than the patient; an available
slot confirms with the interpreter named. Adding a family member. Inviting a guardian across four
steps, with the scope, the expiry and the identity check ahead of it. Revoking one. Sharing the
passport and revoking the share. Giving, declining and withdrawing consent, on a versioned wording
with its fingerprint and a re-consent prompt when the version moved. Reading the access log, with two
refused attempts written down beside four allowed ones. Requesting a correction and requesting
deletion. The health-trend cards and their table view. The laboratory order and the sample
prescription in the passport. Thuso SOS, from the ambulance numbers to the stand-down.

**Nurse.** The day. Opening a visit. The visit code, refused on `111111` with the instruction to call
the Control Tower and accepted on `482190`. Consent read aloud in two questions. Capturing seven
readings, each carrying exactly one provenance, with mean arterial pressure calculated from two of
them. Seven readings out of range, flagged with the indicative range named and carried into the
sign-off. Signing the assessment. Earnings, four weeks, every line, including a reversal and a
correction that each name their visit and reason. A payout the bank sent back, in those words.
Changing bank details behind a one-time code and a 48-hour wait that can be cancelled. Earnings seen
by a nurse whose police clearance lapsed — the banner changes and the money does not. The five-step
vetting application. Thuso Kit: pairing, the offline queue, sending, and interrupting a send.

**Doctor.** The review queue and its flagged filter. Opening a case and reading what the nurse found.
Signing a decision under a named HPCSA registration. Writing and signing a consultation record, in
three views of the same twelve fields, with the diagnosis field absent for a nurse rather than
offered and refused. The teleconsultation, five steps, including who is in the room, the refusal to
record, and the twelve sections marked written or not reached. The patient file, seen through eight
different parties' permissions, with Billing refused and protected categories withheld by name.

**Control Tower.** The dispatch board and its map. A waiting visit. The nurses near it, with
straight-line estimates labelled as straight lines and two nurses whose estimate is honestly absent.
Assigning. Being refused the assignment of a nurse whose clearance lapsed. An incident, from severity
through action to closure. Employer programmes.

**Partner.** The order list. Verifying both items on a prescription. Reading a substitution to the
patient before the handover box unlocks. Being refused a substitution on a narrow-therapeutic-index
medicine. Being refused an early repeat, with the date and the question to ask instead. Releasing
laboratory results with an explanation, and withdrawing that release.

**Admin.** All eight sections. The vetting queue across 33 parties and 13 role types. Suspending with
a written reason of at least ten characters. Declining, renewing and recording an appeal. Renewals
sorted by expiry with three already lapsed. The decision audit, filterable, quoting each reviewer.
The dispatch board and the clinical queue, both operable from the console. The catalogue with live
margin arithmetic. The funding model and its five milestone gates. The compliance checklist, saying
which controls are designed and which are not built.

---

## Two observations that are not journeys

**Every page load logs two console errors.** `GET /api/health` returns `500 Internal Server Error`
because the identity service is not running. Nothing in the interface depends on it and no user sees
it — the sign-in screens already say "Sign-in is not switched on yet" — but it is the first thing
anybody sees in a browser console during a demo.

**Thuso SOS marks both nurses as asked.** Pressing *Ask her to come* beside Sister Naledi Mokoena
changes both her button and Sister Refilwe Sithole's to *Asked*. `Sos.tsx` appears to hold one flag
rather than one per nurse.
