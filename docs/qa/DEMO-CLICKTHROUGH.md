# MyThuso funder demo — click-through checklist

**Demo:** Wednesday 7 October 2026  
**Rehearsal:** Tuesday 16:00 SAST  
**Code freeze:** Tuesday 18:00 SAST  
**Automated suite:** not in this repository — see *Running the suite* at the bottom before relying on it.
**Screenshots:** `/workspace/mythuso-demo-qa/<short-sha>/` (on the machine that ran the QA pass, not here)
**Open GilbertOne by clicking the launcher (“Ask GilbertOne”).** From PR #13 the `?open=assistant` deep link works too, but the launcher is the path this checklist walks.

This checklist is what Gilbert walks in the room. **Walk it by hand at the rehearsal** — the automated
suite named above was deliberately not taken onto `main` (only this presenter checklist was), so nothing
runs this path on a build in this checkout. The three demo screens it describes *did* land, in the merge
of `origin/main` at 10:27 on 6 October, which is after this checklist was written at 08:51 — so the
"shipping tomorrow" wording below is out of date and has been corrected.

Where GilbertOne's exact wording is still being locked, do not invent softer answers on stage.

**Step (d) and the Doctor workspace under "Before you present" both need `VITE_MYTHUSO_STAFF_PREVIEW`.**
Until 6 October it was set in one place in this repository — the test harness's own dev server — so a
build made any other way tree-shook the clinician console out of the bundle entirely, and
`/app/?role=doctor` opened the patient app instead: **Hello, Lerato** and **Nothing booked yet**, with
no **Review queue** and no message explaining why. The patient's More hub still offered a **Demo
login** row listing all six roles, and its staff buttons did nothing at all when pressed.
`deploy/deploy.sh` sets it on the build command now, so the deployed site carries it. A site you build
yourself reproduces the demo only if you build it the same way —
`VITE_MYTHUSO_STAFF_PREVIEW=true npm run build -w @mythuso/web` — and the way to tell in ten seconds
is that `/app/?role=doctor` opens a **Review queue**, not **Hello, Lerato**.

---

## Before you present (on the demo laptop, 10 minutes before)

1. Open the **Doctor workspace** once (`/app/?role=doctor`) and wait until its navigation shows, then go back to Home. The first open loads the workspace on demand and shows “Getting your workspace ready…”; opening it once first means the funders never see that screen. Do the same for the **Nurse** workspace if it is in the run.
2. Open `/app/` and confirm Home loads clean.
3. Open GilbertOne once and close it, so the consent gate is the only thing between the launcher and the chat.
4. Have `/status` ready in a tab for the “is this live?” question.

---

## What the presenter must NOT say

- That a visit is **really booked**, a nurse is **on the way**, or a nurse **agreed** to attend.
- That a **card was charged**, money moved, or a receipt is bank-grade.
- That **SOS / dispatch** reached a responder, or that MyThuso sent an ambulance.
- That the **video call is live**, that Jitsi (or any media stack) is open, or that camera/mic left the device for a real clinician.
- That a **doctor has reviewed** anything, that a **lab result is verified**, or that a **credential was confirmed** with SANC/HPCSA.
- That a **device is paired**, or that chart numbers are the patient's own live instruments.
- That a **scheme claim was submitted**.
- That a **governed Azure / language-model tier** is answering the patient on this path (refusals and classifier replies must stay off the “written by a language model” label).
- Any dose, diagnosis, or “take X tablets” — GilbertOne refuses dosing; do not fill the gap from the stage.

If asked “is this live?”, the honest line is: **preview / simulated — see `/status`**.

---

## (a) Home — Overview

1. Open `/app/` (patient, no role query needed).
2. Confirm the hero (“Nothing booked yet” or the next visit), **Quick actions**, **Your care team**, **If something is wrong now**.
3. If any chart, bpm/mmHg, or triage chip is visible, confirm a **Simulated** / **Demo data** / example label is beside it.
4. Confirm triage language, if present, is **nurse-led** — not “doctor has triaged”.

**Must appear:** clean load, key regions, no console red stack traces.  
**Must not appear:** “card charged”, “nurse dispatched”, live instrument claims without a Simulated mark.

---

## (b) Book care

1. From Home, click the **Vitals & chronic check** shortcut (or Book care → that service).
2. Walk **Continue** through Who → Where → Nurse → When → Payment → Review (six steps).
3. Tick the confirmation checkbox and confirm.
4. On the success sheet, read aloud the simulation notice (catalogue: payment is simulated; roster is simulated).

**From PR #13:** the confirmation shows **Simulated** above **Paid**, with the headline “Visit confirmed (simulated)”. Read the simulation notice before the “Paid” line.

**Must appear:** step progress, price from the catalogue, **Payment is simulated…** (or the booking simulation notice).  
**Must not say:** “we have sent a nurse”, “your card has been charged for real”.

Optional: open **Book care** catalogue and point at **Preview · No real visit is booked here**.

---

## (c) GilbertOne — typed only (never voice)

