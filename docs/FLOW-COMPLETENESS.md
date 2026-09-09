# Flow completeness

Where each journey starts, and where it stops.

Ninety-six journeys were walked with Playwright against the running web app, at commit `e21d172`, on
both the desktop and the mobile viewport. Nothing was inferred from source; every row was a screen
opened, a button pressed and a result read back.

**As it stands after the third walk: ninety-six journeys complete, none stops at a dead end.** By
application: patient 35 of 35, nurse 16 of 16, doctor 13 of 13, Control Tower 10 of 10, partner 9 of
9, admin 13 of 13. It was 61 of 96 when this file was written and 80 of 96 after the second walk.

**Re-walked on 9 September 2026 at commit `2105f09`,** and the sixteen rows that were still open
were worked through one at a time. Two of them turned out to have been closed already by commits
that landed after the second walk — *Write the referral letter* and *Write the question* both had
full screens behind them while the rows still said they had not — which is this document's own
defect demonstrated on itself, and the reason the next section exists.

Rows that changed in this pass are rewritten below and marked **✔ closed 9 Sept (third walk)**.
Where a row was judged not to be a dead end rather than built out, it says so and says why: two of
the sixteen were about a description being the honest answer, and one needed a person rather than a
screen. Nothing in this file is marked closed on the strength of reading the source. Every row was
opened in a browser at 1440×1100 and at 390×844.

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

### And `tests/flow-closures.spec.ts`, which holds the other class

The rows this file kept open were almost never a navigation entry. They were something reached from
*inside* a screen — a card, a document row, a button on a queue, the control at the foot of the
catalogue — which no navigation walk can see. That is why two of them were stale: nothing was
watching them.

`tests/flow-closures.spec.ts` walks eleven of those journeys on both viewports and asserts the
continuation rather than the existence of a screen:

- The catalogue's *Not sure what you need?* opens the help screen and **not a booking dialog**, and
  the emergency route leads the three it offers.
- A timeline entry opens on the readings it recorded, against the ranges `packages/catalog/records.json`
  holds them to, and the doctor's review opens separately from the visit that produced it.
- The care team names both clinicians under the registrations the vetting register holds, and quotes
  the vetting contract's own refusal about a protected category.
- Both of the passport documents that had no screen open, and the certificate says there is none.
- The device tab has **no** *Review permission* button — the assertion is written as an absence,
  because the control it replaced appeared to grant a permission and opened nothing.
- The medications tab reaches the dispensing contract's five handover steps rather than the roadmap.
- The patient file's four actions each open a screen **about the patient the file is on**, which is
  the assertion that stops somebody routing *Prescription* to RX-0081 and showing one patient's
  medicines under another's name.
- A signed visit carries a signed state on the nurse's day, the card stops offering to start it, and
  the strip above the day agrees with the list below it.
- *Locum shifts* and *Academy* are not the not-drawn dialog, and each carries the refusal that is the
  point of it.
- An applicant reaches the state of their own checks after applying.
- A prescription's state chip moves through *Awaiting pharmacist → Checked → Sealed → Handed over*.

