# The case pathway — demonstration script

> **A preview, on synthetic data, under a draft pathway.** Nothing in this script is a real service: no
> case reaches a nurse, no reading reaches a record, no plan reaches a patient, and the pathway that
> suggests where the patient is seen is `headache-raised-blood-pressure-pathway@1`, registered in
> `packages/catalog/protocols.json` as a **draft** the clinical governance board has not ratified. It
> suggests; a nurse decides where the patient is seen; a doctor decides what it is. **It is not triage.**

The founder's ask of 28 and 29 September 2026: *"when I demo the system I can show how it will respond,
escalate to treatment. Maybe we can choose one thing like headache and we link it to a high blood pressure
which then gets escalated to a nurse and then the doctor … GilbertOne … able to pull all data from a patient
for ease of the nurse … determine a case if it will need online or physical treatment."*

Everything below is one tab, one session: the case lives in the tab's memory and a page reload forgets it.
Switch roles with the demo login at the top of the page (**Nurse**, **Doctor**, **Patient**), never with
the address bar. `tests/case-pathway.spec.ts` walks exactly this script on both viewports.

## 1. The patient — GilbertOne gathers

1. Open `/app/?open=assistant`, accept the consent gate.
2. Type **I have a headache**. GilbertOne offers the headache notes — never the waiting dots — and says
   what it will not do. Press **Yes, take notes**.
3. Answer the fifteen questions, one per turn. The five common ones first, then the ten derived from the
   knowledge base (`packages/catalog/symptom-intake.json`, headache group, `questionsFrom`):

   | Question | Answer for the demo |
   |---|---|
   | Since when? | A few days |
   | How bad is it right now? | Uncomfortable |
   | Does anything make it better or worse? | *type* Worse in the afternoon |
   | What, if anything, have you already used for it? | *type* Nothing |
   | Long-term conditions, allergies or pregnancy? | *type* None that I know of |
   | Where in your head is it? | **One side** |
   | Is light or noise bothering you? | **Light bothers me** |
   | Have you felt sick or vomited with it? | Neither |
   | Has anything changed with your sight? | No |
   | Have you felt dizzy with it? | **Yes** |
   | Have you had any nosebleeds lately? | **Yes, in the last week** |
   | Is there fever, chills or a sore throat with it? | None of these |
   | Have you been in a malaria area in the last few weeks? | No |
   | Have you had a knock or a fall onto your head recently? | No |
   | Do you know your usual blood pressure, or are you on pills for it? | **I am on pills for blood pressure** |

4. The notes card appears. Press **I have a reading**, type **168 over 104**, then choose **The patient's
   own device** as where it came from. The card shows the pair with devices.json's own sentence: from a
   device MyThuso did not issue, it guides a conversation and carries no clinical weight.
5. Press **Ask a nurse to look at this**. The card becomes *Your case*: her answers, her reading with its
   source, and who has the case ("on the nurses' list, and nobody has read it yet"). It says, in the
   contract's words, that what GilbertOne noticed and where it suggested she be seen are for the nurse and
   the doctor — **the patient never sees a finding or the suggestion**.

   *Point out:* the card says what the nurse decides, never that anything was arranged, and under it the
   preview line says nothing is booked from here. Had she typed an emergency word in any answer, the
   emergency answer would have stood with the numbers shown and the microphone closed. Had she given a pair
   at or above the line the knowledge base gives for urgent care with a warning feature, she would be given
   the same emergency answer, and the case would still open on the nurses' list with the emergency setting
   suggested, so a nurse takes it, confirms or overrides, and may hand it to a doctor.

## 2. The nurse — decides where

6. Close GilbertOne. Choose **Nurse** on the demo login, then **Cases** in her navigation.
7. The case file, under the **draft banner** naming the pathway and its version: her answers in the
   intake's order; *Consistent with, for you to confirm* — "Findings consistent with raised blood pressure
   (dizziness, a nosebleed and known hypertension), for a clinician to confirm", with *Behind it:
   Hypertension (cond-008)*, and the wording rule beside it; the reading, marked *Carries no clinical
   weight*; and *Where the pathway suggests the patient is seen*: **A home visit today**, because the
   reading is above the indicative range and the notes carry the blood-pressure features.
8. Press **Take this case**. Press **Choose a different setting**, pick *A video consultation* and press
   confirm without a reason: refused in the route's own sentence — *a setting other than the suggested one
   needs the nurse's reason, in her words*. Press **Keep the suggestion**, then **Confirm: A home visit
   today**.
9. Press **Repeat the reading**, choose *Thuso Kit instrument*, type **166** and **102**, **Record the
   reading**. The new row says *Carries clinical weight* — by `packages/catalog/devices.json`'s rule, worked
   out by the Devices domain, not by anything on this screen. (Choose *Simulated, no instrument* instead to
   show a reading that never carries weight.)
10. Press **Ask the doctor**. The case is handed to the clinical inbox; the screen names the events the
    engine would publish: `case.opened@1`, `case.setting_decided@1`, `case.handed_over@1`.

## 3. The doctor — decides what

11. Choose **Doctor**. The inbox row *CASE-0001* is named under the pathway, **Draft, not ratified**, its
    record not yet complete. Press **Open the case**.
12. The same file, with the nurse's decision under it and the readings as a trend once there are three or
    more (with two, the sentence says so). Under *Home Guidance outcome*, each of clinical.json's four
    outcomes is offered with *No ratified script* beside it: recording one reads nothing to the patient.
13. Write the consultation. S and O are seeded from the case; write *Clinical examination*, *Assessment —
    clinical impression*, **Diagnosis** (the doctor's alone — a nurse's form has no such field) and the
    *Treatment plan* in plain words the patient will read. Press **Sign consultation** before recording an
    outcome: refused — *Record the outcome before signing.* Choose **Urgent**, sign again.
14. The case closes; the plan is what the patient reads. Back in the inbox the record is complete, and the
    review can be signed only *as reviewed outside any protocol* — a draft is never claimed as followed.

## 4. The patient — reads the plan

15. Choose **Patient**, open GilbertOne, and ask **What did the doctor say?** (or press its chip). GilbertOne
    reads the plan exactly as the doctor wrote it, framed by the contract's sentences, and adds nothing:
    not the assessment, not the diagnosis.

## What the demonstration must not be mistaken for

- **Not triage.** No priority, no time to treatment, no ratified protocol. `packages/catalog/clinical.json`
  still refuses triage without a ratified triage protocol, and `apps/assistant-api/src/lib/triage-gate.ts`
  still refuses the guided-assessment routes.
- **Not a diagnosis.** A finding is *consistent with* something, for a clinician to confirm, and is never
  shown to the patient. The diagnosis field is the doctor's.
- **Not a real reading.** A home cuff and the simulator never carry clinical weight. A kit instrument's does,
  and in this preview its number is one the nurse types off a fictional instrument.
- **Not persistent.** The case is held in the tab's memory. A reload forgets it; nothing is stored.

Open: three of the emergency features the contract lists (a stiff neck, confusion, weakness on one side)
are not yet words in `packages/catalog/gilbert-emergency-terms.json`; adding them is a versioned change to
that file with a clinical reviewer. No clinician has reviewed the question set or the pathway; the review
pack lists both under F4.