1. Click **Ask GilbertOne** (launcher).
2. On **Before you continue**, tick **I understand GilbertOne is not a doctor.** (and **I know what to do in an emergency.** if shown), then **I Accept and Continue**.
3. Type (do not use the microphone button; it is there by design, the demo just doesn't use it):

| You type | What should appear | Notes |
|---|---|---|
| `Hello` | “Hello! I am GilbertOne, your health assistant. I can help you arrange care, understand information you received, or speak to a nurse. What would you like to do?” | Locked by GilbertOne |
| `I have chest pains` | “You mentioned something Thuso SOS treats as an emergency:” then **10177** and **112** as tap-to-call, plus **Open Thuso SOS** | From Thuso SOS / golden set |
| Press **Talk to a nurse** | Card titled “What the nurse queue would receive”, with “Nothing has gone yet. Press the button and this summary goes to a simulated nurse queue, not to a nurse.” | Locked by GilbertOne |
| `How many paracetamol can I take?` | “I cannot tell you what you have or what to take. I am not a clinician, and I do not diagnose or prescribe. That decision belongs to a registered nurse or doctor, and MyThuso can arrange one.” with a **Talk to a nurse** button | Must **not** show “An answer written by a language model” |

**Must not:** open the mic, claim GilbertOne is a doctor, ad-lib a dose, or ask about heartburn (no reviewed answer yet, so it falls back to “can't assess”).

**If a funder asks about the header line “Your Thuso AI Doctor · not a person, and not a doctor”:** “GilbertOne gives orientation and notes only. A nurse or doctor makes every clinical call.”

**From PR #13:** emergency numbers inside the answer are tap-to-call, like the public panel.

---

## (d) Video consult simulation

### Now on main (merged 6 October 2026, after this checklist was written)

These screens **have landed** — `apps/web/src/features/VideoConsultDemo.tsx` (220 lines) and
`ClinicianConsoleDemo.tsx` (326 lines), with `BookCare.tsx` (278 lines) for step (b) above. They arrived
in the merge of `origin/main`, so the wording that follows was written against the design mock-ups and
has **not yet been walked against the merged screens.** Check each line at the rehearsal rather than
trusting it — the mock-up and the shipped screen can differ, and the presenter is the one who finds out:

1. **Patient consent**: “Before you join”, Booklet 10, **Demo simulation** badge; **Join call** locked until **I understand**.
2. **Patient call**: **Demo simulation • not a live call**; controls **Mute / Camera / Leave** only; vitals labelled **Demo data**.
3. **Clinician console**: **Demo data**, **nurse-led** triage (Priority Low/Medium/High), vitals **Simulated stream**.

### The pre-existing teleconsultation path (still show these)

1. Switch to **Doctor** → **Teleconsultation**.
2. Point at the teleconsultation simulation notice.
3. Consent checkboxes → visit code `482190` → Open the call → **Skip the wait**.
4. Point at the simulated room / ThusoIQ sandbox / **Simulated** vitals mark.
5. Back on patient Home, open GilbertOne and note the **still** face (orientation, not a live video of a clinician).

---

## (e) Offline resilience (for rehearsal confidence)

With the network offline, typed emergency and dosing questions must still answer from the on-device / deterministic half. Emergency numbers stay on screen as text in the answer, with tap-to-call `tel:` links in the panel footer. Do not demonstrate voice offline.

---

## Don't-claim truth table

Source of truth: `packages/catalog/capabilities.json` and `/status`.

| Topic | Catalog state (at freeze) | Honest line |
|---|---|---|
| Booking | simulated | Preview; fictional roster |
| Payments | simulated | No card charged |
| Dispatch / SOS | simulated / emergency copy | Numbers to dial yourself |
| Video call | simulated | No camera/mic session |
| Doctor review | absent | Nobody reviewed |
| Lab results | absent | No lab connected |
| Credentials | simulated | Not confirmed with the regulator |
| Devices | simulated | No instrument paired |
| Scheme claims | absent | Nothing submitted |
| Language-model tier | not the patient default on this path | Refusals/classifier stay unlabelled as model output |

---

## Running the suite

**The suite is not in this checkout.** It lives on `tester/demo-clickthrough`, and the commands below
name a different machine's paths (`/workspace/mythuso-tester`, a node install under `/tmp`). Only this
presenter checklist was taken onto `main` — deliberately, so that a build here does not claim to be
running an automated check it cannot run.

If you do want the automated path, check it out beside this tree rather than merging it in:

```bash
git fetch origin tester/demo-clickthrough
git show origin/tester/demo-clickthrough:tests/demo-clickthrough.spec.ts   # read it first
```

Its own header says the cases for the three new screens were `test.fixme` at the time it was written,
because those screens did not exist yet. They exist now, so the spec as it stands on that branch is
**skipping the very screens the demo depends on** and needs un-fixing before it proves anything.

What this checkout does run, and what was verified after the merge:

```bash
npm run check              # typecheck all ten workspaces
node scripts/check-boundaries.mjs
npm run build -w @mythuso/web && node scripts/check-bundle-budget.mjs
npm test                   # the existing Playwright suite, including tests/book-care.spec.ts,
                           # tests/video-consult-demo.spec.ts and tests/clinician-console-demo.spec.ts
                           # which arrived with the demo screens in the same merge
```

Those three spec files **are** on `main` and do cover the demo screens. They are the automated check to
rely on for the rehearsal; the file named at the top of this document is not.
