# Flow completeness

Where each journey starts, and where it stops.

Ninety-six journeys were walked with Playwright against the running web app, at commit `e21d172`, on
both the desktop and the mobile viewport. Nothing was inferred from source; every row was a screen
opened, a button pressed and a result read back.

**As it stands after the re-walk: eighty journeys complete, sixteen stop somewhere** — one
*blocking*, eight *incomplete*, seven *rough*. By application: patient 27 of 35, nurse 13 of 16,
doctor 10 of 13, Control Tower 9 of 10, partner 8 of 9, admin 13 of 13. It was 61 of 96 when this
file was written; nineteen rows closed and one was downgraded rather than closed.

**Re-walked on 9 September 2026 at commit `153c7c4`.** Sixteen commits landed between the two, four
of them ("Give the patient app depth", "Put the clinical estate on the glass", "Five patient screens
that had data but no way in", "Stop a nurse losing an assessment") specifically to close rows in this
file. Rows that changed are rewritten below and marked **✔ closed** with the date. Rows that were
re-walked and are *still* open say so. Rows that were **not** re-walked in this pass carry
*(not re-walked)*, because a row nobody checked and a row somebody checked and found unchanged are
not the same claim, and this file's only value is that the difference is visible.

That is the defect this document has: it is prose, and prose does not re-run. The part of it that
*can* run now does — see the next section.

---

## What is checked, and what is still prose

`tests/journeys.spec.ts` walks every navigation destination in all four applications — ten patient
sections, the four clinical workspaces' eighteen between them, the console's eight, and the landing
page's anchors — on both viewports, and fails when a destination **has no screen of its own**. That
is one class of defect out of the several this audit found, and it is the class that recurred: six
rows below were a name in a navigation with nothing behind it, and three of those were still open a
day after they were written down.

**What the spec holds, so these rows cannot silently come back:**

- A destination renders a screen rather than opening a dialog. A nav entry whose "screen" is a modal
  saying the workflow is not drawn is a name on a list.
- A destination is not the shell's own workflow-door placeholder.
- A destination draws a heading and some content. A dead link renders nothing.
- A destination is **its own** screen: no destination's `<h1>` is another destination's name, and no
  two destinations in one application render identical text. This is the assertion that would have
  failed on *Collections* and *Results* rendering the Orders screen verbatim, and on the Control
  Tower's *Vetting queue* rendering the nurse's application form.
- Every anchor in the landing page's navigation points at an id that exists.

**What the spec deliberately does not hold**, and what therefore stays prose in the rows below:

- **Whether an unconnected capability is a gap.** It is not. Fifteen capabilities are declared in
  `packages/catalog/capabilities.json` and none is connected, on purpose. A screen that completes and
  says plainly that nothing was dispatched, charged or sent is *finished*. Nothing in the spec reads a
  capability notice, and a spec that failed on one would be a spec arguing the product should
  overstate itself.
- **Whether a journey's next step is the right one.** Six of the doctor's seven outcomes now lead
  somewhere different; whether *referral* should produce a letter screen rather than a text box is a
  clinical judgement, not an assertion.
- **Severity.** "Blocking" versus "incomplete" versus "rough" is an opinion about what a funder or a
  nurse meets first. It is useful and it is not checkable.
- **Anything reached from inside a screen rather than from a navigation** — a card, a row, a modal's
  own next button. Several rows below are exactly that, and they are held by the journey specs named
  in them (`tests/patient-screens.spec.ts`, `tests/deep-journeys.spec.ts`, and the rest) or by
  nothing at all.

## What is counted as a stop, and what is not

`packages/catalog/capabilities.json` declares fifteen capabilities and none is connected. A screen
that completes and says plainly that nothing was dispatched, charged or sent is **finished**, and no
such screen is listed as a gap. "Your visit is booked… This does not book a visit. Nobody is
dispatched and nothing is charged" is a completed journey. "Nothing was submitted" at the end of the
five-step vetting application is a completed journey. So is the whole of Thuso SOS, which ends in a
nurse being asked and a stand-down offered, under an honest notice.

What is counted is a missing screen or a missing next step. There are three shapes of it, and they
are worth naming because they recur:

- **The roadmap dialog** — "*X* is included in the MyThuso feature roadmap. Its dedicated workflow
  will connect to the relevant clinical, operational or partner services in the functionality
  phase." One button: *Got it*. Rendered from `apps/web/src/App.tsx`.
- **The not-drawn dialog** — "*X* is in the roadmap and is not drawn yet. Nothing behind this name is
  connected to a nurse, a patient, a record, a payment or a device, and opening it changes nothing."
  From `apps/web/src/shells/StaffShell.tsx` and `AdminShell.tsx`.
- **The subjunctive stub** — "*New consultation* would open here for Thando Mokoena." From
  `apps/web/src/features/PatientFile.tsx`.

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
| Open a booked visit | My visits → *View details* | Modal *Your visit*: reference `VIS-0051`, when, where, patient, status, the nurse and her SANC registration, and what to have ready | — **✔ closed 9 Sept**: the row itself now carries *Reschedule*, *Cancel* and *View details*. Arrival state and messaging are `dispatch` and `messaging`, and the modal says so | — |
| Reschedule a visit | My visits → *Reschedule* | *Move this visit*: five dates, nine hours, the new window worked out, and "Moving a visit asks for a nurse who is free at the new hour" | — **✔ closed 9 Sept**: it reuses the booking picker, as the row asked | — |
| Cancel a visit | My visits → *Cancel*, on every row | A reason, the side of the cancellation window it falls on, and the visit in Cancelled carrying both | — **✔ closed 9 Sept**, and held by `tests/patient-screens.spec.ts` — "cancelling a visit records the reason and the side of the window it was on" | — |
| Open the 2nd or 3rd upcoming visit | My visits → Upcoming | All three rows carry *Reschedule*, *Cancel* and *View details* | — **✔ closed 9 Sept**. Only the first names a nurse, because only the first has one assigned | — |
| Open a past visit | My visits → Past | A visit summary: what was measured, what was in range, what the doctor said, and *Book this again* | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts` — the rebook opens the catalogue with the same patient chosen | — |
| Open a cancelled visit | My visits → Cancelled | The reason, the side of the window it fell on, and what cancelling did not undo | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts` | — |
| Health Passport, overview | Sidebar → *Health Passport* | Three trend cards, each with a working *Show readings as a table* | — complete | — |
| Health Passport, all trends | Passport → *See all* | Every reading drawn against the reference range the contract holds it to | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts`; the ranges come from `packages/catalog/records.json` | — |
| Health Passport, care timeline | Passport → any of the 3 timeline rows | Roadmap dialog ×3 | A visit on the timeline cannot be opened *(not re-walked)* | incomplete |
| Health Passport, care team | Passport → *Doctors* | Roadmap dialog | No care-team screen *(not re-walked)* | incomplete |
| Health Passport, documents | Passport → Records | *Laboratory results* opens a full order with chain of custody and results; *Visit summary* and *Medical certificate* still open "The production record will show the issuing clinician… *Close*" | **Re-walked 9 Sept and unchanged.** Two of the three documents have no screen | incomplete |
| Health Passport, medications | Passport → Medications | *See how a prescription reads* opens a full prescription; *Explore pharmacy fulfilment* opens a roadmap dialog | — the prescription itself is complete *(not re-walked)* | rough |
| Health Passport, devices | Passport → More | "No device is connected… We need your permission first", and one *Review permission* control | **Re-walked 9 Sept**: the section is rewritten and the permission control did not open a screen in this pass. Whether one exists behind it was not established | incomplete |
| Share my passport | Privacy & settings → *Who can see my records* | *Preview limited sharing* → "Demo access active" → *Revoke demo access* | — complete | — |
| Add a family member | My family → *Add a family member* | Name + relationship → *Add demo member* → the person is in the circle | — complete | — |
| Invite a guardian | My family → *Invite someone* | 4 steps (who, scope, duration, review) → *Send demo invitation* → row appears as "Verification pending" | — complete | — |
| Revoke a guardian | My family → *Revoke* | Row flips to "Revoked", the button disables | — complete | — |
| Open a family member's profile | My family → any member | Their visits, both directions of sharing, and a booking that carries the person through | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts`, including that a preselected patient does not outlive the journey that set it | — |
| Join a care plan | Sidebar → *Care plans* → a plan | Who it is for, the price, *What is in it*, and what joining would involve | — **✔ closed 9 Sept**: five plans, five screens. `tests/patient-surfaces.spec.ts` holds that no plan offers a call to action it cannot honour | — |
| Thuso Wallet, top up | Wallet → *Top up* | Three amounts, the balance it would become, and "Money in a wallet is money you have already handed over" | — **✔ closed 9 Sept** | — |
| Thuso Wallet, sponsor care | Wallet → *Sponsor care* | A screen of its own, added in the same pass as the top-up | — **✔ closed 9 Sept** by the same commit; *(the top-up was walked, this one was not walked separately)* | — |
| Change language | Sidebar foot → *Language: English* | 11 written languages, each with its review state, plus the SASL requirement → *Done* | — complete | — |
| Language & access, interpreter | Sidebar foot → *Language & access* | Ask for an hour: an unavailable slot holds the visit and offers a free cancellation recorded against MyThuso; Sunday 14:00 confirms with Karabo Mahlangu named | — complete | — |
| Consent given, withdrawn, re-versioned | Privacy → *My consents* | *Agree to version 2* → *Withdraw* → "Withdrawn. What is kept anyway is on the card, with the law that keeps it" | — complete, including the four optional consents | — |
| Access log | Privacy → *View access history* | 6 entries, 2 refused, each with its lawful basis and the reason for the refusal | — complete | — |
| Request a correction / deletion | Privacy → either row | Reason → *Preview request* → "Demo request recorded" | — complete | — |
| Contact the Information Officer | Privacy → *Information Officer* | "The Information Officer's verified contact details and request tracking will be configured before launch" | **Re-walked 9 Sept and unchanged.** No contact details, no request tracking. This one needs a person, not a screen | rough |
| Emergency pathway | Sidebar foot → *Emergency & urgent care* (and the home, and More) | Ambulance numbers → three questions → area, callback, rota, hours → *Ask her to come* → four stand-down reasons | — **✔ closed 9 Sept**: it is in the shell's chrome, quiet rather than red, because the screen it opens leads with 10177 | — |
| Explore MyThuso modules | Sidebar → *Explore MyThuso* | 22 cards: 5 open a working screen (Set up your account, Thuso Kit, Thuso Pass, Thuso Family, Thuso SOS), 1 an explainer (Thuso Doctor), **16 a roadmap dialog** | Two of the sixteen are labelled "Being built now" and their screens exist elsewhere: *Thuso Nurse* (the nurse workspace) and *Control Tower* (the operator workspace). Thuso SOS is no longer only reachable from here *(the card count was not re-walked)* | rough |

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
| The day after signing off | Back on Schedule | The visit still reads NEXT with *Start this visit* | A signed visit has no state on the day list. The same visit can be started again *(not re-walked)* | rough |
| Earnings | Sidebar → *Earnings & payouts* | *If you take a shift* — what a week is worth if she does — then four weeks, each expandable to every line; reversal and correction lines named; tax; the 75/25 split per service | — complete, and the forecast is new since the audit | — |
| A payout that failed | Earnings → week to 27 Aug | "Your bank sent it back. It is still owed to you and goes out again with the next run once the account is right" | — complete | — |
| Change bank details | Earnings → *Change account* | One-time code `240924` → *Verify and start the wait* → "Waiting 48 hours" → *Cancel the change* | — complete | — |
| Earnings while suspended | Earnings → *Sister Ayanda Dube* | "You will not be sent new visits… A lapsed check stops new visits reaching you. It does not touch money you have already earned" — figures unchanged | — complete | — |
| Vetting application | Sidebar → *Vetting* | 5 steps (credential, scope, 8 evidence items, 3 declarations, attestation) → *Submit application* → "Nothing was submitted" | — complete | — |
| Vetting, after applying | The same screen | There is no application state to return to — no "in progress", no reviewer, no outcome | An applicant cannot see where their application stands. Only the admin console holds that view *(not re-walked)* | incomplete |
| Thuso Kit | Sidebar → *Thuso Kit* | *Look for instruments* → 6 instruments to pair; connection off → on → *Send 3 entries* → *Interrupt the send*; six states counted | — complete | — |
| Locum shifts / Academy | Schedule → *More tools* | Not-drawn dialog, both | **Re-walked 9 Sept and unchanged.** Two workflows named on the nurse's own home screen with nothing behind them. They are secondary links rather than navigation, so `tests/journeys.spec.ts` does not hold them | rough |

## Doctor (`/staff.html` → Doctor)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The queue | Sign in as Doctor | 3 cases, *Everything* / *Flagged*, waiting times | — complete | — |
| Open a case | Queue → TH-2048 | *Clinical review*: signing doctor, readings with a trend, symptoms, the nurse's next step | — complete | — |
| What the nurse found | The same modal | Flagged systolic 146 with the change since 12 Aug, pulse, symptoms, "Refer for doctor review within 24 hours" | — complete | — |
| Decide and sign | Outcome + rationale → *Sign decision* | "Signed by Dr Ayanda Dlamini · HPCSA MP0483217" | — complete | — |
| Prescribe | Outcome *Adjust medication and issue a prescription* → *Sign decision* | *The prescription this decision produces* → *Open the prescription* → RX-0081, its items, the dispensing pharmacy and what the pharmacist is asked to check | — **✔ closed 9 Sept**. Seven outcomes now, each with its own continuation | — |
| Refer | Outcome *Refer to a facility* → *Sign decision* | *The referral letter this decision produces*, and what the receiving clinician does and does not get | *Write the referral letter* is the one continuation with no screen behind it. The outcome is no longer a shared next step, but the letter is still unbuilt | incomplete |
| Book a teleconsultation from a decision | Outcome *Book a teleconsultation with the patient* | *Open the teleconsultation* → the five-step call, on the same six-digit visit code the nurse asks for at the door | — **✔ closed 9 Sept** | — |
| Return a case to the nurse | Outcome *Return it to the nurse with a question* | "The case goes back to the nurse who submitted it rather than forward to anybody else. It stays in the queue, marked returned" | — **✔ closed 9 Sept**: the sixth and seventh outcomes are a return and a chronic repeat. *Write the question* has no screen behind it yet | rough |
| Write and sign a consultation | Sidebar → *Consultation records* | 8 fields for a nurse (12 for a doctor), SOAP / long-form / prose views, *Sign consultation* → "Consultation signed", everything disabled | — complete, including the fields a nurse is never granted | — |
| Teleconsultation | Sidebar → *Teleconsultation* | 5 steps (who is in the room, both ends checked, recording refused, the call, the decision) → "Consultation completed", with the twelve sections marked written or not reached | — complete | — |
| Patient file | Sidebar → *Patient context* | 8 tabs, a viewer switcher across 8 parties, Billing marked refused, protected categories withheld by name | — complete | — |
| Patient file actions | Patient file → *New consultation* / *Prescription* / *Referral* | "*X* would open here for Thando Mokoena", written into a live region rather than a dialog | **Re-walked 9 Sept and unchanged.** Three stubs for this viewer; *Upload document* is refused rather than offered, as *Book a visit* already was. Reached from a card rather than a navigation, so the spec does not hold it | incomplete |
| Protocols | Sidebar → *Protocols* | A screen: the indicative adult reference ranges, and where decision support stops and a registered doctor starts | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts`. The ranges are read from `packages/catalog/records.json`, so the protocol cannot disagree with the software | — |

## Control Tower (`/staff.html` → Control Tower)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The board | Sign in as Control Tower | Dispatch: map drawn from coordinates, 3 visits awaiting a nurse, 24 active, 3 incidents | — complete | — |
| A waiting visit | Dispatch → TH-2049 / TH-2051 / TH-2052 | Service, area, window, priority, status | — complete | — |
| Who is near | The nurse list | 5 nurses, straight-line estimates labelled as such, two with no estimate and the reason for each | — complete | — |
| Assign | *Assign* beside Sister Palesa Khumalo | Button becomes *Assigned*, the visit reads "Assigned to Sister Palesa Khumalo", the map pin changes | — complete | — |
| Assign a nurse whose clearance lapsed | *Cannot be assigned* beside Sister Ayanda Dube | Disabled, with the refusal sentence and "The Control Tower has no override for a lapsed clearance" | — complete | — |
| Unassign or reassign | After assigning | The button reads *Assigned* and there is no way back | **Re-walked 9 Sept, half closed.** The header counts down correctly now — "2 visits awaiting a nurse" after assigning one of three — but there is still no unassign and no reassign | rough |
| An incident | Incidents → INC-015 | Severity, an action from six, a handover note, *Add this action to the log*, *Close this incident* | — complete | — |
| The vetting queue | Sidebar → *Vetting queue* | A queue: every applicant, the state of each check, and the decision each is waiting on | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` — this is precisely the "renders another section's screen" assertion | — |
| Quality | Sidebar → *Quality* | A screen: arrival against the booked window, complaints, and what each moves | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` | — |
| Employer programmes | Dispatch → *More tools* | A full screen — twelve-person floor, what an employer is and is not told | — complete | — |

## Partner (`/staff.html` → Partner)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| An order | Sign in as Partner → Orders | 2 prescriptions, 2 laboratory orders | — complete | — |
| Verify a prescription | Orders → RX-0081 | Both items tick to "2 of 2 items checked by the pharmacist" | — complete | — |
| Dispense and hand over | The same modal, after both ticks | *Dispense and seal* is now the modal's primary button | **Re-walked 9 Sept, partly closed.** The button the audit said did not exist is there; what it leads to was not walked in this pass | incomplete |
| Substitute | Substitution & repeats → *Read this to the patient* | The 22F wording appears, and only then does *Handed over* become enabled | — complete | — |
| Refuse a substitution | The same screen, Eltroxin 100 µg | "Prescriber only… there is no button here that overrides it. The route back is the prescriber" | — complete | — |
| Refuse an early repeat | Substitution & repeats → *Collect a repeat* | "The next is due in 13 days — and the question worth asking first is how the last month went" | — complete | — |
| Release laboratory results | Orders → LAB-0023 → *Release with an explanation* | State changes, *Withdraw the release* offered | — complete | — |
| Collections | Sidebar → *Collections* | Its own screen: what is booked today, which are outside their window, and that nothing on the board can extend one | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` | — |
| Results | Sidebar → *Results* | Its own screen: what has been produced, what is verified and waiting on a clinician, and that release is a deliberate clinical act | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` | — |

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

## What is left, after the re-walk

Four of the five gaps this file opened with are closed. They are kept here, struck through in
substance rather than deleted, because the point of an audit is that somebody can see what happened
to what it said.

**1. ~~A booked visit cannot be cancelled, and only the next one can be opened.~~ Closed.** Every
row on the visit list carries *Reschedule*, *Cancel* and *View details*; reschedule reuses the
booking picker as the row asked it to; cancelling records a reason and which side of the
cancellation window it fell on, and the visit appears in Cancelled carrying both. The past visit and
the cancelled visit both open. `tests/patient-screens.spec.ts` holds all of it.

**2. ~~Care plans, the wallet and the family profile — the three revenue screens — are all
dialogs.~~ Closed.** Five plans, five screens, each saying who it is for, what is in it and what
joining would involve. The wallet's top-up walks to an amount and a resulting balance. A family
member's profile shows their visits, both directions of sharing, and books for them.

**3. ~~Six nav entries across three workspaces have no screen behind them.~~ Closed, and now
checked.** *Collections* and *Results* are their own screens. The Control Tower's *Vetting queue* is
a queue and *Quality* is a board. The doctor's *Protocols* is a screen that reads its reference
ranges out of `packages/catalog/records.json`, so the protocol cannot disagree with the software.
This is the one of the five that a spec can hold, and `tests/journeys.spec.ts` now holds it: the same
defect cannot return without failing the build.

**4. ~~The doctor's five outcomes all lead to the same screen, and none of them sends a case back.~~
Mostly closed.** There are seven outcomes now, each with a continuation of its own: a prescription
that opens RX-0081, a chronic repeat that opens the pharmacist's screen, a laboratory order, a
teleconsultation on the same six-digit visit code the nurse asks for at the door, a review in a
month, a referral, and a return to the nurse with a question. **Two of the seven still end at a
sentence**: *Write the referral letter* and *Write the question* have no screen behind them. And in
the patient file, *New consultation*, *Prescription* and *Referral* are still the subjunctive stub.

**5. ~~The emergency pathway has no door.~~ Closed.** *Emergency & urgent care* is in the patient
shell's sidebar, on the home and in More. It is a quiet row rather than a red button, deliberately:
the screen it opens leads with 10177 and says in its first line that MyThuso is not an ambulance
service, and a shouting control would contradict that before anybody had read it.

### The one blocking row that is left

**"Not sure what you need? Chat to our care team", at the foot of the booking catalogue, opens the
four-step booking modal for *Vitals & chronic check*.** There is no care-team chat, and the control
routes to an unrelated booking rather than saying so. Re-walked on 9 September and unchanged. It is
the only *blocking* row in the file, and it is a small one: either a screen that says what the care
team is and is not, or the control should not be there.

### And the fifteen that are not blocking

Six are in the Health Passport — the care timeline, the care team, two of the three documents, the
device permission screens and the pharmacy half of medications. Three are a workflow named on a
screen with nothing behind it: *Locum shifts*, *Academy*, and sixteen of the twenty-two Explore
MyThuso cards. Three are a state that does not exist rather than a screen that does not: a signed
visit has no state on the nurse's day list, an applicant cannot see where their application stands,
and an assigned visit cannot be unassigned. Two are the doctor's remaining stubs. One is the
partner's handover past *Dispense and seal*.

None of the sixteen is reached from a navigation, which is why `tests/journeys.spec.ts` does not hold
any of them. That is the honest limit of the spec, and it is worth saying plainly: it holds the
skeleton, not the flesh.

---

## What is complete

Eighty journeys run start to finish, and say honestly what is not connected at the end. They are
worth listing because most of this build is finished and nothing records that. The nineteen that
closed since this file was written are named in their rows above; what follows is the sixty-one that
already ran, with the new ones folded in where they belong.

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
deletion. The health-trend cards and their table view, and the trends screen behind them, drawn
against the reference ranges the record contract holds. The laboratory order and the sample
prescription in the passport. Thuso SOS, from the ambulance numbers to the stand-down, reached from
the sidebar rather than from fourteen cards inside a roadmap page. And, since the audit: opening,
rescheduling and cancelling a booked visit from any row on the list; opening a past visit and
rebooking it; opening a cancelled one and reading why; a family member's profile; five care plans,
each priced and described; the wallet's top-up and sponsorship.

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
anybody sees in a browser console during a demo. **Re-walked 9 September and unchanged**: still two,
still on every load.

**~~Thuso SOS marks both nurses as asked.~~ Fixed.** `Sos.tsx` holds which nurse was asked rather
than that somebody was, and the other nurse's button reads "Somebody else was asked". The comment
above it says why a boolean was wrong there: on a screen whose whole question is *who* is coming, a
flag that marks every cleared nurse on the rota answers it wrongly for all of them.