**What is still prose after that:** severity, whether a continuation is the *right* one, and the two
rows below that were judged not to be dead ends rather than built out. Those three are judgements,
and a spec that asserted them would be asserting an opinion.

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
| "Not sure what you need?" | Booking catalogue, foot | *Help & support*: the `messaging` notice, what a care team would do, and the three things that exist — the emergency pathway, the catalogue and the interpreter request | — **✔ closed 9 Sept (third walk)**. It is a screen and not a chat, because there is no care-team chat and `messaging` is not connected. `features/Help.tsx`, held by `tests/flow-closures.spec.ts` including that it does **not** open a booking | — |
| Open a booked visit | My visits → *View details* | Modal *Your visit*: reference `VIS-0051`, when, where, patient, status, the nurse and her SANC registration, and what to have ready | — **✔ closed 9 Sept**: the row itself now carries *Reschedule*, *Cancel* and *View details*. Arrival state and messaging are `dispatch` and `messaging`, and the modal says so | — |
| Reschedule a visit | My visits → *Reschedule* | *Move this visit*: five dates, nine hours, the new window worked out, and "Moving a visit asks for a nurse who is free at the new hour" | — **✔ closed 9 Sept**: it reuses the booking picker, as the row asked | — |
| Cancel a visit | My visits → *Cancel*, on every row | A reason, the side of the cancellation window it falls on, and the visit in Cancelled carrying both | — **✔ closed 9 Sept**, and held by `tests/patient-screens.spec.ts` — "cancelling a visit records the reason and the side of the window it was on" | — |
| Open the 2nd or 3rd upcoming visit | My visits → Upcoming | All three rows carry *Reschedule*, *Cancel* and *View details* | — **✔ closed 9 Sept**. Only the first names a nurse, because only the first has one assigned | — |
| Open a past visit | My visits → Past | A visit summary: what was measured, what was in range, what the doctor said, and *Book this again* | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts` — the rebook opens the catalogue with the same patient chosen | — |
| Open a cancelled visit | My visits → Cancelled | The reason, the side of the window it fell on, and what cancelling did not undo | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts` | — |
| Health Passport, overview | Sidebar → *Health Passport* | Three trend cards, each with a working *Show readings as a table* | — complete | — |
| Health Passport, all trends | Passport → *See all* | Every reading drawn against the reference range the contract holds it to | — **✔ closed 9 Sept**, held by `tests/patient-screens.spec.ts`; the ranges come from `packages/catalog/records.json` | — |
| Health Passport, care timeline | Passport → any timeline row, or *See all* | *Everything on your record*: eight entries — four visits, a doctor review and three documents — each opening on what it produced. A visit opens its readings against the range the contract holds each to | — **✔ closed 9 Sept (third walk)**. Three visits in the record have readings and nothing else, and the screen says so rather than offering a door on one row and not another | — |
| Health Passport, care team | Passport → *Doctors* | *Who has been in your record*: both clinicians with their registrations and what each did, then the three things being on the list does not mean — the vetting contract's own refusals — and the door to the access log | — **✔ closed 9 Sept (third walk)**. The screen is drawn from the `care-team` record type in `packages/catalog/records.json` | — |
| Health Passport, documents | Passport → Records | All three open. *Laboratory results* is the full order; *Visit summary* is the completed visit the app already had and had no door to from here; *Medical certificate* says what one would carry, who may sign it and that this preview holds none | — **✔ closed 9 Sept (third walk)**. The certificate is the one document in the passport with no record type behind it anywhere, and its screen says that rather than drawing one | — |
| Health Passport, medications | Passport → Medications | *See how a prescription reads* opens the prescription; *What happens after a doctor signs one* opens *What happens to a prescription* — the repeat arithmetic, the five handover steps, and what a patient is told and may refuse | — **✔ closed 9 Sept (third walk)**. Every sentence is `packages/catalog/dispensing.json`'s, read from the side of the person the medicine is for | — |
| Health Passport, devices | Passport → More | The `devices` notice, the denied state stated, and the three permission screens under it rather than behind it — each saying what would be read and what never would | — **✔ closed 9 Sept (third walk)**. *Review permission* is gone: it flipped this screen's own state to ready and opened nothing, which is the one thing a permission control must never appear to do. The absence is asserted | — |
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
| Contact the Information Officer | Privacy → *Information Officer* | *Your privacy contact*: the four things you would ask an Information Officer for, each opening the screen this app already has for it — the access log, a correction, a deletion, a consent to withdraw — then what is missing and why | — **✔ closed 9 Sept (third walk)** as a journey. The row was right that it needs a person: no name, no verified contact details and no request tracking exist, and the screen says all three rather than promising them "before launch". What was wrong was that the four doors it should have been were the one row on that screen leading nowhere | — |
| Emergency pathway | Sidebar foot → *Emergency & urgent care* (and the home, and More) | Ambulance numbers → three questions → area, callback, rota, hours → *Ask her to come* → four stand-down reasons | — **✔ closed 9 Sept**: it is in the shell's chrome, quiet rather than red, because the screen it opens leads with 10177 | — |
| Explore MyThuso modules | Sidebar → *Explore MyThuso* | 22 cards: 5 open a working screen, 1 an explainer, 16 a description of the module with its phase | — **not a dead end, and not built out.** A module in the plan *is* a description; a screen pretending otherwise would be the defect. What was wrong was the dialog itself and is fixed: it carried the **sign-in** capability's notice on all sixteen — the wrong sentence, on the screens where the right one is the paragraph underneath — and the description ran into the next sentence without a full stop ("Apple Health and Health Connect It is a module"). Both gone | — |

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
| The day after signing off | Back on Schedule | The card reads SIGNED, steps down to the recessed ground, carries the seal time and who signed, and offers *Open what this produced* instead of *Start this visit*. The day line and the strip above both read "1 signed, 2 to go" | — **✔ closed 9 Sept (third walk)**. The state is derived from the visit queue's own sign-off part rather than from a flag this screen sets, so the schedule and the queue cannot disagree | — |
| Earnings | Sidebar → *Earnings & payouts* | *If you take a shift* — what a week is worth if she does — then four weeks, each expandable to every line; reversal and correction lines named; tax; the 75/25 split per service | — complete, and the forecast is new since the audit | — |
| A payout that failed | Earnings → week to 27 Aug | "Your bank sent it back. It is still owed to you and goes out again with the next run once the account is right" | — complete | — |
| Change bank details | Earnings → *Change account* | One-time code `240924` → *Verify and start the wait* → "Waiting 48 hours" → *Cancel the change* | — complete | — |
| Earnings while suspended | Earnings → *Sister Ayanda Dube* | "You will not be sent new visits… A lapsed check stops new visits reaching you. It does not touch money you have already earned" — figures unchanged | — complete | — |
| Vetting application | Sidebar → *Vetting* | 5 steps (credential, scope, 8 evidence items, 3 declarations, attestation) → *Submit application* → "Nothing was submitted" | — complete | — |
| Vetting, after applying | The same screen | *Where this application stands*, under "Nothing was submitted": the applicant's own eight checks, the state of each, its issuing authority, its renewal, and which are decided by two reviewers rather than one | — **✔ closed 9 Sept (third walk)**. It reads the same `lib/vetting` summary the Control Tower's queue reads, so the applicant's view and the reviewer's view cannot say different things about one check. Nothing on it can be changed from there, and it says so | — |
| Thuso Kit | Sidebar → *Thuso Kit* | *Look for instruments* → 6 instruments to pair; connection off → on → *Send 3 entries* → *Interrupt the send*; six states counted | — complete | — |
| Locum shifts / Academy | Schedule → *More tools* | Two screens: what the module is and when the plan says it arrives, what it would be for, and the one thing it will not do — a locum is its own vetted role with its own six checks and its own refusal, and no MyThuso course is ever one of a nurse's eight checks | — **✔ closed 9 Sept (third walk)**. Neither is a workflow and neither pretends to be. Held by `tests/flow-closures.spec.ts`, which asserts the not-drawn placeholder is absent | — |

## Doctor (`/staff.html` → Doctor)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The queue | Sign in as Doctor | 3 cases, *Everything* / *Flagged*, waiting times | — complete | — |
| Open a case | Queue → TH-2048 | *Clinical review*: signing doctor, readings with a trend, symptoms, the nurse's next step | — complete | — |
| What the nurse found | The same modal | Flagged systolic 146 with the change since 12 Aug, pulse, symptoms, "Refer for doctor review within 24 hours" | — complete | — |
| Decide and sign | Outcome + rationale → *Sign decision* | "Signed by Dr Ayanda Dlamini · HPCSA MP0483217" | — complete | — |
| Prescribe | Outcome *Adjust medication and issue a prescription* → *Sign decision* | *The prescription this decision produces* → *Open the prescription* → RX-0081, its items, the dispensing pharmacy and what the pharmacist is asked to check | — **✔ closed 9 Sept**. Seven outcomes now, each with its own continuation | — |
| Refer | Outcome *Refer to a facility* → *Sign decision* → *Write the referral letter* | The letter: a unit type rather than a named facility, an urgency, what the receiving clinician needs to know, the readings enclosed, and both registrations — then "Nothing was transmitted", with all three of the reasons | — **the row was stale.** Walked on 9 Sept and the screen was already there; a commit after the second walk had built it and nobody rewrote the row. That is what `tests/flow-closures.spec.ts` exists to stop | — |
| Book a teleconsultation from a decision | Outcome *Book a teleconsultation with the patient* | *Open the teleconsultation* → the five-step call, on the same six-digit visit code the nurse asks for at the door | — **✔ closed 9 Sept** | — |
| Return a case to the nurse | Outcome *Return it to the nurse with a question* → *Write the question* | Five questions to choose from, a free note, and "A returned case stays in the queue and keeps its waiting time. It is not sent to the back of the line, and nothing here marks it as the nurse's fault" | — **the row was stale**, in the same way and for the same reason as the referral above. Walked on 9 Sept and complete | — |
| Write and sign a consultation | Sidebar → *Consultation records* | 8 fields for a nurse (12 for a doctor), SOAP / long-form / prose views, *Sign consultation* → "Consultation signed", everything disabled | — complete, including the fields a nurse is never granted | — |
| Teleconsultation | Sidebar → *Teleconsultation* | 5 steps (who is in the room, both ends checked, recording refused, the call, the decision) → "Consultation completed", with the twelve sections marked written or not reached | — complete | — |
| Patient file | Sidebar → *Patient context* | 8 tabs, a viewer switcher across 8 parties, Billing marked refused, protected categories withheld by name | — complete | — |
| Patient file actions | Patient file → any of the five | *New consultation* opens the composer for this patient, *Referral* the referral letter for this patient, *Upload document* what would be recorded around one and that nothing is stored, *Prescription* the reason a file cannot issue one, and *Book a visit* stays refused because a doctor does not hold `dispatch-nurses` | — **✔ closed 9 Sept (third walk)**. The patient travels with the action: routing *Prescription* to RX-0081 would have shown Lerato Molefe's medicines under Thando Mokoena's name, which is a worse defect than the stub. `tests/flow-closures.spec.ts` asserts the patient's name on each | — |
| Protocols | Sidebar → *Protocols* | A screen: the indicative adult reference ranges, and where decision support stops and a registered doctor starts | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts`. The ranges are read from `packages/catalog/records.json`, so the protocol cannot disagree with the software | — |

## Control Tower (`/staff.html` → Control Tower)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| The board | Sign in as Control Tower | Dispatch: map drawn from coordinates, 3 visits awaiting a nurse, 24 active, 3 incidents | — complete | — |
| A waiting visit | Dispatch → TH-2049 / TH-2051 / TH-2052 | Service, area, window, priority, status | — complete | — |
| Who is near | The nurse list | 5 nurses, straight-line estimates labelled as such, two with no estimate and the reason for each | — complete | — |
| Assign | *Assign* beside Sister Palesa Khumalo | Button becomes *Assigned*, the visit reads "Assigned to Sister Palesa Khumalo", the map pin changes | — complete | — |
| Assign a nurse whose clearance lapsed | *Cannot be assigned* beside Sister Ayanda Dube | Disabled, with the refusal sentence and "The Control Tower has no override for a lapsed clearance" | — complete | — |
| Unassign or reassign | After assigning | The assigned nurse's control reads *Unassign*, every other cleared nurse's reads *Assign instead*, the status line carries the tick, and the Sent list at the foot carries *Recall* | — **✔ closed 9 Sept (third walk)**. Both were already possible: the button labelled *Assigned* un-assigned when pressed and *Recall* was at the foot of the screen. A state label with an action hidden inside it is why an audit could walk this board and conclude there was no way back. The state is the tick now and the button is the verb | — |
| An incident | Incidents → INC-015 | Severity, an action from six, a handover note, *Add this action to the log*, *Close this incident* | — complete | — |
| The vetting queue | Sidebar → *Vetting queue* | A queue: every applicant, the state of each check, and the decision each is waiting on | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` — this is precisely the "renders another section's screen" assertion | — |
| Quality | Sidebar → *Quality* | A screen: arrival against the booked window, complaints, and what each moves | — **✔ closed 9 Sept**, and now held by `tests/journeys.spec.ts` | — |
| Employer programmes | Dispatch → *More tools* | A full screen — twelve-person floor, what an employer is and is not told | — complete | — |

## Partner (`/staff.html` → Partner)

| Journey | Starts at | Stops at | What is missing | Severity |
|---|---|---|---|---|
| An order | Sign in as Partner → Orders | 2 prescriptions, 2 laboratory orders | — complete | — |
| Verify a prescription | Orders → RX-0081 | Both items tick to "2 of 2 items checked by the pharmacist" | — complete | — |
| Dispense and hand over | The same modal, after both ticks | *Dispense and seal* → the seal number → a handover of three → "This script is finished", attributed to the pharmacy, with the repeats left against it | — **✔ closed 9 Sept (third walk)**. The whole journey was built; the defect was the state chip, which read "Awaiting pharmacist" through all of it — the one element whose entire job is to say where the script has got to was the one that never moved. It now reads Awaiting pharmacist → Checked → Sealed → Handed over, and `tests/flow-closures.spec.ts` walks all four | — |
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

## What was left, and what happened to it

The five gaps this file opened with are closed. They are kept here, struck through in substance
rather than deleted, because the point of an audit is that somebody can see what happened to what
it said.

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
Closed.** There are seven outcomes now, each with a continuation of its own: a prescription that
opens RX-0081, a chronic repeat that opens the pharmacist's screen, a laboratory order, a
teleconsultation on the same six-digit visit code the nurse asks for at the door, a review in a
month, a referral that writes a letter, and a return to the nurse with a question. The last two were
recorded here as unbuilt until the third walk found both of them finished — see below.

**5. ~~The emergency pathway has no door.~~ Closed.** *Emergency & urgent care* is in the patient
shell's sidebar, on the home and in More. It is a quiet row rather than a red button, deliberately:
the screen it opens leads with 10177 and says in its first line that MyThuso is not an ambulance
service, and a shouting control would contradict that before anybody had read it.

### The blocking row

**~~"Not sure what you need? Chat to our care team", at the foot of the booking catalogue, opens the
four-step booking modal for *Vitals & chronic check*.~~ Closed on 9 September.** It was the only
*blocking* row in the file and the reason it deserved that word is worth writing down: a person who
had just said they did not know what to book was silently handed a booking. Not a wrong screen — a
wrong answer, given confidently, to a health question, on behalf of somebody who had asked for help.

It is not a chat. There is no care-team chat and `messaging` is not connected, so a chat window with
a fictional agent in it would have been the same defect wearing a better costume. It is a screen
that says what a care team would actually do, renders the contract's own sentence about why nothing
is sent, and hands over to the three things that exist: the emergency pathway first, then the
catalogue, then the interpreter request. Its lead is the true and useful part — a nurse assesses
what she finds at the door rather than what was written on the booking, and the visit can be moved
or stood down inside the window `packages/catalog/cancellation.json` declares. All three figures on
it are derived.

The same screen replaced the sidebar's *Let's talk* card and the footer's help link, both of which
opened a dialog with a search box and a sentence — "Live support and emergency dispatch are not
connected in this design preview" — that was typed rather than read from a contract.

### The fifteen that were not blocking

**Twelve were built out.** Six in the Health Passport: the care timeline, the care team, the two
documents that had no screen, the device permission screens and the pharmacy half of medications.
Two on the nurse's home: *Locum shifts* and *Academy*. Three states that did not exist rather than
screens that did not: a signed visit on the nurse's day, an applicant's view of their own checks,
and an unassign a controller could find. One was the patient file's four subjunctive stubs.

**Two were already closed and the rows were stale.** *Write the referral letter* and *Write the
question* both had full screens behind them, built by commits that landed after the second walk. A
document that says a thing is missing when it is not is worse than one that says nothing, because
somebody will build it twice. `tests/flow-closures.spec.ts` is the answer to that, and it is why
this pass wrote a spec rather than only rows.

**One was not a dead end.** Sixteen of the twenty-two Explore MyThuso cards open a description of a
module and its phase, and that is the honest answer — a module in the plan is a description, and a
screen pretending otherwise is the defect this whole file is about. What was wrong with it was the
dialog, and that is fixed: it carried the sign-in capability's notice on all sixteen, and the
description ran into the next sentence without a full stop.

**And one needed a person, which it still does.** The Information Officer row was right that no
screen can appoint one. It was wrong that there was nothing to build: four of the five things a
person would contact an Information Officer about have working screens in this app already, and the
row that should have been the door to all four was the one row on the privacy screen that opened
nothing. It is those four doors now, plus what is missing — a name, verified contact details and
request tracking — said as what it is rather than promised "before launch".

### What still cannot be checked

Severity is an opinion. Whether a continuation is the *right* one is a clinical judgement. And
neither spec reads a capability notice, on purpose: a screen that finishes by saying nothing was
dispatched, charged or sent is finished, and a test that failed on one would be a test arguing this
product should overstate itself.

---

## What is complete

All ninety-six run start to finish, and say honestly what is not connected at the end. They are
worth listing because most of this build is finished and nothing records that. The thirty-five that
closed since this file was written are named in their rows above; what follows is the sixty-one that
already ran on the first walk, with the new ones folded in where they belong.

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
anybody sees in a browser console during a demo. **Re-walked 9 September on the third walk and
unchanged**: still two, still on every load.

**Navigating from the foot of a long screen landed you part-way down the next one.** All three
shells called `window.scrollTo({ top: 0 })` on every navigation and none of them ever moved
anything: the document does not scroll here — the shell is a fixed-height grid and `main` is the
scroll container — so the call was a no-op that looked like a fix. Measured at 390px, pressing the
control at the foot of the booking catalogue left the next screen 1490px down, which on that
viewport is most of two screens. `apps/web/src/lib/scroll.ts` resets both, and it is the reason this
walk noticed: the first screenshot of the new help screen was of its own footer.

**The highlights carousel could be stopped by a fingertip and never restarted.** It pauses on hover,
which is right for a pointer that can hover and meaningless for a touch screen — where the
`mouseenter` a browser synthesises under a finger is a pause nothing ever undoes. Tap where the
banner happens to be and it stopped rotating for the rest of the session, on exactly the handsets
this product is for. The hover pause is now behind `matchMedia('(hover: hover)')`; the pause button
and the focus pause, which are what WCAG 2.2.2 actually needs, are untouched.

**~~Thuso SOS marks both nurses as asked.~~ Fixed.** `Sos.tsx` holds which nurse was asked rather
than that somebody was, and the other nurse's button reads "Somebody else was asked". The comment
above it says why a boolean was wrong there: on a screen whose whole question is *who* is coming, a
flag that marks every cleared nurse on the rota answers it wrongly for all of them.
